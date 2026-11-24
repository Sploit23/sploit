// FORGE server — Linux + tmux + opencode no PATH
// npm i ws node-pty   |   FORGE_TOKEN=<24+ chars> node server.js
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const crypto = require('crypto'), { execFileSync, execFile, execSync, spawn } = require('child_process');
const { Readable } = require('stream');
const { WebSocketServer } = require('ws');

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
const HEADLESS = !!process.env.FORGE_HEADLESS;
let webpush = null, mcpCoordinator = null;
if (!HEADLESS) {
  try { webpush = require('web-push') } catch {}
  try { mcpCoordinator = require('./mcp-coordinator') } catch {}
}
const TOKEN = process.env.FORGE_TOKEN || '';
if (TOKEN.length < 24) { console.error('Defina FORGE_TOKEN com 24+ caracteres'); process.exit(1); }
// processos filhos (shell do /api/exec, sessões de terminal, xdotool) não precisam
// do token pra nada -- sem isso ele aparece em claro em todo scrollback/log deles.
const CHILD_ENV = { ...process.env }; delete CHILD_ENV.FORGE_TOKEN;
// o Serviço do Windows roda como LocalSystem com um environment mínimo e
// potencialmente errado (node-windows só grava as vars explícitas do
// win-service.js): copiar USERPROFILE/APPDATA/PATH dele faz o powershell.exe
// sair com code 1 e stdout/stderr vazios, e o `npm` do auto-update falhar com
// ENOENT. Força um ambiente Windows conhecido, mantendo só as vars FORGE_*.
if (WIN) {
  const win = /^[A-Za-z]:\\/.test(process.env.SystemRoot || '') ? process.env.SystemRoot : 'C:\\Windows';
  const profile = process.env.FORGE_USER_PROFILE || path.join(win, 'System32', 'config', 'systemprofile');
  Object.assign(CHILD_ENV, {
    SystemRoot: win,
    windir: win,
    ComSpec: path.join(win, 'System32', 'cmd.exe'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC',
    PATH: `${win}\\System32;${win};${win}\\System32\\Wbem;${win}\\System32\\WindowsPowerShell\\v1.0;C:\\Program Files\\nodejs`,
    TEMP: path.join(win, 'Temp'),
    TMP: path.join(win, 'Temp'),
    USERPROFILE: profile,
    APPDATA: path.join(profile, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(profile, 'AppData', 'Local'),
    PSModulePath: path.join(win, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    OS: 'Windows_NT',
  });
}
const PS_EXE = WIN ? path.join(CHILD_ENV.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : '';
const NPM_BIN = WIN ? path.join(path.dirname(process.execPath), 'npm.cmd') : 'npm';
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
  if (process.env.FORGE_HEADLESS) return false;
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
// reinstalar o app gera um dnsName novo no Tailscale (sufixo -2) e a entrada
// antiga do MESMO hostname ficava pra sempre na lista como "offline" --
// o painel mostrava um "Escritorio" morto ao lado do vivo, e o check-in das 8h
// chegava a anunciar um PC que estava ligado como se estivesse desligado.
// Um hostname só pode ter uma entrada: fica a mais recente.
function loadKnown() {
  let raw = [];
  try { raw = fs.existsSync(KNOWN_FILE) ? JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8')) : [] } catch { return [] }
  if (!Array.isArray(raw)) return [];
  const newest = {};
  for (const d of raw) if (!newest[d.hostname] || (d.announcedAt || 0) > (newest[d.hostname].announcedAt || 0)) newest[d.hostname] = d;
  const out = Object.values(newest);
  if (out.length !== raw.length) try { fs.writeFileSync(KNOWN_FILE, JSON.stringify(out, null, 2)) } catch {}
  return out;
}
let KNOWN = loadKnown();
const saveKnown = () => fs.writeFileSync(KNOWN_FILE, JSON.stringify(KNOWN, null, 2));
// mesma descoberta usada por /api/peers e por announceToPeers() -- sonda o
// /health de cada peer do Tailscale direto por IP, sem trocar token nenhum.
async function discoverForgePeers() {
  let peers = [];
  try { peers = Object.values(JSON.parse(await sh('tailscale', ['status', '--json'])).Peer || {}); } catch { return [] }
  const found = await Promise.all(peers.map(async p => {
    const ip = (p.TailscaleIPs || [])[0];
    if (!ip) return null;
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 2500);
    try {
      const r = await fetch('http://' + ip + ':' + PORT + '/health', { signal: ctrl.signal });
      const j = r.ok ? await r.json() : null;
      return j && j.forge ? { hostname: p.HostName, dnsName: (p.DNSName || '').replace(/\.$/, ''), ip, pilot: j.pilot === true } : null;
    } catch { return null }
    finally { clearTimeout(t) }
  }));
  return found.filter(Boolean);
}
// endereço Tailscale desta máquina, com cache curto -- /api/mesh (o app
// /hub consulta a cada 8s) não precisa spawnar `tailscale status` toda vez.
let selfDnsCache = { at: 0, value: '' };
async function getSelfDns() {
  if (Date.now() - selfDnsCache.at < 60000) return selfDnsCache.value;
  try {
    selfDnsCache = { at: Date.now(), value: ((JSON.parse(await sh('tailscale', ['status', '--json'])).Self || {}).DNSName || '').replace(/\.$/, '') };
  } catch { selfDnsCache = { at: Date.now(), value: '' } }
  return selfDnsCache.value;
}
function getLanIp() {
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/tailscale|protonvpn|wireguard/i.test(name)) continue;
    const ip = (list || []).find(x => (x.family === 'IPv4' || x.family === 4) && !x.internal && !x.address.startsWith('100.'));
    if (ip) return ip.address;
  }
  return '';
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
        body: JSON.stringify({ hostname: getDeviceName(), dnsName: selfDns, token: TOKEN, lanIp: getLanIp(), pilot: isDesktopInstalled() }),
      });
    } catch {} finally { clearTimeout(t) }
  }));
}
// --- Notificação push (web push padrão, sem serviço de terceiro) ---
const VAPID_FILE = path.join(__dirname, '.push-vapid.json');
const SUBS_FILE = path.join(__dirname, 'push-subscriptions.json');
let VAPID = null;
if (webpush) {
  VAPID = fs.existsSync(VAPID_FILE) ? JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8')) : null;
  if (!VAPID) { VAPID = webpush.generateVAPIDKeys(); fs.writeFileSync(VAPID_FILE, JSON.stringify(VAPID)); }
  webpush.setVapidDetails('mailto:forge@localhost', VAPID.publicKey, VAPID.privateKey);
}
let SUBS = fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) : [];
const saveSubs = () => fs.writeFileSync(SUBS_FILE, JSON.stringify(SUBS, null, 2));
const lastNotify = {};
async function notify(projectName, body, url) {
  if (!webpush || !SUBS.length) return;
  const now = Date.now();
  if (now - (lastNotify[projectName] || 0) < 20000) return;
  lastNotify[projectName] = now;
  const payload = JSON.stringify({ title: 'Sploit-Forge · ' + projectName.split(':')[0], body, url: url || '/' });
  const dead = [];
  await Promise.all(SUBS.map(s => webpush.sendNotification(s, payload).catch(e => {
    if (e.statusCode === 404 || e.statusCode === 410) dead.push(s);
  })));
  if (dead.length) { SUBS = SUBS.filter(s => !dead.includes(s)); saveSubs(); }
}
const inRoot = p => path.resolve(p).startsWith(ROOT + path.sep);
const readBody = (req, max = 1e5) => new Promise(r => {
  let b = ''; req.on('data', c => { b += c; if (b.length > max) req.destroy(); });
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
// --- app mínimo "Sploit Force" (/hub) ---
// Só a lista de PCs da rede com bolinha de online/offline ao vivo. Todo o
// resto (mexer de verdade no PC) é o MCP do Coordenador (ver
// mcp-coordinator.js): o app fica simples de propósito, quem trabalha é o
// agente (opencode/Claude Code) chamando as tools. Fica em server.js (e não
// em index.html) pra viajar no auto-update sem regenerar assets.ts.
const HUB_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#05070d"><title>Sploit Force</title><link rel="icon" href="/icon.svg">
<style>
:root{--bg:#05070d;--card:#0b0f1a;--line:#1b2436;--txt:#e6edf7;--dim:#7b8aa3;--blue:#3ef0d8;--purple:#a855f7;--ok:#2dd4a5;--bad:#4b5568}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 20% -10%,#101a33 0%,var(--bg) 55%);color:var(--txt);font:15px/1.45 "Segoe UI",Inter,system-ui,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:22px 22px 8px}
h1{margin:0;font-size:19px;letter-spacing:.4px;font-family:ui-monospace,Consolas,monospace;font-weight:700}
h1 b{background:linear-gradient(90deg,var(--blue),var(--purple));-webkit-background-clip:text;background-clip:text;color:transparent}
#sum{margin-left:auto;color:var(--dim);font-size:12.5px;font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:10px 22px 22px}
.pc{position:relative;display:flex;gap:12px;align-items:center;padding:14px 16px;background:linear-gradient(180deg,#0c1220,#0a0e19);border:1px solid var(--line);border-radius:14px;cursor:pointer;transition:border-color .15s,transform .15s}
.pc:hover{border-color:#2b3b5c;transform:translateY(-1px)}
.pc.off{opacity:.55;cursor:default}
.dot{width:9px;height:9px;border-radius:50%;background:var(--bad);flex:0 0 auto}
.pc.on .dot{background:var(--ok);box-shadow:0 0 10px var(--ok)}
.name{font-weight:600;font-size:15px}
.tag{margin-left:6px;font:10px/1 ui-monospace,Consolas,monospace;color:var(--blue);border:1px solid #17324a;border-radius:5px;padding:2px 5px;vertical-align:2px}
.sub{color:var(--dim);font:11.5px/1.3 ui-monospace,Consolas,monospace;word-break:break-all}
.here{margin-left:auto;color:var(--blue);font:11px/1 ui-monospace,monospace;border:1px solid #17324a;border-radius:6px;padding:3px 6px;white-space:nowrap}
.off .here{color:var(--dim);border-color:var(--line)}
#hint{padding:0 22px 26px;color:var(--dim);font-size:12.5px}
#hint code{color:#b9c6da}
#tk{display:none;margin:30px 22px;padding:18px;background:var(--card);border:1px solid var(--line);border-radius:12px;max-width:520px}
#tk input{width:100%;margin-top:10px;padding:10px 12px;background:#070b13;border:1px solid var(--line);border-radius:8px;color:var(--txt);font:13px ui-monospace,monospace}
#tk button{margin-top:10px;padding:9px 14px;border:0;border-radius:8px;background:linear-gradient(90deg,var(--blue),var(--purple));color:#04121a;font-weight:700;cursor:pointer}
</style></head><body>
<header><h1>Sploit <b>Force</b></h1><span id="sum">…</span></header>
<div id="tk"><div>Cole o token deste PC pra ver a rede:</div><input id="tkin" placeholder="FORGE_TOKEN" autocomplete="off"><button id="tkok">Entrar</button></div>
<div id="grid"></div>
<div id="hint">Clique num PC pra abrir. PCs com <b>piloto</b> abrem o app inteiro (terminal, chat, projetos); os outros são bots e só respondem comandos. O resto é pelo agente: <code>list_devices</code>, <code>run_command</code>, <code>read_file</code>… (MCP do Coordenador).</div>
<script>
var $=function(s){return document.querySelector(s)};
(function(){var m=location.hash.match(/t=([^&]+)/);if(m){localStorage.forge_token=decodeURIComponent(m[1]);history.replaceState(null,'',location.pathname+location.search)}})();
function tok(){return localStorage.forge_token||''}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function api(p){return fetch(p,{headers:{Authorization:'Bearer '+tok()}}).then(function(r){if(r.status===401)throw new Error('token');return r.json()})}
function showToken(){document.getElementById('tk').style.display='block';document.getElementById('grid').innerHTML='';document.getElementById('sum').textContent='sem token'}
function openPc(d){location.href='https://'+d.dnsName+'/#t='+encodeURIComponent(d.token)}
function render(list){
  // pilotos (PCs com app de verdade) primeiro -- é neles que a pessoa
  // consegue trabalhar; bot de loja só responde comando via agente.
  list=list.slice().sort(function(a,b){return (b.pilot?1:0)-(a.pilot?1:0)});
  var on=0;
  var html=list.map(function(d){
    if(d.online)on++;
    var cls='pc '+(d.online?'on':'off');
    if(d.self)cls+=' me';
    return '<div class="'+cls+'" data-i="'+list.indexOf(d)+'">'+
      '<span class="dot"></span>'+
      '<div><div class="name">'+esc(d.hostname||d.dnsName||'?')+(d.pilot?'<span class="tag">piloto</span>':'')+'</div>'+
      '<div class="sub">'+esc(d.dnsName||'sem endereço Tailscale')+(d.online&&d.ms!=null?' · '+d.ms+'ms':'')+'</div></div>'+
      '<span class="here">'+(d.self?'esta máquina':(d.online?'abrir':'offline'))+'</span></div>';
  }).join('');
  document.getElementById('grid').innerHTML=html||'<div class="sub">nenhum PC conhecido ainda</div>';
  document.getElementById('sum').textContent=on+' online / '+list.length;
  Array.prototype.forEach.call(document.querySelectorAll('.pc'),function(el){
    el.onclick=function(){var d=list[+el.dataset.i];if(d&&d.dnsName&&!d.self)openPc(d)};
  });
}
var loaded=false;
function load(){
  if(!tok())return showToken();
  api('/api/mesh').then(function(list){loaded=true;render(list)}).catch(function(e){
    if(e.message==='token')return showToken();
    document.getElementById('sum').textContent='erro de rede';
  });
}
document.getElementById('tkok').onclick=function(){
  var v=document.getElementById('tkin').value.trim();
  if(v.length<24){alert('token inválido');return}
  localStorage.forge_token=v;document.getElementById('tk').style.display='none';load();
};
load();setInterval(load,8000);
</script></body></html>`;

const BAR_HTML = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sploit Forge</title>
<style>
:root{--bg:#080b14;--card:#111827;--line:#1c2840;--tx:#e6edf7;--mu:#9fb3cd;--blue:#7dd3fc}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--tx);font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bar{position:fixed;inset:0 0 auto 0;z-index:2;display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:#080b14f5;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
#bar::-webkit-scrollbar{display:none}
.pc{flex:none;min-width:120px;max-width:320px;padding:6px 10px;background:var(--card);border:1px solid var(--line);border-radius:8px}
.pc .n{color:var(--blue);font-weight:700;font-size:12px;margin-bottom:4px}
.pc .p{color:var(--mu);font-size:11px;line-height:1.5;white-space:normal;word-break:break-word}
.pc .p:before{content:'└ ';color:#455b78}
#tk{margin:60px 16px;padding:14px;background:var(--card);border:1px solid var(--line);border-radius:8px;max-width:420px}
#tk input{width:100%;margin:8px 0;padding:8px;background:#070b13;border:1px solid var(--line);border-radius:6px;color:var(--tx);font:12px ui-monospace,monospace}
#tk button{padding:7px 12px;border:0;border-radius:6px;background:var(--blue);font-weight:700;cursor:pointer}
</style></head><body>
<div id="bar"></div>
<div id="tk" hidden><div>Cole o token deste PC:</div><input id="tkin" autocomplete="off"><button id="tkok">Entrar</button></div>
<script>
var $=function(s){return document.querySelector(s)};
(function(){var m=location.hash.match(/t=([^&]+)/);if(m){localStorage.forge_token=decodeURIComponent(m[1]);history.replaceState(null,'',location.pathname)}})();
function tok(){return localStorage.forge_token||''}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function api(p){return fetch(p,{headers:{Authorization:'Bearer '+tok()}}).then(function(r){if(r.status===401)throw new Error('token');return r.json()})}
function render(pcs,projects){
  $('#bar').innerHTML=pcs.map(function(pc){
    var list=projects.filter(function(x){return pc.self?x.machine==='local':(x.machine===pc.dnsName||x.machine===pc.hostname)});
    return '<div class="pc"><div class="n">'+esc(pc.hostname||pc.dnsName||'?')+'</div>'+
      (list.length?list.map(function(x){return '<div class="p">'+esc(x.alias||x.name)+'</div>'}).join(''):'<div class="p" style="color:#455b78">sem projetos</div>')+'</div>';
  }).join('');
}
function load(){
  if(!tok()){$('#tk').hidden=false;return}
  $('#tk').hidden=true;
  Promise.all([api('/api/stats'),api('/api/known-devices'),api('/api/all-projects')]).then(function(r){
    render([{hostname:r[0].host,dnsName:'local',self:true}].concat(r[1].filter(function(d){return d.token})),r[2]);
  }).catch(function(e){if(e.message==='token'){$('#tk').hidden=false}});
}
$('#tkok').onclick=function(){var v=$('#tkin').value.trim();if(v.length<24){alert('token inválido');return}localStorage.forge_token=v;load()};
load();setInterval(load,8000);
</script></body></html>`;

const SW = `const C='forge-v1';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.add('/'))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.pathname.startsWith('/api'))return;
e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r}).catch(()=>caches.match(e.request)))});
self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch{}
e.waitUntil(self.registration.showNotification(d.title||'Sploit-Forge',{body:d.body||'',tag:'forge',data:{url:d.url||'/'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'/';
e.waitUntil(clients.matchAll({type:'window'}).then(cs=>{const c=cs.find(x=>x.url.includes(location.origin));if(c){c.navigate(url);return c.focus()}return clients.openWindow(url)}))});`;

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (type, body, code = 200) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  const pt = previewTarget(req);
  if (pt) return cookieOk(req) ? proxy(req, res, pt) : send('text/plain', 'não autorizado', 401);
  if (u.pathname === '/') {
    // em bot headless a UI completa não faz sentido -- mesmo que o PC já
    // tenha um index.html de uma instalação antiga, serve /hub (visão da
    // malha) em vez daquele app desatualizado com bandeja/aba flutuante.
    const indexFile = path.join(__dirname, 'index.html');
    const html = HEADLESS || !fs.existsSync(indexFile) ? HUB_HTML : fs.readFileSync(indexFile);
    return send('text/html; charset=utf-8', html);
  }
  // app simples "Sploit Force": lista de PCs online (ver HUB_HTML acima)
  if (u.pathname === '/hub' || u.pathname === '/hub/') return send('text/html; charset=utf-8', HUB_HTML);
  if (u.pathname === '/bar') return send('text/html; charset=utf-8', BAR_HTML);
  if (u.pathname === '/manifest.webmanifest') return send('application/manifest+json', MANIFEST);
  if (u.pathname === '/sw.js') return send('text/javascript', SW);
  // iOS não lê o ícone do manifest.json pra "Adicionar à Tela de Início" --
  // precisa de um <link rel="apple-touch-icon"> explícito apontando pra isso.
  if (u.pathname === '/icon.svg') return send('image/svg+xml', ICON_ANY_SVG);
  // sem token: só pra outro FORGE na mesma rede Tailscale se reconhecer (ver /api/peers)
  if (u.pathname === '/health') return send('application/json', JSON.stringify({ forge: true, name: getDeviceName(), pilot: isDesktopInstalled() }));
  // sem token de propósito -- ver comentário em KNOWN_FILE acima. Só grava
  // "existo, meu token é X"; nunca devolve nada, nunca lê o registro (isso é
  // /api/known-devices, autenticado).
  if (u.pathname === '/api/announce' && req.method === 'POST') {
    const b = await readBody(req);
    const hostname = String(b.hostname || '').trim().slice(0, 64);
    const dnsName = String(b.dnsName || '').trim().slice(0, 253);
    const token = String(b.token || '').trim();
    const lanIp = String(b.lanIp || '').trim().slice(0, 64);
    if (!hostname || !dnsName || token.length < 16) return send('application/json', '{"error":"dados inválidos"}', 400);
    const old = KNOWN.find(d => d.dnsName === dnsName);
    const isNew = !old;
    KNOWN = [...KNOWN.filter(d => d.dnsName !== dnsName), { hostname, dnsName, token, lanIp: lanIp || old?.lanIp || '', pilot: b.pilot === true || old?.pilot === true, announcedAt: Date.now() }];
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
    if (!mcpCoordinator) return send('application/json', '{"error":"MCP indisponível neste bot headless"}', 501);
    try { return await mcpCoordinator.handleMcpRequest(req, res, { token: TOKEN, port: PORT }); }
    catch (e) { return send('application/json', JSON.stringify({ error: String(e.message || e) }), 500); }
  }
  // bots headless não baixam a UI completa; rotas vendor só existem no PC base
  if (u.pathname.startsWith('/vendor/') && (HEADLESS || !fs.existsSync(path.join(__dirname, u.pathname.slice(1)))))
    return send('text/plain', 'not found', 404);
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
        const shellBin = WIN ? (fs.existsSync(PS_EXE) ? PS_EXE : 'powershell.exe') : 'bash';
        const shellArgs = WIN ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', String(b.cmd || '')] : ['-c', String(b.cmd || '')];
        const r = await new Promise(done => {
          execFile(shellBin, shellArgs, { cwd: p.path, timeout: 60000, maxBuffer: 10 * 1024 * 1024, env: CHILD_ENV, windowsHide: true },
            (err, stdout, stderr) => done({ code: err ? (err.code ?? 1) : 0, stdout, stderr: stderr || (err ? err.message || '' : '') }));
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
      if (u.pathname === '/api/mesh' && req.method === 'GET') {
        // lista simples de PCs (esta + todas já anunciadas) com status
        // online/offline AO VIVO -- sonda o /health de cada uma direto, com
        // timeout curto. Base do app /hub e da tool MCP list_devices: é o
        // "quem está na rede agora" em uma chamada só, sem o app precisar
        // saber nada de Tailscale.
        const selfDns = await getSelfDns();
        const devices = [
          { hostname: getDeviceName(), dnsName: selfDns, token: TOKEN, pilot: isDesktopInstalled(), self: true },
          ...KNOWN.filter(d => d.dnsName !== selfDns).map(d => ({ ...d, pilot: d.pilot === true, self: false })),
        ];
        return J(await Promise.all(devices.map(async d => {
          // esta máquina é sempre "online" (é ela que está respondendo o
          // /api/mesh) -- sondar o próprio https://<dns> só diria se o
          // Tailscale HTTPS está de pé, o que não é a pergunta do painel.
          if (d.self) return { ...d, online: true, ms: 0 };
          if (!d.dnsName) return { ...d, online: false, ms: null };
          const t0 = Date.now();
          try {
            const r = await fetch(`https://${d.dnsName}/health`, { signal: AbortSignal.timeout(3000) });
            if (r.ok) {
              // pilot vem ao vivo do /health -- a cópia salva em KNOWN pode
              // estar velha (o PC instalou/desinstalou a bandeja depois do
              // último anúncio).
              const j = await r.json().catch(() => ({}));
              return { ...d, online: true, ms: Date.now() - t0, pilot: j.pilot === true || d.pilot };
            }
          } catch {}
          if (d.lanIp) {
            try {
              const r = await fetch(`http://${d.lanIp}:${PORT}/health`, { signal: AbortSignal.timeout(1500) });
              if (r.ok) return { ...d, online: true, ms: Date.now() - t0 };
            } catch {}
          }
          return { ...d, online: false, ms: null };
        })));
      }
      if (u.pathname === '/api/run' && req.method === 'POST') {
        // roda um comando nesta máquina (ou repassa pra outra com {machine})
        // SEM precisar de um projeto registrado -- é o que deixa o agente,
        // via MCP, agir como se estivesse instalado no PC: `cwd` default é o
        // FORGE_ROOT, mas aceita qualquer pasta (mesmo nível de acesso que o
        // terminal interativo já dá a quem tem o token).
        const b = await readBody(req);
        if (b.machine) {
          const dev = KNOWN.find(k => k.dnsName === b.machine || k.hostname === b.machine);
          if (!dev) return J({ error: 'dispositivo não conhecido: ' + b.machine }, 404);
          try {
            const r = await fetch(`https://${dev.dnsName}/api/run`, {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + dev.token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ cmd: b.cmd, cwd: b.cwd, timeout: b.timeout }),
              signal: AbortSignal.timeout(Math.min(+b.timeout || 120000, 600000) + 30000),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
            return J({ ...j, machine: dev.hostname });
          } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
        }
        const cwd = b.cwd ? path.resolve(String(b.cwd)) : ROOT;
        try { if (!fs.statSync(cwd).isDirectory()) return J({ error: 'cwd não é uma pasta: ' + cwd }, 400); }
        catch { return J({ error: 'cwd não encontrado: ' + cwd }, 400) }
        const shellBin = WIN ? (fs.existsSync(PS_EXE) ? PS_EXE : 'powershell.exe') : 'bash';
        const shellArgs = WIN ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', String(b.cmd || '')] : ['-c', String(b.cmd || '')];
        const r = await new Promise(done => {
          execFile(shellBin, shellArgs, { cwd, timeout: Math.min(+b.timeout || 120000, 600000), maxBuffer: 20 * 1024 * 1024, env: CHILD_ENV, windowsHide: true },
            (err, stdout, stderr) => done({ code: err ? (err.code ?? 1) : 0, stdout, stderr: stderr || (err ? err.message || '' : ''), cwd }));
        });
        return J(r);
      }
      if (u.pathname === '/api/file' && req.method === 'POST') {
        // ler/gravar/editar/listar um caminho absoluto, sem passar por shell
        // (evita escaping de aspas/caminho Windows dentro do PowerShell) --
        // par do /api/run pras tools MCP read_file/write_file/edit_file/list_dir.
        const b = await readBody(req, 12 * 1024 * 1024);
        if (!b.path) return J({ error: 'path obrigatório' }, 400);
        if (b.machine) {
          const dev = KNOWN.find(k => k.dnsName === b.machine || k.hostname === b.machine);
          if (!dev) return J({ error: 'dispositivo não conhecido: ' + b.machine }, 404);
          try {
            const r = await fetch(`https://${dev.dnsName}/api/file`, {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + dev.token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ op: b.op, path: b.path, content: b.content, old: b.old, new: b.new, all: b.all }),
              signal: AbortSignal.timeout(60000),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return J({ error: j.error || ('destino respondeu ' + r.status) }, 502);
            return J(j);
          } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
        }
        const target = path.resolve(String(b.path));
        const op = String(b.op || 'read');
        try {
          if (op === 'read') {
            const st = fs.statSync(target);
            if (!st.isFile()) return J({ error: 'não é um arquivo: ' + target }, 400);
            if (st.size > 4 * 1024 * 1024) return J({ error: `arquivo grande demais (${st.size} bytes) -- use run_command (ex: Get-Content -Tail / head -c)` }, 413);
            const buf = fs.readFileSync(target);
            if (buf.subarray(0, 4096).includes(0)) return J({ error: 'arquivo binário -- use run_command (ex: rz-bin.exe -I/-z, strings)' }, 415);
            return J({ path: target, size: st.size, content: buf.toString('utf8') });
          }
          if (op === 'write') {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, String(b.content ?? ''));
            return J({ ok: true, path: target, size: Buffer.byteLength(String(b.content ?? '')) });
          }
          if (op === 'edit') {
            const txt = fs.readFileSync(target, 'utf8');
            const old = String(b.old ?? ''), neu = String(b.new ?? '');
            if (!old) return J({ error: 'old obrigatório' }, 400);
            const count = txt.split(old).length - 1;
            if (!count) return J({ error: "trecho 'old' não encontrado em " + target }, 404);
            fs.writeFileSync(target, b.all ? txt.split(old).join(neu) : txt.replace(old, neu));
            return J({ ok: true, path: target, replacements: b.all ? count : 1 });
          }
          if (op === 'list') {
            const entries = fs.readdirSync(target, { withFileTypes: true })
              .filter(e => e.name !== '.git' && e.name !== 'node_modules')
              .map(e => {
                let size = 0, modified = null;
                try { const st = fs.statSync(path.join(target, e.name)); size = st.size; modified = st.mtimeMs } catch {}
                return { name: e.name, path: path.join(target, e.name), dir: e.isDirectory(), size, modified };
              })
              .sort((x, y) => (Number(y.dir) - Number(x.dir)) || x.name.localeCompare(y.name));
            return J({ path: target, entries });
          }
          if (op === 'stat') {
            const st = fs.statSync(target);
            return J({ exists: true, path: target, dir: st.isDirectory(), size: st.size, modified: st.mtimeMs });
          }
          return J({ error: 'op inválida (read|write|edit|list|stat)' }, 400);
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 400) }
      }
      if (u.pathname === '/api/all-projects' && req.method === 'GET') {
        if (!mcpCoordinator) return J([]);
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
        // pergunta pro motor local, COM ferramentas (arquivo/bash/RE) -- a
        // execução das ferramentas é SEMPRE nesta máquina (onde o pedido do
        // PWA chegou); só a inferência em si pode ser repassada pra outra
        // máquina com GPU, por dentro de /api/llm/v1/chat/completions (que
        // já sabe achar na malha quem tem motor configurado).
        const b = await readBody(req);
        const question = String(b.question || '').trim();
        if (!question) return J({ error: 'question é obrigatória' }, 400);
        try {
          return J({ reply: await runTriagemLoop(question) });
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      if (u.pathname === '/api/llm/v1/chat/completions' && req.method === 'POST') {
        // fachada OpenAI-compatible pro motor local, pro opencode poder
        // escolher ele como provider (@ai-sdk/openai-compatible) igual
        // escolheria um modelo de nuvem -- mesmo relay de 1 salto que o
        // /api/triagem já faz pro botão 🧠 funcionar de qualquer PC.
        const b = await readBody(req);
        if (Array.isArray(b.tools)) b.tools = filterRelevantTools(b.messages, b.tools);
        if (!FMM_ENGINE_DIR) {
          if (!b.relayed) {
            for (const dev of KNOWN) {
              try {
                const r = await fetch(`https://${dev.dnsName}/api/llm/v1/chat/completions`, {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + dev.token, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...b, relayed: true }),
                  // prompt de agente (opencode manda system prompt + tools,
                  // bem maior que uma pergunta simples) pode levar minutos
                  // pra processar em CPU sem GPU -- 120s era curto demais.
                  signal: AbortSignal.timeout(600000),
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
          const { relayed, ...body } = b;
          const r = await fetch(`http://127.0.0.1:${FMM_API_PORT}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(600000),
          });
          const j = await r.json();
          if (!r.ok) return J({ error: j.error || ('motor respondeu ' + r.status) }, 502);
          return J(j);
        } catch (e) { return J({ error: String(e.message || e).slice(0, 200) }, 500) }
      }
      if (u.pathname === '/api/llm/v1/models' && req.method === 'GET') {
        return J({ object: 'list', data: [{ id: 'fmm-local', object: 'model', owned_by: 'fmm' }] });
      }
      if (u.pathname === '/api/push-vapid-key' && req.method === 'GET') return J({ key: VAPID?.publicKey || '' });
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
        // qualquer projeto novo já nasce pronto pra continuar de outro PC/engine
        // (ver ensureMcpConfig/ensureProjectContinuity) -- sem isso só a pasta
        // interna do Coordenador ganhava as ferramentas MCP automaticamente.
        ensureMcpConfig(dir);
        ensureProjectContinuity(dir);
        return J({ ok: true });
      }
      if (u.pathname === '/api/browse' && req.method === 'GET') {
        const machine = u.searchParams.get('machine');
        if (machine) {
          // ver o Explorer de OUTRO PC sem trocar de link -- repassa pro
          // device certo usando o token dele (mesmo padrão de proxy já usado
          // pro DELETE/mover remoto de projeto e pra renomear device). Aceita
          // hostname OU dnsName, igual /api/run e /api/file.
          const dev = KNOWN.find(k => k.dnsName === machine || k.hostname === machine);
          if (!dev) return J({ error: 'dispositivo não conhecido' }, 404);
          const rp = u.searchParams.get('path');
          try {
            const r = await fetch(`https://${dev.dnsName}/api/browse${rp ? '?path=' + encodeURIComponent(rp) : ''}`, {
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
          if (!mcpCoordinator) return J({ error: 'projeto não existe' }, 404);
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
        if (!mcpCoordinator) return J({ error: 'chat de IA indisponível neste bot headless' }, 501);
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
        if (!mcpCoordinator) return J({ error: 'transferência de projeto indisponível neste bot headless' }, 501);
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
    // pedidos em linguagem natural pro piloto operar a malha (ver runTask).
    // GET é barato de propósito: o app do celular faz polling enquanto a
    // tela de Pedidos está aberta e o push avisa se o app estiver fechado.
    if (u.pathname === '/api/tasks' && req.method === 'GET') return J(TASKS);
    if (u.pathname === '/api/task' && req.method === 'POST') {
      const b = await readBody(req);
      const text = String(b.text || '').trim().slice(0, 2000);
      if (!text) return J({ error: 'pedido vazio' }, 400);
      // engine por pedido -- se não vier explícito, usa a preferência desta
      // máquina (getCoordinatorCli()); antes o Pedido sempre rodava via
      // opencode, ignorando até a config do próprio Coordenador.
      const engine = b.engine === 'claude' || b.engine === 'opencode' ? b.engine : getCoordinatorCli();
      const t = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), text, machine: String(b.machine || '').trim().slice(0, 64), engine, status: 'queued' };
      TASKS.push(t);
      if (TASKS.length > 30) TASKS = TASKS.slice(-30);
      saveTasks();
      // fila serial: dois pedidos ao mesmo tempo disputariam o mesmo diretório
      // de sessão e o mesmo `opencode serve`/processo `claude` -- um de cada
      // vez é previsível.
      taskQueue = taskQueue.then(() => runTask(t));
      return J(t);
    }
    // aprova ou nega uma ação que o pedido pausou pra perguntar (ver
    // AGUARDA_APROVACAO em operatorPrompt) -- continua a MESMA sessão
    // (sessionId guardado em runTask), nunca abre uma nova do zero.
    const mApprove = u.pathname.match(/^\/api\/task\/([\w-]+)\/approve$/);
    if (mApprove && req.method === 'POST') {
      const t = TASKS.find(x => x.id === mApprove[1]);
      if (!t) return J({ error: 'pedido não encontrado' }, 404);
      if (t.status !== 'waiting_approval') return J({ error: 'esse pedido não está esperando aprovação' }, 400);
      const b = await readBody(req).catch(() => ({}));
      await resumeTask(t, !!b.approved);
      return J(t);
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
// Mesma lógica, mas pra QUALQUER diretório de projeto (não só o do
// coordenador) -- registrada em ensureProjectContinuity() abaixo, pra uma
// sessão normal (opencode/claude aberta direto na pasta do projeto, sem
// passar pelo Coordenador) já nascer com as mesmas ferramentas MCP.
function ensureMcpConfig(dir) {
  const url = `http://127.0.0.1:${PORT}/mcp`;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  try {
    mergeJsonFile(path.join(dir, 'opencode.json'), (data) => {
      data.mcp = data.mcp || {};
      data.mcp['sploit-forge'] = { type: 'remote', url, headers };
    });
  } catch {}
  try {
    mergeJsonFile(path.join(dir, '.mcp.json'), (data) => {
      data.mcpServers = data.mcpServers || {};
      data.mcpServers['sploit-forge'] = { type: 'http', url, headers };
    });
  } catch {}
}
const ensureCoordinatorMcpConfig = () => ensureMcpConfig(COORD_DIR);

// Convenção de continuidade entre PCs/engines: AGENTS.md (opencode) e
// CLAUDE.md (Claude Code) são lidos automaticamente por cada CLI ao abrir
// uma sessão na pasta -- em vez de inventar um mecanismo próprio, só
// ensina essa regra ali (idempotente via marcador, nunca sobrescreve
// conteúdo que a pessoa já tenha escrito no arquivo). `.sploit-handoff.md`
// é o bilhete de verdade: a única "memória" que atravessa PC e engine,
// porque é um arquivo normal do projeto (viaja com git pull/push).
const HANDOFF_MARKER = 'Continuidade entre PCs (Sploit-Forge)';
function ensureProjectContinuity(dir) {
  try {
    const note = path.join(dir, '.sploit-handoff.md');
    if (!fs.existsSync(note)) {
      fs.writeFileSync(note, '# Handoff\n\n(sem sessão anterior ainda -- a primeira sessão que rodar aqui escreve o que fez.)\n');
    }
  } catch {}
  const block = [
    `## ${HANDOFF_MARKER}`,
    '',
    'Este projeto pode ser trabalhado em mais de um PC da malha Sploit-Forge',
    '(ex: Casa, Escritório), por engines diferentes (opencode ou Claude Code).',
    '',
    '- No INÍCIO de qualquer sessão: leia `.sploit-handoff.md` (se existir) pra',
    '  saber onde a última sessão parou. Se este projeto for um repositório git',
    '  com remote configurado, dê `git pull` antes de começar.',
    '- No FIM de qualquer sessão (ou de qualquer pedido que mudou algo):',
    '  reescreva `.sploit-handoff.md` com data/hora, o que foi feito, estado',
    '  atual e o próximo passo. Se houve mudança de código e existe remote',
    '  git, comite e dê `git push`.',
    '- Nunca pule esses dois passos -- é assim que a pessoa consegue continuar',
    '  o mesmo projeto de outro PC ou do celular depois.',
  ].join('\n');
  for (const fname of ['AGENTS.md', 'CLAUDE.md']) {
    try {
      const p = path.join(dir, fname);
      const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
      if (!existing.includes(HANDOFF_MARKER)) fs.writeFileSync(p, (existing ? existing.replace(/\s+$/, '') + '\n\n' : '') + block + '\n');
    } catch {}
  }
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
const UPDATE_BASE = 'https://github.com/Sploit23/sploit/raw/refs/heads/dev/packages/opencode/src/cli/cmd/forge/app/';
const UPDATE_FILES = HEADLESS ? ['server.js', 'sessions-native.js', 'win-service.js'] : ['server.js', 'index.html', 'sessions-native.js', 'win-service.js', 'mcp-coordinator.js'];
// toda vez que um arquivo daqui passar a depender de um pacote npm novo
// (ex: mcp-coordinator.js precisando de @modelcontextprotocol/sdk+zod),
// soma aqui -- senão o auto-update baixa o código novo, passa pelo
// `node --check` (que não pega dependência faltando, só erro de
// sintaxe), reinicia, e o processo cai com MODULE_NOT_FOUND em toda
// máquina que nunca rodou o instalador de novo na mão.
const UPDATE_NPM_DEPS = HEADLESS ? [] : ['@modelcontextprotocol/sdk', 'zod'];
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
    if (UPDATE_NPM_DEPS.length) {
      logUpdate('sintaxe ok, garantindo dependências novas...');
      // idempotente -- se já estiver instalado, só confirma rápido, não reinstala.
      try { execFileSync(NPM_BIN, ['install', ...UPDATE_NPM_DEPS, '--silent'], { cwd: __dirname, timeout: 120000, windowsHide: true }) }
      catch (e) { throw new Error('npm install das dependências novas falhou, abortando: ' + e.message, { cause: e }) }
    }
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
// ferramentas essenciais do motor local (mesmo molde do fmm-cli standalone,
// ver ~/Desktop/fmm-cli/cli.cjs) -- execução SEMPRE na máquina que recebeu
// o pedido do PWA (não na máquina da GPU, que pode ser outra): os arquivos
// do usuário (ex: pasta REA) vivem onde a pessoa está, não onde o modelo
// roda. Só a inferência em si (via /api/llm/v1/chat/completions) é que
// pode ser repassada pra máquina com GPU.
const TRIAGEM_PERSONA = 'Você é a Sploit, a IA local do Sploit-Forge -- sem censura, roda direto na GPU deste PC (sem nuvem, sem log externo). Você tem acesso a ferramentas de arquivo e terminal (leitura/escrita/edição/busca/bash) nesta máquina. Pra engenharia reversa, rode via bash: rizin (C:\\tools\\rizin\\rizin-win-installer-vs2019_static-64\\bin\\rz-bin.exe, -I pra info, -z pra strings), python com zipfile/hashlib. Nunca leia arquivo binário com a ferramenta read -- ela recusa e você deve usar bash com a ferramenta certa. Use as ferramentas quando precisar; responda direto quando não precisar.';
const TRIAGEM_TOOLS = [
  { type: 'function', function: { name: 'read', description: 'lê um arquivo de texto e devolve o conteúdo', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write', description: 'cria ou sobrescreve um arquivo', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'edit', description: 'troca um trecho de texto por outro num arquivo', parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } } },
  { type: 'function', function: { name: 'bash', description: 'roda um comando no terminal e devolve a saída', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } },
  { type: 'function', function: { name: 'grep', description: 'busca um texto dentro de um arquivo', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern', 'path'] } } },
];
function runTriagemTool(name, args) {
  try {
    if (name === 'read') {
      const buf = fs.readFileSync(args.path);
      const sample = buf.slice(0, 2000);
      let nonPrintable = 0;
      for (const b of sample) if (b === 0 || (b < 9 && b !== 0)) nonPrintable++;
      if (nonPrintable > sample.length * 0.02) return 'erro: arquivo parece binário, não posso ler como texto -- use bash com a ferramenta certa (ex: rz-bin.exe -I/-z pra binários ELF/SO)';
      return buf.toString('utf8').slice(0, 8000);
    }
    if (name === 'write') { fs.writeFileSync(args.path, args.content); return 'ok'; }
    if (name === 'edit') {
      const txt = fs.readFileSync(args.path, 'utf8');
      if (!txt.includes(args.old)) return "erro: trecho 'old' não encontrado no arquivo";
      fs.writeFileSync(args.path, txt.replace(args.old, args.new));
      return 'ok';
    }
    if (name === 'bash') return execSync(args.cmd, { encoding: 'utf8', timeout: 30000 }).slice(0, 8000);
    if (name === 'grep') {
      const txt = fs.readFileSync(args.path, 'utf8');
      const matches = txt.split('\n').filter(l => l.includes(args.pattern));
      return matches.slice(0, 50).join('\n') || '(nenhuma ocorrência)';
    }
    return 'erro: ferramenta desconhecida';
  } catch (e) { return 'erro: ' + String(e.message || e).slice(0, 300); }
}
async function runTriagemLoop(question) {
  const messages = [
    { role: 'system', content: TRIAGEM_PERSONA },
    { role: 'user', content: question },
  ];
  for (let turn = 0; turn < 8; turn++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/llm/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'fmm-local', messages, tools: TRIAGEM_TOOLS, max_tokens: 800 }),
      signal: AbortSignal.timeout(600000),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('motor respondeu ' + r.status));
    const msg = j.choices[0].message;
    messages.push({ role: 'assistant', content: msg.content, tool_calls: msg.tool_calls });
    if (!msg.tool_calls || !msg.tool_calls.length) return msg.content || '(sem resposta)';
    for (const call of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
      const result = runTriagemTool(call.function.name, args);
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
    }
  }
  return '(limite de passos atingido)';
}
// modelo local é pequeno e lento -- um prompt de agente manda TODAS as
// definições de ferramenta de uma vez (opencode: ~17k tokens só nisso),
// o que domina o tempo de resposta sem precisar na maioria das vezes.
// Pra tarefa simples (o caso de uso do motor local), filtra pra só as
// ferramentas que a última mensagem do usuário parece realmente pedir
// (por palavra-chave) -- barato, sem precisar de outra chamada de IA.
// Se nada bater, devolve a lista inteira (melhor arriscar lento do que
// cortar uma ferramenta que era mesmo necessária).
function filterRelevantTools(messages, tools) {
  if (!Array.isArray(tools) || tools.length <= 3) return tools;
  const lastUser = [...(messages || [])].reverse().find(m => m.role === 'user');
  const text = String(lastUser?.content || '').toLowerCase();
  const words = new Set(text.split(/[^a-z0-9áéíóúâêîôûãõç]+/i).filter(w => w.length > 2));
  if (words.size === 0) return tools;
  const scored = tools.map(t => {
    const name = String(t.function?.name || t.name || '').toLowerCase();
    const desc = String(t.function?.description || t.description || '').toLowerCase();
    const haystack = (name + ' ' + desc).split(/[^a-z0-9áéíóúâêîôûãõç]+/i);
    let score = 0;
    for (const w of haystack) if (words.has(w)) score++;
    return { t, score };
  });
  const matched = scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.t);
  return matched.length ? matched.slice(0, 5) : tools;
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

// --- Pedidos: "pede e ele faz" ------------------------------------------
// A caixa de texto do celular não é um chat sobre arquivos -- é um pedido em
// linguagem natural pro piloto operar a malha via MCP (run_command,
// read_file, update_app...). Cada pedido roda numa sessão própria (não
// mistura com a conversa do Coordenador), fica salvo em tasks.json e manda
// push quando termina, pra pessoa pedir da rua e só ser avisada no fim.
const TASKS_FILE = path.join(__dirname, 'tasks.json');
function loadTasks() {
  try { const j = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); return Array.isArray(j) ? j : [] } catch { return [] }
}
let TASKS = loadTasks().slice(-30);
const saveTasks = () => { try { fs.writeFileSync(TASKS_FILE, JSON.stringify(TASKS.slice(-30), null, 2)) } catch {} };
let taskQueue = Promise.resolve();

async function operatorPrompt(t) {
  const selfDns = await getSelfDns();
  const devices = [{ hostname: getDeviceName(), dnsName: selfDns, self: true }, ...KNOWN.map(d => ({ hostname: d.hostname, dnsName: d.dnsName }))];
  const target = String(t.machine || '').trim().toLowerCase();
  const hit = target && devices.find(d => d.hostname.toLowerCase() === target || d.dnsName.toLowerCase() === target);
  return [
    `Você é o operador da malha Sploit-Forge, rodando no piloto "${getDeviceName()}".`,
    'Ferramentas MCP disponíveis: list_devices, list_projects, run_command, read_file, write_file, edit_file, list_dir, update_app, dispatch, transfer_project, ask_local_model.',
    `Pedido do usuário: "${t.text}"`,
    'Máquinas: ' + devices.map(d => d.hostname + (d.self ? ' (este PC)' : '')).join(', ') + '.',
    hit ? `O pedido parece ser sobre "${hit.hostname}" (${hit.dnsName}) -- use machine="${hit.hostname}" nas ferramentas.` : '',
    'Se o pedido for sobre continuar/trabalhar num projeto específico: use list_projects pra achar o caminho e a máquina certa; leia "<caminho>/.sploit-handoff.md" com read_file (se existir) pra saber onde a última sessão parou; se o projeto for um repositório git com remote configurado, dê um `git pull` nele via run_command antes de agir.',
    'Ao terminar um trabalho que mudou código num projeto com git+remote: comite e dê `git push`, e reescreva o ".sploit-handoff.md" dele (data/hora, o que foi feito, estado atual, próximo passo) via write_file -- é assim que a pessoa continua o mesmo projeto de outro PC/engine depois.',
    'Regras: execute as ferramentas de verdade antes de responder; pra diagnóstico use comandos de leitura (serviços, logs, fila de impressão, eventos); corrija quando for seguro.',
    'Se pra completar o pedido você precisar fazer algo IRREVERSÍVEL numa máquina real (apagar, reinstalar, reiniciar, mexer em rede/senha, ou qualquer coisa difícil de desfazer): NÃO faça -- em vez disso, termine sua resposta com uma linha exatamente assim: "AGUARDA_APROVACAO: <pergunta objetiva de sim/não sobre o que você quer fazer>". Isso pausa o pedido e pede autorização da pessoa antes de continuar (ela recebe push e aprova/nega do celular). Use isso só quando for de verdade irreversível; pra tudo que for seguro (diagnóstico, configuração, correção, leitura), já execute sem perguntar.',
    'No fim (quando não precisar de aprovação), responda em no máximo 6 linhas: o que encontrou, o que fez e o que falta.',
  ].filter(Boolean).join('\n');
}

// --- engine Claude, modo headless (sem interface) pra Pedidos -------------
// opencode tem um "serve" HTTP (ver ensureOpenCodeServe/openCodeServeFetch);
// Claude Code não -- cada chamada sobe um processo `claude -p` próprio
// (print mode) e sai. O prompt vai via STDIN, nunca como argumento de
// linha de comando, pra nunca precisar escapar aspas/caminho Windows
// dentro do -Command do PowerShell (mesma categoria de pegadinha do
// Git Bash/MSYS já documentada no projeto pra JSON com path). Resume via
// `--resume <session_id>` explícito (não `--continue`, que pega "a mais
// recente" -- não serve se outro Pedido rodar no meio da espera por
// aprovação). --dangerously-skip-permissions: autorizado explicitamente
// pelo usuário em 23/11 pra essa automação específica -- testado à mão
// nesta mesma máquina antes de entrar aqui: sem a flag, o Claude só
// responde "permissão negada" e para (não trava, mas também não executa
// nada -- inútil pro Pedido de verdade fazer algo).
function claudeHeadlessPrompt(directory, instruction, resumeId) {
  if (resumeId && !/^[\w-]+$/.test(resumeId)) return Promise.reject(new Error('sessionId inválido'));
  return new Promise((resolve, reject) => {
    const bin = process.env.CLAUDE_BIN || 'claude';
    const resumeArg = resumeId ? ` --resume '${resumeId}'` : '';
    const child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `& '${bin}' -p --output-format json --dangerously-skip-permissions${resumeArg}`,
    ], { cwd: directory, env: CHILD_ENV, windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    const timer = setTimeout(() => { try { child.kill() } catch {} ; reject(new Error('claude headless: timeout (10min)')) }, 10 * 60 * 1000);
    child.on('error', e => { clearTimeout(timer); reject(e) });
    child.on('exit', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('claude saiu com código ' + code + ': ' + err.slice(0, 300)));
      try {
        const j = JSON.parse(out);
        resolve({ text: j.result || '(sem resposta)', sessionId: j.session_id });
      } catch { reject(new Error('claude: resposta inesperada -- ' + out.slice(0, 300))) }
    });
    child.stdin.write(instruction);
    child.stdin.end();
  });
}

const APPROVAL_RE = /AGUARDA_APROVACAO:\s*(.+)/i;
function applyTaskReply(t, reply) {
  const m = reply.match(APPROVAL_RE);
  if (m) {
    t.status = 'waiting_approval';
    t.question = m[1].trim().slice(0, 400);
  } else {
    t.status = 'done';
    t.finishedAt = Date.now();
  }
  t.reply = reply.slice(0, 2000);
}
const taskStatusEmoji = s => s === 'done' ? '✅ ' : s === 'waiting_approval' ? '⏸ ' : '⚠️ ';
function notifyTask(t) {
  // chave por tarefa (não só 'Pedidos') -- senão dois Pedidos terminando
  // a menos de 20s um do outro faziam o segundo aviso ser engolido pelo
  // debounce de notify(), e um dos dois podia ser justo um que está
  // esperando sua aprovação.
  void notify('Pedidos:' + t.id, taskStatusEmoji(t.status) + ' ' + t.text.slice(0, 80) + ' -- ' + (t.question || t.reply || '').slice(0, 300), '/#view=orders');
}

async function runTask(t) {
  t.status = 'running';
  if (t.engine !== 'claude' && t.engine !== 'opencode') t.engine = getCoordinatorCli();
  saveTasks();
  try {
    fs.mkdirSync(COORD_DIR, { recursive: true });
    ensureCoordinatorMcpConfig();
    const prompt = await operatorPrompt(t);
    let reply, sessionId;
    if (t.engine === 'claude') {
      ({ text: reply, sessionId } = await claudeHeadlessPrompt(COORD_DIR, prompt, null));
    } else {
      ensureOpenCodeServe();
      await waitOpenCodeServe();
      const cr = await openCodeServeFetch('/session', COORD_DIR, { method: 'POST', body: JSON.stringify({ title: 'Pedido: ' + t.text.slice(0, 60) }) });
      if (!cr.ok) throw new Error('não consegui criar sessão: ' + cr.status);
      sessionId = (await cr.json()).id;
      const mr = await openCodeServeFetch(`/session/${sessionId}/message`, COORD_DIR, { method: 'POST', body: JSON.stringify({ parts: [{ type: 'text', text: prompt }] }) });
      if (!mr.ok) throw new Error('o piloto falhou: ' + mr.status + ' ' + (await mr.text()).slice(0, 200));
      const res = await mr.json();
      const parts = res.parts || res.info?.parts || [];
      reply = ([...parts].reverse().find(p => p.type === 'text') || {}).text || '(sem resposta)';
    }
    t.sessionId = sessionId;
    applyTaskReply(t, reply);
  } catch (e) {
    t.reply = String(e.message || e).slice(0, 500);
    t.status = 'error';
    t.finishedAt = Date.now();
  }
  saveTasks();
  notifyTask(t);
}

// continua a MESMA sessão depois de aprovar/negar uma ação pausada (ver
// AGUARDA_APROVACAO) -- fora da taskQueue de propósito: a aprovação pode
// demorar horas (a pessoa só vendo o push depois) e não devia bloquear
// outros Pedidos esperando na fila.
async function resumeTask(t, approved) {
  t.status = 'running';
  saveTasks();
  const followup = approved
    ? 'Autorizado: pode fazer o que você perguntou. Continue e finalize o pedido, respondendo em no máximo 6 linhas o que fez.'
    : 'Negado: não faça essa ação. Finalize respondendo em no máximo 6 linhas o que você faria e o que ficou pendente.';
  try {
    let reply;
    if (t.engine === 'claude') {
      ({ text: reply } = await claudeHeadlessPrompt(COORD_DIR, followup, t.sessionId));
    } else {
      ensureOpenCodeServe();
      await waitOpenCodeServe();
      const mr = await openCodeServeFetch(`/session/${t.sessionId}/message`, COORD_DIR, { method: 'POST', body: JSON.stringify({ parts: [{ type: 'text', text: followup }] }) });
      if (!mr.ok) throw new Error('o piloto falhou: ' + mr.status + ' ' + (await mr.text()).slice(0, 200));
      const res = await mr.json();
      const parts = res.parts || res.info?.parts || [];
      reply = ([...parts].reverse().find(p => p.type === 'text') || {}).text || '(sem resposta)';
    }
    applyTaskReply(t, reply);
  } catch (e) {
    t.reply = String(e.message || e).slice(0, 500);
    t.status = 'error';
    t.finishedAt = Date.now();
  }
  saveTasks();
  notifyTask(t);
}

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
