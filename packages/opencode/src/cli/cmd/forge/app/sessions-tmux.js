// Motor de sessão pra Linux/WSL: tmux dá sessão persistente (sobrevive a
// desconexão do cliente e até a updates do FORGE, já que é um processo
// separado) de graça. Extraído de server.js -- mesmo comportamento de
// sempre, só isolado atrás da interface { info, isThinking, killAll,
// attachWs } que server.js usa igual pros dois motores (tmux/nativo).
const { execFileSync } = require('child_process')
const os = require('os')
const pty = require('node-pty')

// o processo spawnado não precisa do token do FORGE -- sem isso ele aparece em
// claro em qualquer scrollback/histórico do terminal.
const CHILD_ENV = { ...process.env }; delete CHILD_ENV.FORGE_TOKEN

const sess = (n, kind) => 'forge-' + n.replace(/[^\w-]/g, '') + (kind ? '-' + kind : '')
const tmux = (...a) => {
  try {
    return execFileSync('tmux', a, { encoding: 'utf8' })
  } catch {
    return null
  }
}

function info(name) {
  const s = sess(name)
  const alive = tmux('has-session', '-t', '=' + s) !== null
  const cap = alive ? tmux('capture-pane', '-p', '-t', s, '-S', '-40') : null
  const snap = (cap || '').split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-4)
  // session_activity só é atualizado por tmux enquanto existe (ou existiu) um cliente
  // anexado -- window_activity é o que de fato acompanha cada byte de saída do pane,
  // anexado ou não, então é o sinal certo tanto pra "parou há" quanto pra "pensando".
  const act = alive ? +tmux('display', '-p', '-t', s, '#{window_activity}') : 0
  return { alive, snap, last: act || null }
}

// cada sessão tmux do FORGE tem uma única janela (um comando só), então window_activity
// dela já é exatamente a última vez que o processo escreveu algo no pty -- funciona mesmo
// com o usuário fora da tela do terminal, sem precisar manter um pty extra só pra escutar.
function isThinking(name) {
  const s = sess(name)
  if (tmux('has-session', '-t', '=' + s) === null) return false
  const act = +tmux('display', '-p', '-t', s, '#{window_activity}')
  return !!(act && Date.now() / 1000 - act < 4)
}

function killAll(name) {
  ;['', 'sh', 'claude'].forEach((k) => tmux('kill-session', '-t', '=' + sess(name, k)))
}

function attachWs(ws, project, mode, cols, rows, notify) {
  // cada CLI (opencode/claude/shell) fica numa sessão tmux própria -- "continue" de um
  // nunca reanexa sem querer na sessão de outro.
  const kind = mode === 'shell' ? 'sh' : mode === 'claude' || mode === 'claude-new' ? 'claude' : ''
  const cmd =
    mode === 'shell'
      ? 'bash'
      : mode === 'new'
        ? 'opencode'
        : mode === 'claude-new'
          ? 'claude'
          : mode === 'claude'
            ? 'claude --continue'
            : 'opencode --continue'
  // new -A: cria a sessão ou reanexa à que já existe
  let term
  try {
    term = pty.spawn('tmux', ['new-session', '-A', '-s', sess(project.name, kind), '-c', project.path, cmd], {
      // systemd (sem User= explicito) nao preenche HOME -- sem ele, CLIs como o claude
      // nao acham ~/.claude mesmo com os arquivos la, e caem direto numa tela de login.
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: project.path,
      env: { ...CHILD_ENV, HOME: os.homedir() },
    })
  } catch (e) {
    // sem isso, tmux ausente/PATH quebrado derruba o processo INTEIRO do
    // FORGE (todas as sessões de todos os projetos), não só esta tentativa
    // -- mesmo risco que já foi corrigido no motor nativo do Windows, achado
    // numa revisão de código comparando os dois motores lado a lado.
    ws.send('\r\n\x1b[31m[erro ao iniciar: ' + String(e.message || e) + ']\x1b[0m\r\n')
    ws.close()
    return
  }
  term.onData((d) => {
    if (d.includes('\x07')) notify(project.name, 'precisa de você').catch(() => {})
    ws.readyState === 1 && ws.send(d)
  })
  term.onExit(() => ws.close())
  ws.on('message', (raw) => {
    let x
    try {
      x = JSON.parse(raw)
    } catch {
      return
    }
    if (x.t === 'i' && typeof x.d === 'string') term.write(x.d)
    else if (x.t === 'r') term.resize(Math.max(2, x.cols | 0), Math.max(2, x.rows | 0))
  })
  ws.on('close', () => term && term.kill()) // só desanexa; a sessão tmux segue viva
}

module.exports = { info, isThinking, killAll, attachWs }
