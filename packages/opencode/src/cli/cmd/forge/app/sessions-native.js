// Motor de sessão nativo do Windows, sem tmux. node-pty já suporta Windows
// de verdade via ConPTY (mesma lib que o terminal integrado do VS Code usa
// lá) -- spawna o processo direto, sem sessão de terminal separada no meio.
//
// Trade-off aceito: sem um processo tmux separado segurando a sessão, ela
// vive dentro do próprio processo do FORGE. Reiniciar o serviço (ex: ao
// atualizar o FORGE) mata sessões abertas -- mas opencode/claude já
// persistem a conversa em disco e retomam sozinhos com --continue, então só
// se perde o estado bruto do terminal (diretório em que você tinha entrado
// manualmente etc.), não o histórico.
const pty = require('node-pty')

// o processo spawnado (powershell/opencode/claude) não precisa do token do FORGE --
// sem isso ele aparece em claro em qualquer scrollback/histórico do terminal.
const CHILD_ENV = { ...process.env }; delete CHILD_ENV.FORGE_TOKEN

const RING_MAX = 64 * 1024 // equivalente ao 'tmux capture-pane -S -40' -- o suficiente pra
// re-popular a tela de quem acabou de reconectar sem guardar o historico todo em memoria.
const sessions = new Map() // chave: "nome:kind" -> { pty, ring, lastActivity, clients, exited }

const keyOf = (name, kind) => name + ':' + (kind || '')
const kindOf = (mode) =>
  mode === 'shell' ? 'sh' : mode === 'claude' || mode === 'claude-new' ? 'claude' : mode === 'coordinator' ? 'coordinator' : ''

function pushRing(s, chunk) {
  s.ring += chunk
  if (s.ring.length > RING_MAX) s.ring = s.ring.slice(-RING_MAX)
}

function info(name) {
  // sessão default (sem kind) representa "viva" pro dashboard, igual ao
  // sess(name) sem kind do motor tmux.
  const s = sessions.get(keyOf(name, ''))
  const alive = !!(s && !s.exited)
  const snap = s
    ? s.ring
        .split('\n')
        .map((l) => l.trimEnd())
        .filter(Boolean)
        .slice(-4)
    : []
  return { alive, snap, last: s ? Math.floor(s.lastActivity / 1000) : null }
}

function isThinking(name) {
  const s = sessions.get(keyOf(name, ''))
  if (!s || s.exited) return false
  return Date.now() - s.lastActivity < 4000
}

function killAll(name) {
  ;['', 'sh', 'claude', 'coordinator'].forEach((kind) => {
    const key = keyOf(name, kind)
    const s = sessions.get(key)
    if (s) {
      try {
        s.pty.kill()
      } catch {}
      sessions.delete(key)
    }
  })
}

// `npm install -g` no Windows instala em pasta do PERFIL do usuário que
// rodou o instalador (ex: C:\Users\x\AppData\Roaming\npm) -- invisível pro
// Serviço do Windows, que roda como LocalSystem (outra conta, outro
// profile). win-native-install.ps1 resolve o caminho completo na hora da
// instalação (quando "opencode"/"claude" ainda resolvem via PATH do
// usuário) e passa via OPENCODE_BIN/CLAUDE_BIN -- usa isso em vez do nome
// pelado. Além disso, o opencode vira um wrapper .ps1 (não um .exe direto)
// -- não dá pra passar pro node-pty como executável puro (não tem
// associação de PATHEXT pra .ps1 por design de segurança do Windows);
// precisa ir via `powershell.exe -Command`, que resolve .ps1/.exe igual.
// Confirmado ao vivo no PC do escritório: a Execution Policy padrão de
// muita instalação Windows ("Restricted") bloqueia QUALQUER .ps1, mesmo
// via `& 'caminho'` -- `-ExecutionPolicy Bypass` restringe isso só a
// este processo (não muda nada no sistema), mesmo padrão já usado nos
// scripts de instalação.
function winCommand(mode) {
  const opencodeBin = process.env.OPENCODE_BIN || 'opencode'
  const claudeBin = process.env.CLAUDE_BIN || 'claude'
  if (mode === 'shell') return { file: 'powershell.exe', args: ['-ExecutionPolicy', 'Bypass'] }
  const inner =
    mode === 'new'
      ? `& '${opencodeBin}'`
      : mode === 'claude-new'
        ? `& '${claudeBin}'`
        : mode === 'claude'
          ? `& '${claudeBin}' --continue`
          : mode === 'coordinator'
            ? `& '${opencodeBin}' --continue --agent coordinator`
            : `& '${opencodeBin}' --continue`
  return { file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', inner] }
}

function attachWs(ws, project, mode, cols, rows, notify, extraEnv) {
  const kind = kindOf(mode)
  const key = keyOf(project.name, kind)
  let s = sessions.get(key)
  if (!s || s.exited) {
    const { file, args } = winCommand(mode)
    // só o coordenador recebe FORGE_TOKEN/PORT de volta no ambiente -- ele
    // precisa se autenticar na própria API local pra descobrir o resto do
    // mesh (server.js passa isso via extraEnv só pra mode:'coordinator').
    // Toda outra sessão (shell/opencode/claude) continua sem o token.
    const env = mode === 'coordinator' && extraEnv ? { ...CHILD_ENV, ...extraEnv } : CHILD_ENV
    let term
    try {
      term = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: project.path,
        env, // Windows já popula USERPROFILE/HOME certo, sem o truque que o lado Linux precisa
      })
    } catch (e) {
      // não deixa um spawn falho (binário ausente etc) derrubar o processo
      // inteiro do FORGE -- só essa tentativa de sessão.
      ws.send('\r\n\x1b[31m[erro ao iniciar: ' + String(e.message || e) + ']\x1b[0m\r\n')
      ws.close()
      return
    }
    s = { pty: term, ring: '', lastActivity: Date.now(), clients: new Set(), exited: false }
    sessions.set(key, s)
    term.onData((d) => {
      s.lastActivity = Date.now()
      pushRing(s, d)
      if (d.includes('\x07')) notify(project.name, 'precisa de você').catch(() => {})
      s.clients.forEach((c) => c.readyState === 1 && c.send(d))
    })
    term.onExit(() => {
      s.exited = true
      s.clients.forEach((c) => c.close())
      sessions.delete(key)
    })
  } else if (cols && rows) {
    s.pty.resize(cols, rows)
  }
  s.clients.add(ws)
  if (s.ring) ws.send(s.ring) // replay do que já tinha na tela -- equivalente ao capture-pane do tmux
  ws.on('message', (raw) => {
    let x
    try {
      x = JSON.parse(raw)
    } catch {
      return
    }
    if (x.t === 'i' && typeof x.d === 'string') s.pty.write(x.d)
    else if (x.t === 'r') s.pty.resize(Math.max(2, x.cols | 0), Math.max(2, x.rows | 0))
  })
  ws.on('close', () => {
    s.clients.delete(ws) // só desanexa; o pty continua vivo em memória
  })
}

module.exports = { info, isThinking, killAll, attachWs }
