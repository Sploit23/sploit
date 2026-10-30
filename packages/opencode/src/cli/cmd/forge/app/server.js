// FORGE server — Linux + tmux + opencode no PATH
// npm i ws node-pty   |   FORGE_TOKEN=<24+ chars> node server.js
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const crypto = require('crypto'), { execFileSync, execFile, spawn } = require('child_process');
const { Readable } = require('stream');
const { WebSocketServer } = require('ws'), webpush = require('web-push');
const mcpCoordinator = require('./mcp-coordinator');

// Linux/WSL usa tmux (sessão sobrevive a updates do FORGE, processo
// separado); Windows nativo usa um motor em memória próprio via ConPTY
// (node-pty), sem tmux no meio -- ver sessions-native.js pro trade-off.
const WIN = process.platform === 'win32';
const sessions = require(WIN ? './sessions-native' : './sessions-tmux');

// o Serviço do Windows só registra na config dele um conjunto FIXO de
// variáveis, decorado na hora do install (ver env: [...] em
// win-service.js) -- uma variável nova no .env (ex: FMM_ENGINE_DIR)
// nunca chegaria em process.env só reiniciando o serviço, precisaria
// reinstalar. Lendo o .env direto aqui, um restart normal já basta pra
// qualquer variável nova, sem precisar tocar em win-service.js de novo
// a cada uma. Nunca sobrescreve o que já veio de fora (serviço/shell).
(function loadDotEnv() {
  try {
    fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^([\w.-]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    });
  } catch {}
})();
const TOKEN = process.env.FORGE_TOKEN || '';
if (TOKEN.length < 24) { console.error('Defina FORGE_TOKEN com 24+ caracteres'); process.exit(1); }
// processos filhos (shell do /api/exec, sessões de terminal, xdotool) não precisam
// do token pra nada -- sem isso ele aparece em claro em todo scrollback/log deles.
const CHILD_ENV = { ...process.env }; delete CHILD_ENV.FORGE_TOKEN;
// 0.0.0.0, não 127.0.0.1 -- senão o processo nunca escuta em nenhum endereço
// alcançável por outra máquina, e /api/peers (que depende de sondar o /health
// de cada peer do Tailscale direto por IP) nunca encontra nada, mesmo com o
// Tailscale funcionando perfeitamente. /health é a única rota sem token; todo
// /api/* continua exigindo Bearer em qualquer rede que o PC estiver.
const HOST = process.env.HOST || '0.0.0.0', PORT = +process.env.PORT || 7777;
// projects.json é mantido pelo app. Projetos criados pelo celular ficam em ROOT.
const ROOT = path.resolve(process.env.FORGE_ROOT || path.join(os.homedir(), 'forge-projects'));
const TRASH = path.join(os.homedir(), '.forge-trash');
// pasta de chegada pra arquivo/pasta arrastado de outro PC pelo Explorer
// (diferente de ROOT: não é um projeto, não entra em PROJECTS) -- ao lado
// de ROOT em vez de os.homedir() pelo mesmo motivo do comentário de
// /api/browse: o Serviço roda como LocalSystem, cujo "home" é um perfil
// vazio que não é o do usuário de verdade.
const RECEIVED_ROOT = path.join(path.dirname(ROOT), 'forge-received');
const DB = path.join(__dirname, 'projects.json');
fs.mkdirSync(ROOT, { recursive: true });
let PROJECTS = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : [];
const save = () => fs.writeFileSync(DB, JSON.stringify(PROJECTS, null, 2));
// apelido só de exibição (ex: "Casa", "Escritório") -- nunca mexe no hostname
// real, que é o que o Tailscale/os.hostname() usam pra identificar a máquina
// de verdade (/health, /api/peers). Puramente cosmético.
const NAME_FILE = path.join(__dirname, 'device-name.txt');
const getDeviceName = () => { try { return fs.readFileSync(NAME_FILE, 'utf8').trim() || os.hostname() } catch { return os.hostname() } };
// qual CLI a pessoa quer como coordenador (opencode oficial ou Claude Code)
// -- puramente o que ela digita no terminal; o motor que executa a
// instrução num projeto-alvo (promptProject) continua sendo sempre o
// `opencode serve`, que é o único dos dois com API HTTP programável.
const CLI_FILE = path.join(__dirname, 'coordinator-cli.txt');
const getCoordinatorCli = () => { try { const v = fs.readFileSync(CLI_FILE, 'utf8').trim(); return v === 'claude' ? 'claude' : 'opencode' } catch { return 'opencode' } };
// Coordenador só aparece em PCs com o app de bandeja instalado (desktop
// de verdade na frente, não um PC controlado só remotamente). Detecta pela
// presença do electron.exe que o instalador baixa -- mesmo truque de
// enumerar C:\Users\* que o /api/browse usa, já que o Serviço roda como
// LocalSystem e não tem "o próprio" perfil de usuário pra olhar.
let desktopCache = { at: 0, value: false };
function isDesktopInstalled() {
  if (!WIN) return false;
  if (Date.now() - desktopCache.at < 5 * 60 * 1000) return desktopCache.value;
  let value = false;
  try {
    value = fs.readdirSync('C:\\Users', { withFileTypes: true })
      .filter(e => e.isDirectory())
      .some(e =>
        // instalação de produção (win-native-install.ps1)
        fs.existsSync(path.join('C:\\Users', e.name, 'AppData', 'Local', 'SploitForgeTray', 'electron', 'electron.exe')) ||
        // modo dev -- `bunx electron .` direto do repo (packages/forge-tray):
        // app.setName('forge-tray') faz o Electron criar essa pasta de userData
        // em vez da genérica %APPDATA%\Electron compartilhada.
        fs.existsSync(path.join('C:\\Users', e.name, 'AppData', 'Roaming', 'forge-tray')));
  } catch {}
  desktopCache = { at: Date.now(), value };
  return value;
}
// --- registro de outros FORGE que já se anunciaram (ver announceToPeers()) ---
// PC sem interface gráfica nenhuma não tem como ninguém copiar/colar token de
// lugar nenhum -- cada FORGE se apresenta sozinho pros outros da mesma rede
// Tailscale ao subir, e quem já souber de UM FORGE passa a enxergar todos que
// já se apresentaram entre si. /api/announce não exige token de propósito
// (mesmo nível de confiança que /health já tem hoje -- só diz "existo, meu
// token é X"); só LER essa lista (/api/known-devices) exige token de algum
// FORGE da rede.
const KNOWN_FILE = path.join(__dirname, 'known-devices.json');
let KNOWN = fs.existsSync(KNOWN_FILE) ? JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8')) : [];
const saveKnown = () => fs.writeFileSync(KNOWN_FILE, JSON.stringify(KNOWN, null, 2));
// mesma descoberta usada por /api/peers e por announceToPeers() -- sonda o
// /health de cada peer do Tailscale direto por IP, sem trocar token nenhum.
async function discoverForgePeers() {
  let peers = [];
  try { peers = Object.values(JSON.parse(await sh('tailscale', ['status', '--json'])).Peer || {}); } catch { return [] }
  const found = await Promise.all(peers.map(async p => {
    const ip = (p.TailscaleIPs || [])[0];
    if (!ip) return null;
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 800);
    try {
      const r = await fetch('http://' + ip + ':' + PORT + '/health', { signal: ctrl.signal });
      const j = r.ok ? await r.json() : null;
      return j && j.forge ? { hostname: p.HostName, dnsName: (p.DNSName || '').replace(/\.$/, ''), ip } : null;
    } catch { return null }
    finally { clearTimeout(t) }
  }));
  return found.filter(Boolean);
}
// anuncia pra cada FORGE já descoberto na rede quem eu sou -- roda no boot e
// periodicamente (pega PCs instalados depois). Sem isso, um PC sem tela
// nenhuma nunca aparece pra ninguém sem alguém copiar/colar token na mão.
async function announceToPeers() {
  let selfDns = '';
  try { selfDns = (JSON.parse(await sh('tailscale', ['status', '--json'])).Self || {}).DNSName || '' } catch {}
  selfDns = selfDns.replace(/\.$/, '');
  if (!selfDns) return;
  const peers = await discoverForgePeers();
  await Promise.all(peers.map(async p => {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 2000);
    try {
      await fetch('http://' + p.ip + ':' + PORT + '/api/announce', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ hostname: getDeviceName(), dnsName: selfDns, token: TOKEN }),
      });
    } catch {} finally { clearTimeout(t) }
  }));
}
// --- Notificação push (web push padrão, sem serviço de terceiro) ---
const VAPID_FILE = path.join(__dirname, '.push-vapid.json');
const SUBS_FILE = path.join(__dirname, 'push-subscriptions.json');
let VAPID = fs.existsSync(VAPID_FILE) ? JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8')) : null;
if (!VAPID) { VAPID = webpush.generateVAPIDKeys(); fs.writeFileSync(VAPID_FILE, JSON.stringify(VAPID)); }
webpush.setVapidDetails('mailto:forge@localhost', VAPID.publicKey, VAPID.privateKey);
let SUBS = fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) : [];
const saveSubs = () => fs.writeFileSync(SUBS_FILE, JSON.stringify(SUBS, null, 2));
const lastNotify = {};
async function notify(projectName, body) {
  const now = Date.now();
  if (now - (lastNotify[projectName] || 0) < 20000) return;
  lastNotify[projectName] = now;
  const payload = JSON.stringify({ title: 'Sploit-Forge · ' + projectName, body });
  const dead = [];
  await Promise.all(SUBS.map(s => webpush.sendNotification(s, payload).catch(e => {
    if (e.statusCode === 404 || e.statusCode === 410) dead.push(s);
  })));
  if (dead.length) { SUBS = SUBS.filter(s => !dead.includes(s)); saveSubs(); }
}
const inRoot = p => path.resolve(p).startsWith(ROOT + path.sep);
const readBody = req => new Promise(r => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); });
  req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } });
});
// Claude Code nomeia a pasta de sessao a partir do cwd absoluto, incluindo barras -> hifens.
// "/mnt/c/Users/x/proj" (visto de dentro da WSL) e "C:\Users\x\proj" (visto do Windows) sao o
// MESMO projeto fisico mas geram nomes de pasta diferentes -- sem essa ponte, "claude --continue"
// rodando pela WSL nunca acharia uma conversa que so existe do lado Windows.
function bridgeClaudeProjectDir(dir) {
  try {
    const m = dir.match(/^\/mnt\/([a-zA-Z])(\/.*)$/);
    if (!m) return;
    const winEncoded = m[1].toUpperCase() + '-' + m[2].replace(/\//g, '-');
    const mntEncoded = dir.replace(/\//g, '-');
    const base = path.join(os.homedir(), '.claude', 'projects');
    const winDir = path.join(base, winEncoded), mntDir = path.join(base, mntEncoded);
    if (fs.existsSync(winDir) && !fs.existsSync(mntDir)) fs.symlinkSync(winDir, mntDir);
  } catch {}
}
// --- Tela (Xvfb) e Preview (proxy) ---
const X = { ...CHILD_ENV, DISPLAY: process.env.FORGE_DISPLAY || ':99' };
const sh = (cmd, args, o = {}) => new Promise((done, fail) =>
  execFile(cmd, args, { env: X, timeout: 8000, maxBuffer: 3e7, ...o }, (e, out) => e ? fail(e) : done(out)));
const cookieOk = req => {
  try { const m = (req.headers.cookie || '').match(/(?:^|;\s*)forge=([^;]+)/); return !!m && ok(decodeURIComponent(m[1])); }
  catch { return false; }
};
const previewTarget = req => {
  const m = (req.url || '').match(/^\/p\/(\d{4,5})(\/.*)?$/);
  return m && +m[1] !== PORT && +m[1] < 65536 ? { port: +m[1], rest: m[2] || '/' } : null;
};
const fwd = (req, port) => ({ ...req.headers, host: '127.0.0.1:' + port, cookie: (req.headers.cookie || '').replace(/forge=[^;]*;?\s*/, '') });
function proxy(req, res, t) {
  const up = http.request({ host: '127.0.0.1', port: t.port, path: t.rest, method: req.method, headers: fwd(req, t.port) },
    r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('nada rodando na porta ' + t.port); });
  req.pipe(up);
}
function moveToTrash(p) {
  fs.mkdirSync(TRASH, { recursive: true });
  const dest = path.join(TRASH, p.name + '-' + Date.now());
  try { fs.renameSync(p.path, dest); }
  catch { fs.cpSync(p.path, dest, { recursive: true }); fs.rmSync(p.path, { recursive: true, force: true }); }
}

const ok = t => typeof t === 'string' && t.length === TOKEN.length &&
  crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));

// os.loadavg() sempre devolve zero no Windows (não é um conceito que existe
// lá) -- amostragem por delta nos ticks de os.cpus() funciona igual nos dois
// SOs e é mais precisa que loadavg de qualquer forma.
let lastCpuSample = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const prev = lastCpuSample[i] ? lastCpuSample[i].times : c.times;
    const idleDelta = c.times.idle - prev.idle;
    const totalDelta = Object.values(c.times).reduce((a, b) => a + b, 0) - Object.values(prev).reduce((a, b) => a + b, 0);
    idle += idleDelta; total += totalDelta;
  });
  lastCpuSample = now;
  return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
}

function projectInfo(p) {
  const { alive, snap, last } = sessions.info(p.name);
  let dirty = null; // arquivos sem commit (aviso antes de apagar)
  try { dirty = execFileSync('git', ['-C', p.path, 'status', '--porcelain'], { encoding: 'utf8' }).split('\n').filter(Boolean).length; } catch {}
  return { name: p.name, path: p.path, alive, snap, last, dirty };
}

const ICON_GRAD = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7cff"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>';
// ícone "any" (cantos arredondados, como aparece hoje) + "maskable" (sem
// cantos, glifo menor/centrado -- Android/iOS recortam em formatos
// diferentes, sem a versão maskable o ">_" fica cortado em alguns launchers)
const ICON_ANY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111827"/>${ICON_GRAD}<text x="32" y="43" font-size="34" font-family="monospace" font-weight="700" fill="url(#g)" text-anchor="middle">&gt;_</text></svg>`;
const ICON_MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#111827"/>${ICON_GRAD}<text x="32" y="39" font-size="22" font-family="monospace" font-weight="700" fill="url(#g)" text-anchor="middle">&gt;_</text></svg>`;
const ICON_ANY = 'data:image/svg+xml,' + encodeURIComponent(ICON_ANY_SVG);
const ICON_MASKABLE = 'data:image/svg+xml,' + encodeURIComponent(ICON_MASKABLE_SVG);
const MANIFEST = JSON.stringify({
  name: 'Sploit-Forge Private Node', short_name: 'Sploit-Forge', start_url: '/', display: 'standalone',
  background_color: '#111827', theme_color: '#111827',
  icons: [
    { src: ICON_ANY, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: ICON_MASKABLE, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
  ]
});
const SW = `const C='forge-v1';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.add('/'))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.pathname.startsWith('/api'))return;
e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r}).catch(()=>caches.match(e.request)))});
self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch{}
e.waitUntil(self.registration.showNotification(d.title||'Sploit-Forge',{body:d.body||'',tag:'forge'}))});
self.addEventListener('notificationclick',e=>{e.notification.close();
e.waitUntil(clients.matchAll({type:'window'}).then(cs=>{const c=cs.find(x=>x.url.includes(location.origin));if(c)return c.focus();return clients.openWindow('/')}))});`;

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (type, body, code = 200) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  const pt = previewTarget(req);
  if (pt) return cookieOk(req) ? proxy(req, res, pt) : send('text/plain', 'não autorizado', 401);
  if (u.pathname === '/') return send('text/html; charset=utf-8', fs.readFileSync(path.join(__dirname, 'index.html')));
  if (u.pathname === '/manifest.webmanifest') return send('application/manifest+json', MANIFEST);
  if (u.pathname === '/sw.js') return send('text/javascript', SW);
  // iOS não lê o ícone do manifest.json pra "Adicionar à Tela de Início" --
  // precisa de um <link rel="apple-touch-icon"> explícito apontando pra isso.
  if (u.pathname === '/icon.svg') return send('image/svg+xml', ICON_ANY_SVG);
  // sem token: só pra outro FORGE na mesma rede Tailscale se reconhecer (ver /api/peers)
  if (u.pathname === '/health') return send('application/json', JSON.stringify({ forge: true, name: getDeviceName() }));
  // sem token de propósito -- ver comentário em KNOWN_FILE acima. Só grava
  // "existo, meu token é X"; nunca devolve nada, nunca lê o registro (isso é
  // /api/known-devices, autenticado).
  if (u.pathname === '/api/announce' && req.method === 'POST') {
    const b = await readBody(req);
    const hostname = String(b.hostname || '').trim().slice(0, 64);
    const dnsName = String(b.dnsName || '').trim().slice(0, 253);
    const token = String(b.token || '').trim();
    if (!hostname || !dnsName || token.length < 16) return send('application/json', '{"error":"dados inválidos"}', 400);
    const isNew = !KNOWN.some(d => d.dnsName === dnsName);
    KNOWN = [...KNOWN.filter(d => d.dnsName !== dnsName), { hostname, dnsName, token, announcedAt: Date.now() }];
    saveKnown();
    // reciprocidade na hora -- sem isso, um PC novo só aparecia pros outros
    // no próximo ciclo periódico deles (era de 1h), podendo levar até 1h
    // pra malha convergir nos dois sentidos. Só dispara pra quem é
    // GENUINAMENTE novo (senão todo anúncio repetido virava um ping-pong
    // infinito entre dois nós se respondendo um ao outro sem parar).
    if (isNew) void announceToPeers();
    return send('application/json', '{"ok":true}');
  }
  // servidor MCP do coordenador -- fora do /api/* de propósito (não é JSON
  // simples, o SDK assume controle total de req/res pro handshake MCP),
  // mas com o mesmo Bearer de sempre. Ver mcp-coordinator.js.
  if (u.pathname === '/mcp' && req.method === 'POST') {
    if (!ok((req.headers.authorization || '').replace('Bearer ', ''))) return send('application/json', '{"error":401}', 401);
    try { return await mcpCoordinator.handleMcpRequest(req, res, { token: TOKEN, port: PORT }); }
    catch (e) { return send('application/json', JSON.stringify({ error: String(e.message || e) }), 500); }
  }
  // vendored locally -- never depend on an external CDN being reachable at runtime
  if (u.pathname === '/vendor/xterm.min.js') return send('text/javascript', fs.readFileSync(path.join(__dirname, 'vendor/xterm.min.js')));
  if (u.pathname === '/vendor/xterm.min.css') return send('text/css', fs.readFileSync(path.join(__dirname, 'vendor/xterm.min.css')));
  if (u.pathname === '/vendor/xterm-addon-fit.min.js') return send('text/javascript', fs.readFileSync(path.join(__dirname, 'vendor/xterm-addon-fit.min.js')));
  if (u.pathname === '/vendor/qrcode.min.js') return send('text/javascript', fs.readFileSync(path.join(__dirname, 'vendor/qrcode.min.js')));
  if (u.pathname.startsWith('/api/')) {
    if (!ok((req.headers.authorization || '').replace('Bearer ', ''))) return send('application/json', '{"error":401}', 401);
    const J = (o, c) => send('application/json', JSON.stringify(o), c);
    try {
      if (u.pathname === '/api/projects' && req.method === 'GET') return J(PROJECTS.map(projectInfo));
      if (u.pathname === '/api/exec' && req.method === 'POST') {
        // canal "limpo" pra rodar um comando e ja receber stdout/stderr/code de
        // volta, sem precisar anexar no tmux interativo (que e pensado pra
        // humano digitando/lendo tela, nao pra automacao). Mesmo nivel de
        // acesso que o terminal ja da a quem tem o token -- nao e superficie
        // nova, so um jeito mais direto de usar o que ja existe.
        const b = await readBody(req);
        const p = PROJECTS.find(x => x.name === b.project);
        if (!p) return J({ error: 'projeto não encontrado' }, 404);
        const shellBin = WIN ? 'powershell.exe' : 'bash';
        const shellArgs = WIN ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', String(b.cmd || '')] : ['-c', String(b.cmd || '')];
        const r = await new Promise(done => {
          execFile(shellBin, shellArgs, { cwd: p.path, timeout: 60000, maxBuffer: 10 * 1024 * 1024, env: CHILD_ENV },
            (err, stdout, stderr) => done({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
        });
        return J(r);
      }
      if (u.pathname === '/api/activity' && req.method === 'GET') {
        // polling leve (sem capture-pane/git status) pra animar o ponto de "pensando" nos
        // cards do dashboard sem o custo de /api/projects inteiro a cada 2s.
        const out = {}; PROJECTS.forEach(p => { out[p.name] = sessions.isThinking(p.name); }); return J(out);
      }
      if (u.pathname === '/api/peers' && req.method === 'GET') {
        // outras máquinas da mesma rede Tailscale que também têm um FORGE rodando.
        // nunca troca token entre instâncias -- só "existo" (ver /health).
        return J(await discoverForgePeers());
      }
      if (u.pathname === '/api/known-devices' && req.method === 'GET') {
        // diferente de /api/peers: isso tem token de cada um (ver /api/announce).
        // Autenticado -- só quem já tem token de ALGUM FORGE da rede lê esta lista.
        return J(KNOWN);
      }
      if (u.pathname === '/api/all-projects' && req.method === 'GET') {
        // lista unificada cross-PC pra tela "Projetos" -- mesma descoberta
        // ao vivo que list_projects do MCP já faz (local + /api/known-devices
        // + /api/projects de cada um), reusada daqui pra não duplicar lógica
        // entre "o Coordenador fala sozinho" e "a pessoa toca num ícone".
        return J(await mcpCoordinator.listAllProjects({ token: TOKEN, port: PORT }));
      }
      if (u.pathname === '/api/coordinator/prompt' && req.method === 'POST') {
        // ponte pro dispatch remoto: outra máquina do mesh chama isso quando
        // o projeto que o coordenador dela resolveu vive aqui (ver dispatch
        // em mcp-coordinator.js). directory já vem resolvido -- quem chamou
        // já sabe o caminho via o /api/projects desta própria máquina.
        const b = await readBody(req);
        const directory = String(b.directory || '').trim();
        const instruction = String(b.instruction || '');
        if (!directory || !instruction) return J({ error: 'directory e instruction são obrigatórios' }, 400);
        try { return J({ reply: await promptProject(directory, instruction) }); }
        catch (e) { return J({ error: String(e.message || e).slice(0, 300) }); }
      }
      if (u.pathname === '/api/triagem' && req.method === 'POST') {
        // pergunta rápida/trivial pro motor local (CUDA, ver FMM_ENGINE_DIR) --
        // só existe de verdade na(s) máquina(s) que configuraram isso no
        // .env. Nas outras, em vez de só dizer "não configurado", procura
        // na malha quem tem (pedido explícito: o botão 🧠 tem que funcionar
        // de qualquer PC, sem precisar saber que é o Escritório que tem a
        // GPU). `relayed` evita um PC sem motor perguntar pro outro sem
        // motor que pergunte de volta pro primeiro -- só UM salto, nunca
        // um ping-pong infinito entre dois nós sem o motor.
        const b = await readBody(req);
        const question = String(b.question || '').trim();
        if (!question) return J({ error: 'question é obrigatória' }, 400);
        if (!FMM_ENGINE_DIR) {
          if (!b.relayed) {
            for (const dev of KNOWN) {
              try {
                const r = await fetch(`https://${dev.dnsName}/api/triagem`, {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + dev.token, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ question, relayed: true }),
                  signal: AbortSignal.timeout(60000),
                });
                if (r.ok) return J(await r.json());
              } catch {}
            }
          }
          return J({ error: 'motor local não configurado nesta máquina (nem achado na malha)' }, 501);
        }
        ensureFmmApi();
        if (!(await waitFmmApi())) return J({ error: 'motor local não respondeu a tempo' }, 504);
        try {
          const r = await fetch(`http://127.0.0.1:${FMM_API_PORT}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: question }),
            signal: AbortSignal.timeout(60000),
          });
          const j = await r.json();
          if (!r.ok) return J({ error: j.error || ('motor respondeu ' + r.status) }, 502);
          return J({ reply: j.text });
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      if (u.pathname === '/api/push-vapid-key' && req.method === 'GET') return J({ key: VAPID.publicKey });
      if (u.pathname === '/api/push-subscribe' && req.method === 'POST') {
        const sub = await readBody(req);
        if (!sub.endpoint) return J({ error: 'subscription inválida' }, 400);
        if (!SUBS.some(s => s.endpoint === sub.endpoint)) { SUBS.push(sub); saveSubs(); }
        return J({ ok: true });
      }
      if (u.pathname === '/api/push-subscribe' && req.method === 'DELETE') {
        const b = await readBody(req);
        SUBS = SUBS.filter(s => s.endpoint !== b.endpoint); saveSubs();
        return J({ ok: true });
      }
      if (u.pathname === '/api/preview-login' && req.method === 'POST') {
        res.setHeader('Set-Cookie', 'forge=' + encodeURIComponent(TOKEN) + '; HttpOnly; SameSite=Strict; Path=/p' +
          (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''));
        return J({ ok: true });
      }
      if (u.pathname === '/api/screen' && req.method === 'GET') {
        if (WIN) return J({ error: 'tela remota ainda não disponível nesta instalação' }, 501);
        return send('image/jpeg', await sh('import', ['-window', 'root', '-quality', '55', 'jpg:-'], { encoding: 'buffer' }));
      }
      if (u.pathname === '/api/screen/input' && req.method === 'POST') {
        if (WIN) return J({ error: 'tela remota ainda não disponível nesta instalação' }, 501);
        const b = await readBody(req);
        if (b.type === 'click') await sh('xdotool', ['mousemove', String(b.x | 0), String(b.y | 0), 'click', '1']);
        else if (b.type === 'scroll') await sh('xdotool', ['click', b.dy > 0 ? '5' : '4']);
        else if (b.type === 'text') await sh('xdotool', ['type', '--delay', '20', '--', String(b.text).slice(0, 500)]);
        else if (b.type === 'key') await sh('xdotool', ['key', String(b.key).replace(/[^\w+]/g, '')]);
        return J({ ok: true });
      }
      if (u.pathname === '/api/projects' && req.method === 'POST') {
        const b = await readBody(req), git = String(b.git || '').trim();
        let name = String(b.name || '').trim(), dir;
        if (b.path) {
          // registra uma pasta que já existe (vinda do navegador de pastas), em vez de criar uma nova
          dir = path.resolve(String(b.path));
          if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return J({ error: 'pasta não encontrada' }, 400);
          if (!name) name = (path.basename(dir).replace(/[^\w-]/g, '-').slice(0, 40)) || 'projeto';
          let n = name, i = 1;
          while (PROJECTS.some(p => p.name === n)) n = name.slice(0, 37) + '-' + (++i);
          name = n;
          bridgeClaudeProjectDir(dir);
        } else {
          if (!/^[\w-]{1,40}$/.test(name) || PROJECTS.some(p => p.name === name)) return J({ error: 'nome inválido ou já existe' }, 400);
          dir = path.join(ROOT, name);
          if (git) {
            if (!/^(https:\/\/|git@)[\w@.:\/~-]+$/.test(git)) return J({ error: 'url git inválida' }, 400);
            await new Promise((done, fail) => execFile('git', ['clone', '--', git, dir], { timeout: 120000 }, e => e ? fail(e) : done()));
          } else fs.mkdirSync(dir, { recursive: true });
        }
        PROJECTS.push({ name, path: dir }); save();
        return J({ ok: true });
      }
      if (u.pathname === '/api/browse' && req.method === 'GET') {
        const machine = u.searchParams.get('machine');
        if (machine) {
          // ver o Explorer de OUTRO PC sem trocar de link -- repassa pro
          // device certo usando o token dele (mesmo padrão de proxy já usado
          // pro DELETE/mover remoto de projeto e pra renomear device).
          const dev = KNOWN.find(k => k.dnsName === machine);
          if (!dev) return J({ error: 'dispositivo não conhecido' }, 404);
          const rp = u.searchParams.get('path');
          try {
            const r = await fetch(`https://${machine}/api/browse${rp ? '?path=' + encodeURIComponent(rp) : ''}`, {
              headers: { Authorization: 'Bearer ' + dev.token },
              signal: AbortSignal.timeout(15000),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
            return J(j);
          } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
        }
        const p = u.searchParams.get('path');
        if (!p) {
          const roots = [{ name: 'pasta do usuário', path: os.homedir(), kind: 'home' }];
          if (WIN) {
            // "Acesso rápido" igual o Explorer do Windows -- pastas padrão do
            // perfil, só as que realmente existem (perfis minimos/redirecionados
            // podem não ter todas). O serviço roda como LocalSystem
            // (os.homedir() cai no profile vazio do sistema, não no seu) --
            // olha os perfis reais em C:\Users em vez de só o do processo.
            const quick = [
              ['Área de trabalho', 'Desktop', 'desktop'],
              ['Documentos', 'Documents', 'documents'],
              ['Downloads', 'Downloads', 'downloads'],
              ['Imagens', 'Pictures', 'pictures'],
              ['Música', 'Music', 'music'],
              ['Vídeos', 'Videos', 'videos'],
            ];
            const SKIP = new Set(['public', 'default', 'default user', 'all users', 'defaultapppool']);
            let users = [];
            try {
              users = fs.readdirSync('C:\\Users', { withFileTypes: true })
                .filter(e => e.isDirectory() && !SKIP.has(e.name.toLowerCase()))
                .map(e => path.join('C:\\Users', e.name));
            } catch {}
            if (!users.length) users = [os.homedir()];
            users.forEach(userHome => {
              const prefix = users.length > 1 ? path.basename(userHome) + ' – ' : '';
              quick.forEach(([name, folder, kind]) => {
                const full = path.join(userHome, folder);
                if (fs.existsSync(full)) roots.push({ name: prefix + name, path: full, kind });
              });
            });
            for (let c = 65; c <= 90; c++) {
              const letter = String.fromCharCode(c) + ':\\';
              if (fs.existsSync(letter)) roots.push({ name: String.fromCharCode(c) + ':', path: letter, kind: 'drive' });
            }
          } else {
            try { fs.readdirSync('/mnt').forEach(d => roots.push({ name: d.toUpperCase() + ':', path: '/mnt/' + d, kind: 'drive' })) } catch {}
          }
          return J({ path: '', dirs: roots });
        }
        const dir = path.resolve(p);
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.name !== '.git' && e.name !== 'node_modules');
          const dirs = entries.filter(e => e.isDirectory())
            .map(e => { let modified = null; try { modified = fs.statSync(path.join(dir, e.name)).mtimeMs } catch {}; return { name: e.name, path: path.join(dir, e.name), modified } })
            .sort((a, b) => a.name.localeCompare(b.name));
          const files = entries.filter(e => e.isFile())
            .map(e => { let size = 0, modified = null; try { const st = fs.statSync(path.join(dir, e.name)); size = st.size; modified = st.mtimeMs } catch {}; return { name: e.name, path: path.join(dir, e.name), size, modified } })
            .sort((a, b) => a.name.localeCompare(b.name));
          return J({ path: dir, dirs, files });
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 400) }
      }
      if (u.pathname === '/api/download' && req.method === 'GET') {
        const p = u.searchParams.get('path');
        if (!p) return J({ error: 'path obrigatório' }, 400);
        const machine = u.searchParams.get('machine');
        if (machine) {
          const dev = KNOWN.find(k => k.dnsName === machine);
          if (!dev) return J({ error: 'dispositivo não conhecido' }, 404);
          try {
            const r = await fetch(`https://${machine}/api/download?path=${encodeURIComponent(p)}`, {
              headers: { Authorization: 'Bearer ' + dev.token },
              signal: AbortSignal.timeout(120000),
            });
            if (!r.ok) { const j = await r.json().catch(() => ({})); return J({ error: j.error || ('destino respondeu ' + r.status) }, 502) }
            res.writeHead(200, {
              'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
              'Content-Disposition': r.headers.get('content-disposition') || 'attachment',
            });
            Readable.fromWeb(r.body).pipe(res);
          } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
          return;
        }
        const target = path.resolve(p);
        let st; try { st = fs.statSync(target) } catch { return J({ error: 'não encontrado' }, 404) }
        if (st.isFile()) {
          // abre antes de prometer um 200 -- um arquivo que o SO trava pra
          // leitura direta (ex: hive de registro em uso, como o SAM) falha
          // aqui com um erro limpo em vez de uma exceção não tratada no meio
          // do stream (que podia derrubar o processo inteiro do FORGE depois
          // de já ter mandado os headers). Confirmado numa revisão de segurança.
          fs.open(target, 'r', (err, fd) => {
            if (err) return J({ error: 'não foi possível ler o arquivo' }, 500);
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + encodeURIComponent(path.basename(target)) + '"', 'Content-Length': st.size });
            const rs = fs.createReadStream(target, { fd });
            rs.on('error', () => res.end());
            rs.pipe(res);
          });
          return;
        }
        if (st.isDirectory()) {
          const name = path.basename(target) + '.tar.gz';
          res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Disposition': 'attachment; filename="' + encodeURIComponent(name) + '"' });
          const tar = spawn('tar', ['czf', '-', '-C', path.dirname(target), path.basename(target)]);
          tar.stdout.pipe(res);
          tar.on('error', () => res.end());
          return;
        }
        return J({ error: 'tipo não suportado' }, 400);
      }
      if (u.pathname === '/api/import' && req.method === 'POST') {
        // recebe um .tar.gz (vindo de outro FORGE, via /api/relay-send) e registra como projeto
        const name = (u.searchParams.get('name') || '').trim();
        if (!/^[\w-]{1,40}$/.test(name) || PROJECTS.some(p => p.name === name)) return J({ error: 'nome inválido ou já existe' }, 400);
        const dir = path.join(ROOT, name);
        fs.mkdirSync(dir, { recursive: true });
        const tar = spawn('tar', ['xzf', '-', '-C', dir, '--strip-components=1']);
        req.pipe(tar.stdin);
        tar.on('close', code => {
          if (code !== 0) return J({ error: 'falha ao extrair o pacote' }, 500);
          PROJECTS.push({ name, path: dir }); save();
          J({ ok: true });
        });
        tar.on('error', () => J({ error: 'tar indisponível' }, 500));
        return;
      }
      if (u.pathname === '/api/files-receive' && req.method === 'POST') {
        // recebe um arquivo OU pasta (vindo de outro FORGE, via /api/files/send
        // -- arrastar um ícone do Explorer até outro PC) e guarda em
        // RECEIVED_ROOT. Diferente de /api/import: nunca registra em
        // PROJECTS -- é só uma cópia solta, não uma unidade gerenciada.
        const rawName = (u.searchParams.get('name') || '').trim();
        const kind = u.searchParams.get('kind') === 'dir' ? 'dir' : 'file';
        const safeName = path.basename(rawName).slice(0, 200);
        if (!safeName || safeName === '.' || safeName === '..') return J({ error: 'nome inválido' }, 400);
        fs.mkdirSync(RECEIVED_ROOT, { recursive: true });
        let finalName = safeName, i = 1;
        while (fs.existsSync(path.join(RECEIVED_ROOT, finalName))) finalName = safeName + '-' + (i++);
        const dest = path.join(RECEIVED_ROOT, finalName);
        if (kind === 'dir') {
          fs.mkdirSync(dest, { recursive: true });
          const tar = spawn('tar', ['xzf', '-', '-C', dest, '--strip-components=1']);
          req.pipe(tar.stdin);
          tar.on('close', code => {
            if (code !== 0) return J({ error: 'falha ao extrair o pacote' }, 500);
            J({ ok: true, path: dest });
          });
          tar.on('error', () => J({ error: 'tar indisponível' }, 500));
          return;
        }
        const ws = fs.createWriteStream(dest);
        req.pipe(ws);
        ws.on('finish', () => J({ ok: true, path: dest }));
        ws.on('error', () => J({ error: 'falha ao salvar o arquivo' }, 500));
        return;
      }
      if (u.pathname === '/api/relay-send' && req.method === 'POST') {
        // o PC de origem empacota uma pasta local e entrega pro /api/import de outro FORGE --
        // chamada servidor-a-servidor (sem CORS), usando o token do destino que o celular já
        // tem salvo. Nenhum token fica guardado aqui, só passa por essa requisição.
        const b = await readBody(req);
        const srcPath = String(b.path || ''), targetUrl = String(b.targetUrl || '').replace(/\/$/, '');
        const targetToken = String(b.targetToken || ''), name = String(b.name || '').trim();
        if (!srcPath || !targetUrl || !targetToken || !/^[\w-]{1,40}$/.test(name)) return J({ error: 'parâmetros inválidos' }, 400);
        let st; try { st = fs.statSync(srcPath) } catch { return J({ error: 'pasta não encontrada' }, 404) }
        if (!st.isDirectory()) return J({ error: 'precisa ser uma pasta' }, 400);
        try {
          // node_modules é de longe o maior vilão de tamanho em qualquer
          // projeto JS/TS real (reproduzível com npm/bun install no
          // destino, não precisa viajar) -- exclui já evita a maior parte
          // do caso que derrubava o processo. O resto do problema era
          // acumular o .tar.gz inteiro num array de chunks + Buffer.concat
          // antes de mandar: pra uma pasta grande, isso sozinho já estoura
          // a memória do processo. Agora o stdout do tar vira o corpo do
          // fetch direto, streaming -- nunca fica tudo na memória de uma
          // vez, não importa o tamanho da pasta.
          const tar = spawn('tar', ['czf', '-', '--exclude=node_modules', '-C', path.dirname(srcPath), path.basename(srcPath)]);
          tar.on('error', (e) => { try { tar.stdout.destroy(e) } catch {} });
          const r = await fetch(targetUrl + '/api/import?name=' + encodeURIComponent(name), {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + targetToken, 'Content-Type': 'application/gzip' },
            body: Readable.toWeb(tar.stdout),
            duplex: 'half',
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
          return J({ ok: true });
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      if (u.pathname === '/api/files/send' && req.method === 'POST') {
        // arrastar um ícone de arquivo/pasta do Explorer até outro PC --
        // diferente de /transfer de projeto, isso é uma CÓPIA (não apaga a
        // origem): o Explorer navega o filesystem inteiro do usuário, não
        // só uma pasta gerenciada, então apagar sem pedir seria arriscado
        // demais. Pousa em RECEIVED_ROOT do destino via /api/files-receive.
        const b = await readBody(req);
        const srcPath = String(b.path || '');
        const toMachine = String(b.toMachine || '').trim();
        if (!srcPath || !toMachine) return J({ error: 'parâmetros inválidos' }, 400);
        const dev = KNOWN.find(k => k.dnsName === toMachine);
        if (!dev) return J({ error: 'dispositivo não conhecido' }, 404);
        let st; try { st = fs.statSync(srcPath) } catch { return J({ error: 'não encontrado' }, 404) }
        const name = path.basename(srcPath);
        try {
          if (st.isDirectory()) {
            const tar = spawn('tar', ['czf', '-', '--exclude=node_modules', '-C', path.dirname(srcPath), path.basename(srcPath)]);
            tar.on('error', (e) => { try { tar.stdout.destroy(e) } catch {} });
            const r = await fetch(`https://${toMachine}/api/files-receive?name=${encodeURIComponent(name)}&kind=dir`, {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + dev.token, 'Content-Type': 'application/gzip' },
              body: Readable.toWeb(tar.stdout),
              duplex: 'half',
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
            return J(j);
          }
          const rs = fs.createReadStream(srcPath);
          const r = await fetch(`https://${toMachine}/api/files-receive?name=${encodeURIComponent(name)}&kind=file`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + dev.token, 'Content-Type': 'application/octet-stream' },
            body: Readable.toWeb(rs),
            duplex: 'half',
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
          return J(j);
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      const m = u.pathname.match(/^\/api\/projects\/([\w-]+)$/);
      if (m && req.method === 'DELETE') {
        const p = PROJECTS.find(x => x.name === m[1]);
        if (!p) {
          // não existe nesta máquina -- pode viver em outro device do mesh
          // (a pessoa segurou o ícone dele no app sem trocar de PC pra
          // apagar/remover/encerrar sessão). Mesma resolução por alias que
          // /chat e /transfer já usam; o device remoto roda essa mesma
          // rota com o token dele, então reaplica inRoot() e tudo o mais aí.
          const mode = u.searchParams.get('mode') || '';
          try {
            const entries = await mcpCoordinator.listAllProjects({ token: TOKEN, port: PORT });
            const entry = entries.find(e => e.alias === m[1] && e.machine !== 'local');
            if (!entry) return J({ error: 'projeto não existe' }, 404);
            const r = await fetch(`https://${entry.machine}/api/projects/${encodeURIComponent(m[1])}?mode=${encodeURIComponent(mode)}`, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + entry.token },
              signal: AbortSignal.timeout(30000),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
            return J(j);
          } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
        }
        const mode = u.searchParams.get('mode'); // session | list | trash | hard
        if ((mode === 'trash' || mode === 'hard') && !inRoot(p.path))
          return J({ error: 'pasta fora de FORGE_ROOT: só é possível remover da lista' }, 403);
        sessions.killAll(p.name);
        if (mode === 'hard') fs.rmSync(p.path, { recursive: true, force: true });
        else if (mode === 'trash') moveToTrash(p);
        if (mode !== 'session') { PROJECTS = PROJECTS.filter(x => x !== p); save(); }
        return J({ ok: true });
      }
      const mChat = u.pathname.match(/^\/api\/projects\/([\w-]+)\/chat$/);
      if (mChat && req.method === 'POST') {
        // "iniciar conversa" focado num projeto só -- a pessoa já sabe qual
        // (tocou no ícone dele), sem precisar que o Coordenador "adivinhe".
        // Reusa a mesma resolução/despacho que a ferramenta MCP dispatch já
        // usa (local via promptProject, remoto via /api/coordinator/prompt).
        const b = await readBody(req);
        const instruction = String(b.instruction || '');
        if (!instruction) return J({ error: 'instruction é obrigatória' }, 400);
        try {
          const entries = await mcpCoordinator.listAllProjects({ token: TOKEN, port: PORT });
          const entry = entries.find(e => e.alias === mChat[1]);
          if (!entry) return J({ error: 'projeto não encontrado' }, 404);
          const reply = await mcpCoordinator.dispatchToProject(entry, instruction, { token: TOKEN, port: PORT });
          return J({ reply });
        } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, 500) }
      }
      const mTransfer = u.pathname.match(/^\/api\/projects\/([\w-]+)\/transfer$/);
      if (mTransfer && req.method === 'POST') {
        // arrastar um ícone de projeto até outro dispositivo -- diferente de
        // /api/relay-send (que só sabe mandar a PARTIR desta própria
        // máquina), isso funciona mesmo pra projeto que já vive em outra
        // máquina (via transferProjectTo, mesma lógica da ferramenta MCP
        // transfer_project).
        const b = await readBody(req);
        const toMachine = String(b.toMachine || '').trim();
        if (!toMachine) return J({ error: 'toMachine é obrigatório' }, 400);
        try {
          const entries = await mcpCoordinator.listAllProjects({ token: TOKEN, port: PORT });
          const entry = entries.find(e => e.alias === mTransfer[1]);
          if (!entry) return J({ error: 'projeto não encontrado' }, 404);
          const hostname = await mcpCoordinator.transferProjectTo(entry, toMachine, { token: TOKEN, port: PORT });
          return J({ ok: true, hostname });
        } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, 500) }
      }
    } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500); }
    if (u.pathname === '/api/device-name' && req.method === 'PUT') {
      const b = await readBody(req);
      const name = String(b.name || '').trim().slice(0, 40);
      if (!name) return J({ error: 'nome vazio' }, 400);
      const dnsName = String(b.dnsName || '').trim();
      if (dnsName) {
        // renomear OUTRO device (botão "renomear" em Pareamento) -- o nome é
        // dono de quem o usa, não de quem está olhando, então repassa pro
        // device certo com o token dele em vez de só guardar uma etiqueta
        // local que some ao trocar de PC (era exatamente isso que o usuário
        // reportou como inconsistente entre máquinas).
        const dev = KNOWN.find(k => k.dnsName === dnsName);
        if (!dev) return J({ error: 'dispositivo não conhecido' }, 404);
        try {
          const r = await fetch(`https://${dnsName}/api/device-name`, {
            method: 'PUT',
            headers: { Authorization: 'Bearer ' + dev.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
            signal: AbortSignal.timeout(15000),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
          return J(j);
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      fs.writeFileSync(NAME_FILE, name);
      void announceToPeers(); // propaga o novo nome pros outros já, sem esperar o ciclo de 1h
      return J({ ok: true, name });
    }
    if (u.pathname === '/api/check-updates' && req.method === 'POST') {
      // "atualizar agora" -- checkForUpdates() já roda sozinho no boot e a
      // cada poucos minutos, mas sem isso não tinha nenhum jeito de forçar
      // fora desse ciclo (era exatamente a reclamação original: toda
      // atualização minha exigia colar comando no PowerShell na mão).
      const b = await readBody(req).catch(() => ({}));
      const dnsName = String((b && b.dnsName) || '').trim();
      if (dnsName) {
        const dev = KNOWN.find(k => k.dnsName === dnsName);
        if (!dev) return J({ error: 'dispositivo não conhecido' }, 404);
        try {
          const r = await fetch(`https://${dnsName}/api/check-updates`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + dev.token },
            signal: AbortSignal.timeout(15000),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
          return J(j);
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      void checkForUpdates(); // fire-and-forget -- se reiniciar o serviço, a resposta já foi
      return J({ ok: true, checking: true });
    }
    if (u.pathname === '/api/update-log' && req.method === 'GET') {
      // diagnóstico de uma atualização que falhou silenciosamente -- sem
      // isso só dava pra saber o motivo entrando na máquina via /api/exec.
      try { return send('text/plain', fs.readFileSync(UPDATE_LOG, 'utf8')) }
      catch { return send('text/plain', '(nenhum log ainda)') }
    }
    if (u.pathname === '/api/coordinator-cli' && req.method === 'GET') {
      return J({ cli: getCoordinatorCli() });
    }
    if (u.pathname === '/api/coordinator-cli' && req.method === 'PUT') {
      const b = await readBody(req);
      const cli = b.cli === 'claude' ? 'claude' : 'opencode';
      fs.writeFileSync(CLI_FILE, cli);
      // a sessão do coordenador, uma vez spawnada, continua viva em
      // background mesmo depois que a pessoa "sai" da tela (ver comentário
      // no topo de sessions-native.js) -- sem matar aqui, trocar o CLI não
      // tinha efeito nenhum até o serviço reiniciar por outro motivo. Isso
      // mata a sessão atual; o cliente já conectado reconecta sozinho
      // (ws.onclose -> connectTermWs) e aí sim spawna com o CLI novo.
      sessions.killAll('coordinator');
      return J({ ok: true, cli });
    }
    if (u.pathname === '/api/stats') {
      const machine = u.searchParams.get('machine');
      if (machine) {
        // ver estatística de outro PC sem navegar pro link dele -- mesmo
        // proxy de sempre (resolve via KNOWN, repassa com o token do dono).
        const dev = KNOWN.find(k => k.dnsName === machine);
        if (!dev) return J({ error: 'dispositivo não conhecido' }, 404);
        try {
          const r = await fetch(`https://${machine}/api/stats`, {
            headers: { Authorization: 'Bearer ' + dev.token },
            signal: AbortSignal.timeout(8000),
          });
          const j = await r.json();
          if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
          return J(j);
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      return send('application/json', JSON.stringify({
        cpu: cpuPercent(),
        mem: (1 - os.freemem() / os.totalmem()) * 100, up: os.uptime(), host: getDeviceName(),
        screen: !WIN, // tela remota (Xvfb/xdotool) so existe no motor Linux por enquanto
        desktop: isDesktopInstalled() // Coordenador só aparece quando isso é true
      }));
    }
  }
  send('text/plain', 'not found', 404);
});

const wss = new WebSocketServer({ noServer: true });
srv.on('upgrade', (req, sock, head) => {
  const pt = previewTarget(req); // websocket (HMR) do site em preview
  if (pt) {
    if (!cookieOk(req)) return sock.destroy();
    const up = net.connect(pt.port, '127.0.0.1', () => {
      up.write(`${req.method} ${pt.rest} HTTP/1.1\r\n` + Object.entries(fwd(req, pt.port)).map(([k, v]) => k + ': ' + v).join('\r\n') + '\r\n\r\n');
      up.write(head); sock.pipe(up).pipe(sock);
    });
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
    return;
  }
  if (new URL(req.url, 'http://x').pathname !== '/ws') return sock.destroy();
  wss.handleUpgrade(req, sock, head, attach);
});

// pasta de trabalho fixa do coordenador -- não é um projeto que aparece
// em PROJECTS/explorer, é interna do próprio FORGE.
const COORD_DIR = path.join(ROOT, '.coordinator');

// Garante (idempotente, sem apagar outras entradas que a pessoa já tenha
// configurado ali) que a pasta do coordenador tenha os dois formatos de
// config de MCP remoto apontando pro /mcp deste próprio FORGE -- é isso
// que dá ao opencode oficial/Claude Code as ferramentas do coordenador,
// sem precisar de nenhum fork nem `--agent` especial.
function mergeJsonFile(filePath, mutate) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
  mutate(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
function ensureCoordinatorMcpConfig() {
  const url = `http://127.0.0.1:${PORT}/mcp`;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  try {
    mergeJsonFile(path.join(COORD_DIR, 'opencode.json'), (data) => {
      data.mcp = data.mcp || {};
      data.mcp['sploit-forge'] = { type: 'remote', url, headers };
    });
  } catch {}
  try {
    mergeJsonFile(path.join(COORD_DIR, '.mcp.json'), (data) => {
      data.mcpServers = data.mcpServers || {};
      data.mcpServers['sploit-forge'] = { type: 'http', url, headers };
    });
  } catch {}
}

function attach(ws) {
  const timeout = setTimeout(() => ws.close(), 5000);
  ws.once('message', m => {
    clearTimeout(timeout);
    let a; try { a = JSON.parse(m); } catch { return ws.close(); }
    if (a.t !== 'a' || !ok(a.token)) return ws.close();
    if (a.mode === 'coordinator') {
      if (!isDesktopInstalled()) return ws.close();
      fs.mkdirSync(COORD_DIR, { recursive: true });
      ensureCoordinatorMcpConfig();
      return sessions.attachWs(ws, { name: 'coordinator', path: COORD_DIR }, 'coordinator', a.cols, a.rows, notify, getCoordinatorCli());
    }
    const p = PROJECTS.find(x => x.name === a.project);
    if (!p) return ws.close();
    sessions.attachWs(ws, p, a.mode, a.cols, a.rows, notify);
  });
}

// --- auto-update: checa uma vez por dia (e no boot) se tem versão nova no
// GitHub e se atualiza sozinho. Só no Windows nativo por enquanto -- é onde
// o safe-restart (via win-service.js, Task Scheduler) já existe e é seguro;
// o caminho WSL/systemd fica pra depois se precisar.
const UPDATE_BASE = 'https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/';
const UPDATE_FILES = ['server.js', 'index.html', 'sessions-native.js', 'win-service.js', 'mcp-coordinator.js'];
// toda vez que um arquivo daqui passar a depender de um pacote npm novo
// (ex: mcp-coordinator.js precisando de @modelcontextprotocol/sdk+zod),
// soma aqui -- senão o auto-update baixa o código novo, passa pelo
// `node --check` (que não pega dependência faltando, só erro de
// sintaxe), reinicia, e o processo cai com MODULE_NOT_FOUND em toda
// máquina que nunca rodou o instalador de novo na mão.
const UPDATE_NPM_DEPS = ['@modelcontextprotocol/sdk', 'zod'];
// log simples em arquivo (console.log/error não dá pra ler num Serviço do
// Windows sem anexar debugger) -- só assim uma falha silenciosa (já
// aconteceu uma vez, nunca totalmente diagnosticada) fica visível depois,
// sem precisar reproduzir o problema de novo. Cap de ~80 linhas, sem log
// rotation de verdade -- é só pra debug ocasional, não auditoria.
const UPDATE_LOG = path.join(__dirname, 'update.log');
function logUpdate(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const prev = fs.existsSync(UPDATE_LOG) ? fs.readFileSync(UPDATE_LOG, 'utf8').split('\n').filter(Boolean) : [];
    prev.push(line);
    fs.writeFileSync(UPDATE_LOG, prev.slice(-80).join('\n') + '\n');
  } catch {}
}
async function checkForUpdates() {
  if (!WIN) return;
  try {
    const remote = await (await fetch(UPDATE_BASE + 'server.js')).text();
    const local = fs.readFileSync(__filename, 'utf8');
    if (remote === local) return; // já atualizado
    logUpdate('versão nova encontrada, validando antes de aplicar...');
    // nunca sobrescreve o server.js rodando sem confirmar que o novo nem tem
    // erro de sintaxe -- dev é o mesmo branch onde qualquer commit experimental
    // meu cai; sem essa trava, um push quebrado derrubaria o serviço remoto
    // de verdade (sem acesso físico pra consertar).
    const tmp = path.join(__dirname, '.update-check.js');
    fs.writeFileSync(tmp, remote);
    try { execFileSync(process.execPath, ['--check', tmp]) }
    catch (e) { fs.unlinkSync(tmp); throw new Error('server.js novo tem erro de sintaxe, abortando: ' + e.message, { cause: e }) }
    fs.unlinkSync(tmp);
    logUpdate('sintaxe ok, garantindo dependências novas...');
    // idempotente -- se já estiver instalado, só confirma rápido, não reinstala.
    try { execFileSync('npm', ['install', ...UPDATE_NPM_DEPS, '--silent'], { cwd: __dirname, timeout: 120000 }) }
    catch (e) { throw new Error('npm install das dependências novas falhou, abortando: ' + e.message, { cause: e }) }
    logUpdate('válido, baixando o resto e aplicando...');
    for (const f of UPDATE_FILES) fs.writeFileSync(path.join(__dirname, f), await (await fetch(UPDATE_BASE + f)).text());
    logUpdate('arquivos atualizados, reiniciando com segurança...');
    spawn(process.execPath, [path.join(__dirname, 'win-service.js'), 'safe-restart'], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { logUpdate('checagem falhou: ' + e.message); }
}
// de 24h pra poucos minutos -- o pedido era "quando a gente subir uma
// atualização os PCs já atualizam", sem precisar do botão manual (🔄 /
// api/check-updates) nem esperar quase um dia. Custo é baixo: só um GET
// pro raw.githubusercontent.com quando não muda nada, cai fora na
// primeira comparação (remote === local).
if (WIN) { void checkForUpdates(); setInterval(() => void checkForUpdates(), 5 * 60 * 1000); }
// de hora em hora -- pega PCs instalados depois sem precisar esperar o ciclo
// de 24h do auto-update, e é barato (só sonda quem já responde no /health).
// Diferente do checkForUpdates (Windows-only de propósito, depende do
// safe-restart via win-service.js) -- announceToPeers() não tem nada
// específico de Windows, e é exatamente o que falta pra um PC "bot"
// sem tela (ex: Raspberry Pi) aparecer pros outros sem ninguém colar
// token na mão -- roda em qualquer plataforma.
void announceToPeers(); setInterval(() => void announceToPeers(), 5 * 60 * 1000);

// --- motor de execução do coordenador: um `opencode serve` supervisionado
// nesta máquina. Toda instrução despachada (local ou vinda de outra máquina
// via /api/coordinator/prompt) roda através dele -- é a única das duas CLIs
// (opencode/Claude Code) com API HTTP programável; qual CLI a PESSOA digita
// no terminal do coordenador (ver getCoordinatorCli) é uma escolha
// separada, não muda o motor que executa a instrução no projeto-alvo.
// Sempre o opencode oficial (OPENCODE_BIN) -- nunca precisa de fork aqui.
const OPENCODE_SERVE_PORT = 4097;
const OPENCODE_SERVE_PASSWORD = crypto.createHash('sha256').update(TOKEN + ':opencode-serve').digest('hex');
let openCodeServeProc = null;
function ensureOpenCodeServe() {
  if (!WIN) return;
  if (openCodeServeProc && !openCodeServeProc.killed) return;
  const bin = process.env.OPENCODE_BIN || 'opencode';
  // mesmo motivo do winCommand() em sessions-native.js: 'opencode' no PATH é
  // um wrapper .cmd/.ps1, não um .exe puro -- spawn() direto (sem shell) dá
  // EFTYPE no Windows. Vai via powershell -Command igual o resto do FORGE.
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `& '${bin}' serve --hostname 127.0.0.1 --port ${OPENCODE_SERVE_PORT}`], {
      env: { ...CHILD_ENV, OPENCODE_SERVER_PASSWORD: OPENCODE_SERVE_PASSWORD },
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('exit', () => { if (openCodeServeProc === child) openCodeServeProc = null; });
    child.on('error', () => { if (openCodeServeProc === child) openCodeServeProc = null; });
    openCodeServeProc = child;
  } catch (e) { console.error('[coordinator] falha ao iniciar opencode serve:', e.message); }
}
function openCodeServeFetch(pathname, directory, opts) {
  const auth = 'Basic ' + Buffer.from('opencode:' + OPENCODE_SERVE_PASSWORD).toString('base64');
  const headers = { Authorization: auth, 'Content-Type': 'application/json', ...(directory ? { 'x-opencode-directory': directory } : {}), ...(opts && opts.headers) };
  return fetch(`http://127.0.0.1:${OPENCODE_SERVE_PORT}${pathname}`, { ...opts, headers, signal: AbortSignal.timeout(120000) });
}
// espera curta só quando o `opencode serve` acabou de ser spawnado (boot ou
// depois de cair) -- no caminho comum (já de pé) a primeira tentativa já
// responde e isso não espera nada.
async function waitOpenCodeServe(tries = 20) {
  for (let i = 0; i < tries; i++) {
    try { const r = await openCodeServeFetch('/doc', null, { method: 'GET' }); if (r.ok || r.status < 500) return true } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}
// motor FMM (CUDA próprio, roda via DLL -- projeto separado apontado por
// FMM_ENGINE_DIR) exposto como API HTTP local (api/server.py, porta 8383)
// -- usado pelo /api/triagem acima. Mesmo molde de ensureOpenCodeServe:
// sobe uma vez, lazy, na primeira pergunta; só existe nesta máquina se o
// .env tiver FMM_ENGINE_DIR setado (hoje só uma, no futuro qualquer PC
// com GPU que configurar isso passa a valer, sem código novo).
const FMM_ENGINE_DIR = process.env.FMM_ENGINE_DIR || '';
const FMM_API_PORT = 8383;
let fmmApiProc = null;
function ensureFmmApi() {
  if (!WIN || !FMM_ENGINE_DIR) return;
  if (fmmApiProc && !fmmApiProc.killed) return;
  try {
    const py = path.join(FMM_ENGINE_DIR, 'venv_fmm', 'Scripts', 'python.exe');
    const child = spawn(py, [path.join('api', 'server.py')], {
      cwd: FMM_ENGINE_DIR,
      env: CHILD_ENV,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('exit', () => { if (fmmApiProc === child) fmmApiProc = null; });
    child.on('error', () => { if (fmmApiProc === child) fmmApiProc = null; });
    fmmApiProc = child;
  } catch (e) { console.error('[fmm] falha ao iniciar api/server.py:', e.message); }
}
// retry mais longo que waitOpenCodeServe -- esse processo carrega um
// modelo de verdade na GPU no startup, não é só um servidor Node leve.
async function waitFmmApi(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${FMM_API_PORT}/health`, { signal: AbortSignal.timeout(2000) }); if (r.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
async function promptProject(directory, instruction) {
  ensureOpenCodeServe();
  await waitOpenCodeServe();
  let sessionId;
  try {
    const listRes = await openCodeServeFetch('/session', directory, { method: 'GET' });
    if (listRes.ok) {
      const list = await listRes.json();
      if (Array.isArray(list) && list.length) sessionId = list.toSorted((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0))[0].id;
    }
  } catch {}
  if (!sessionId) {
    const createRes = await openCodeServeFetch('/session', directory, { method: 'POST', body: JSON.stringify({ title: 'Coordenador: ' + instruction.slice(0, 60) }) });
    if (!createRes.ok) throw new Error('não consegui criar sessão: ' + createRes.status);
    sessionId = (await createRes.json()).id;
  }
  const msgRes = await openCodeServeFetch(`/session/${sessionId}/message`, directory, {
    method: 'POST',
    body: JSON.stringify({ parts: [{ type: 'text', text: instruction }] }),
  });
  if (!msgRes.ok) throw new Error('prompt falhou: ' + msgRes.status + ' ' + (await msgRes.text()).slice(0, 200));
  const result = await msgRes.json();
  const parts = result.parts || result.info?.parts || [];
  const textPart = [...parts].reverse().find(p => p.type === 'text');
  return textPart ? textPart.text : '(sem resposta)';
}
// lazy -- só sobe o `opencode serve` no primeiro dispatch de verdade (ver
// promptProject acima), não em todo boot de todo PC instalado. Evita um
// processo ocioso em máquinas que nunca vão usar o Coordenador.

// --- Coordenador proativo: além de só reagir quando chamado, ele mesmo
// escreve e manda uma notificação resumindo o estado da rede, sem ninguém
// pedir -- diferença entre "ferramenta que só responde" e "tem presença
// própria" (pedido explícito do usuário, depois de ver o resto
// funcionando). Sessão própria (.coordinator-checkin), separada da
// conversa real do Coordenador -- não quer poluir um histórico de
// trabalho com esse ritual diário.
const CHECKIN_DIR = path.join(ROOT, '.coordinator-checkin');
const CHECKIN_HOUR = 8; // horário local da máquina -- ajustável se pegar bem
let lastCheckinDay = null;
async function coordinatorCheckIn() {
  if (!WIN) return;
  try {
    fs.mkdirSync(CHECKIN_DIR, { recursive: true });
    const peers = await discoverForgePeers();
    const offline = KNOWN.filter(k => !peers.some(p => p.dnsName === k.dnsName)).map(k => k.hostname);
    const lines = [
      `${getDeviceName()} (esta máquina): online.`,
      ...peers.map(p => `${p.hostname}: online.`),
      ...offline.map(h => `${h}: não respondeu agora (pode estar desligada).`),
    ];
    const prompt = `Você é o Coordenador do Sploit-Forge, mandando um resumo proativo pro celular da pessoa pela manhã -- ela não pediu agora, você que está avisando. Escreva 1-3 frases curtas e naturais (sem lista, sem "relatório"), como uma mensagem direta mesmo. Dados reais coletados agora:\n${lines.join('\n')}\nSe tudo estiver normal, diga isso breve e com variação (não repita a mesma frase todo dia). Nunca invente problema que não está nos dados acima.`;
    const text = await promptProject(CHECKIN_DIR, prompt);
    await notify('Coordenador', text.slice(0, 500));
  } catch (e) { console.error('[checkin] falhou:', e.message); }
}
function maybeRunCheckIn() {
  const day = new Date().toDateString();
  if (new Date().getHours() >= CHECKIN_HOUR && lastCheckinDay !== day) { lastCheckinDay = day; void coordinatorCheckIn(); }
}
if (WIN) { setInterval(maybeRunCheckIn, 30 * 60 * 1000); maybeRunCheckIn(); }

srv.listen(PORT, HOST, () => console.log(`FORGE em http://${HOST}:${PORT}`));
