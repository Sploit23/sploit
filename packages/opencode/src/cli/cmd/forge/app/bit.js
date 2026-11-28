// Bit, em modo terminal -- substitui o app de bandeja (Electron) por um
// script Node puro que roda direto no console. Motivo (pedido do usuário em
// 28/11): o Electron nunca se auto-atualizava sozinho (instalado uma vez,
// congelado pra sempre -- só um `win-native-install.ps1` manual trazia
// versão nova). Sendo só um .js puro igual o server.js, dá pra colocar na
// mesma lista de auto-update (ver UPDATE_FILES em server.js) -- esse
// arquivo se auto-detecta mudado e se reinicia sozinho (ver
// maybeSelfUpdate), sem precisar de Serviço/Task Scheduler (é um processo
// comum do usuário, não do LocalSystem -- respawn direto é seguro aqui).
'use strict';
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const SELF = __filename;
const DIR = __dirname;
(function loadDotEnv() {
  try {
    fs.readFileSync(path.join(DIR, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^([\w.-]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    });
  } catch {}
})();
const TOKEN = process.env.FORGE_TOKEN || '';
const PORT = +process.env.PORT || 7777;
const BASE = `http://127.0.0.1:${PORT}`;

async function api(p, opts) {
  const r = await fetch(BASE + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts && opts.headers) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

const fmtAgo = ms => {
  if (!ms) return '–';
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return 'agora';
  if (s < 3600) return Math.floor(s / 60) + 'min';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
};

// --- paleta -- mesmas cores do PWA (void/cyan/violeta), truecolor ANSI em
// vez dos 16 básicos pra bater exatamente com o visual de lá.
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bgrgb = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  blue: rgb(0x3e, 0xf0, 0xd8), purple: rgb(0xa8, 0x55, 0xf7), pink: rgb(0xef, 0x4f, 0xd8),
  ok: rgb(0x2d, 0xd4, 0xa5), gray: rgb(0x5a, 0x64, 0x85), red: rgb(0xef, 0x44, 0x44), yellow: rgb(0xf5, 0xc5, 0x42),
};
const clear = () => process.stdout.write('\x1b[2J\x1b[H');

// mascote simples (óculos de hacker, cores do acento) -- cabe em qualquer
// terminal pequeno, sem depender de fonte com emoji/glyph exótico.
const BIT_FACE = [
  C.purple + '  ╭─────────╮' + C.reset,
  C.purple + '  │ ' + C.reset + C.blue + '▄▄' + C.reset + '  ' + C.blue + '▄▄' + C.reset + C.purple + ' │' + C.reset,
  C.purple + '  ╰─────────╯' + C.reset,
];

let devices = [], tasks = [], lastErr = '', paused = false;

async function refresh() {
  if (paused) return;
  try { devices = await api('/api/mesh'); lastErr = ''; }
  catch (e) { lastErr = String(e.message || e).slice(0, 120); }
  try { tasks = await api('/api/tasks'); } catch {}
  render();
}

function render() {
  if (paused) return;
  clear();
  const online = devices.filter(d => d.online).length;
  BIT_FACE.forEach(l => console.log(l));
  console.log('  ' + C.bold + C.blue + 'Sploit-Forge' + C.reset + C.dim + ' · Bit (terminal)' + C.reset);
  console.log('  ' + C.ok + online + '/' + devices.length + ' online' + C.reset + (lastErr ? '  ' + C.red + 'erro: ' + lastErr + C.reset : ''));
  console.log('');
  const waiting = tasks.find(t => t.status === 'waiting_approval');
  if (waiting) {
    console.log('  ' + C.yellow + C.bold + '⏸ PEDIDO ESPERANDO APROVAÇÃO' + C.reset);
    console.log('  ' + waiting.question);
    console.log('  ' + C.dim + '[a] aprovar    [d] negar' + C.reset);
    console.log('');
  }
  const pilots = devices.filter(d => d.pilot), bots = devices.filter(d => !d.pilot);
  const line = d => {
    const dot = d.online ? C.ok + '●' : C.gray + '○';
    const name = C.reset + (d.hostname || d.dnsName || '?').padEnd(14);
    const role = d.pilot ? C.purple + 'piloto' : C.gray + 'bot   ';
    const upd = d.online && d.updatedAt ? C.dim + '  atualizado ' + fmtAgo(d.updatedAt) + C.reset : '';
    const running = tasks.find(t => (t.status === 'running' || t.status === 'queued') && t.machine && (t.machine.toLowerCase() === (d.hostname || '').toLowerCase() || t.machine.toLowerCase() === (d.dnsName || '').toLowerCase()));
    const act = !d.online ? '' : running ? C.pink + '  ' + (running.text || '').slice(0, 50) + C.reset : C.dim + '  ocioso' + C.reset;
    return '  ' + dot + name + '  ' + role + C.reset + act + upd;
  };
  if (pilots.length) { console.log('  ' + C.dim + 'PILOTOS' + C.reset); pilots.forEach(d => console.log(line(d))); console.log(''); }
  if (bots.length) { console.log('  ' + C.dim + 'BOTS' + C.reset); bots.forEach(d => console.log(line(d))); console.log(''); }
  console.log('  ' + C.pink + '[p]' + C.reset + ' parear   ' + C.pink + '[n]' + C.reset + ' novo projeto   ' + C.pink + '[r]' + C.reset + ' atualizar   ' + C.pink + '[q]' + C.reset + ' sair');
}

// --- QR no próprio terminal -- reaproveita o mesmo gerador que o PWA usa
// (vendor/qrcode.min.js, puro JS, já `module.exports`-ável -- não precisa
// de nenhuma dependência npm nova). 2 módulos do QR por linha de terminal
// via meio-bloco Unicode (▀▄█), preto-no-branco de propósito (cores
// forçadas via truecolor, não o tema do terminal) pra escanear igual com
// qualquer app de câmera, do jeito que QR code de verdade é.
let qrGen = null;
try { qrGen = require('./vendor/qrcode.min.js'); } catch {}
function renderQr(text) {
  if (!qrGen) return null;
  let qr = null;
  for (let type = 2; type <= 20 && !qr; type++) {
    try { const q = qrGen(type, 'L'); q.addData(text); q.make(); qr = q; } catch {}
  }
  if (!qr) return null;
  const n = qr.getModuleCount(), quiet = 2, size = n + quiet * 2;
  const dark = (r, c) => r >= quiet && r < quiet + n && c >= quiet && c < quiet + n && qr.isDark(r - quiet, c - quiet);
  const WHITE = bgrgb(255, 255, 255) + rgb(255, 255, 255), BLACK = rgb(0, 0, 0);
  const lines = [];
  for (let y = 0; y < size; y += 2) {
    let line = '';
    for (let x = 0; x < size; x++) {
      const top = dark(y, x), bottom = dark(y + 1, x);
      if (top && bottom) line += BLACK + bgrgb(255, 255, 255) + '█';
      else if (top && !bottom) line += BLACK + bgrgb(255, 255, 255) + '▀';
      else if (!top && bottom) line += BLACK + bgrgb(255, 255, 255) + '▄';
      else line += WHITE + ' ';
    }
    lines.push('  ' + line + C.reset);
  }
  return lines;
}

// --- ações que precisam de teclado "normal" (sair do raw mode um instante) --
async function withPrompt(fn) {
  paused = true;
  process.stdin.setRawMode(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { await fn(rl); } catch (e) { console.log(C.red + 'erro: ' + (e.message || e) + C.reset); await new Promise(r => setTimeout(r, 1500)); }
  rl.close();
  process.stdin.setRawMode(true);
  paused = false;
  refresh();
}

async function doPair() {
  await withPrompt(async () => {
    const self = devices.find(d => d.self);
    if (!self || !self.dnsName) { console.log(C.red + 'dnsName ainda não resolvido -- tenta de novo em alguns segundos.' + C.reset); await new Promise(r => setTimeout(r, 1500)); return; }
    const link = 'https://' + self.dnsName + '/#t=' + TOKEN;
    clear();
    console.log('  ' + C.bold + C.blue + 'Pareamento' + C.reset);
    console.log('');
    const qr = renderQr(link);
    if (qr) { qr.forEach(l => console.log(l)); console.log(''); }
    console.log('  Abra a câmera do celular (mesma conta Tailscale) e escaneie,');
    console.log('  ou digite o link direto:');
    console.log('');
    console.log('  ' + C.bold + C.pink + link + C.reset);
    console.log('');
    console.log('  ' + C.dim + '[enter] voltar' + C.reset);
    await new Promise(resolve => { const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout }); rl2.question('', () => { rl2.close(); resolve(); }); });
  });
}

async function doNewProject() {
  await withPrompt(async rl => {
    const name = await new Promise(r => rl.question('nome do projeto (letras, números, -): ', r));
    if (!name || !name.trim()) return;
    const git = await new Promise(r => rl.question('url git pra clonar (opcional, enter pra pular): ', r));
    console.log(C.dim + 'criando...' + C.reset);
    await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: name.trim(), git: (git || '').trim() }) });
    console.log(C.ok + 'criado.' + C.reset);
    await new Promise(r => setTimeout(r, 1000));
  });
}

async function doApprove(approved) {
  const waiting = tasks.find(t => t.status === 'waiting_approval');
  if (!waiting) return;
  try { await api(`/api/task/${waiting.id}/approve`, { method: 'POST', body: JSON.stringify({ approved }) }); } catch {}
  refresh();
}

// --- auto-update: este processo é do usuário comum (não LocalSystem), um
// respawn direto é seguro -- sem Task Scheduler, sem Serviço, só spawn +
// exit. Detecta mudança comparando o mtime do próprio arquivo com o que
// tinha no boot (o auto-update do server.js sobrescreve isso via
// fs.writeFileSync, que sempre reseta o mtime).
let bootMtime = 0;
try { bootMtime = fs.statSync(SELF).mtimeMs } catch {}
function maybeSelfUpdate() {
  let m = 0;
  try { m = fs.statSync(SELF).mtimeMs } catch { return }
  if (m <= bootMtime) return;
  console.log('\n' + C.blue + '  versão nova detectada, abrindo janela nova...' + C.reset);
  // achado em 28/11 (Escritório): `stdio: 'inherit'` aqui fazia o processo
  // novo tentar herdar o console do processo VELHO, que está pra sumir no
  // `process.exit()` logo abaixo -- a janela fechava e não reabria
  // sozinha, só reabrindo manualmente resolvia. `stdio: 'ignore'` (sem
  // herdar nada) faz o Windows abrir um console PRÓPRIO pro processo
  // novo, independente do destino do processo velho -- testado na mão,
  // reabre certinho sozinho agora.
  const child = spawn(process.execPath, [SELF], { detached: true, stdio: 'ignore', cwd: DIR });
  child.unref();
  process.exit(0);
}

function main() {
  if (!TOKEN) { console.error('FORGE_TOKEN não encontrado (.env ausente?) -- rode a partir da pasta do FORGE.'); process.exit(1); }
  process.title = 'Sploit Forge - Bit';
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('keypress', (str, key) => {
    if (paused) return;
    if (key && key.ctrl && key.name === 'c') return quit();
    if (str === 'q') return quit();
    if (str === 'r') return void refresh();
    if (str === 'p') return void doPair();
    if (str === 'n') return void doNewProject();
    if (str === 'a') return void doApprove(true);
    if (str === 'd') return void doApprove(false);
  });
  function quit() { clear(); process.exit(0) }
  refresh();
  setInterval(refresh, 8000);
  setInterval(maybeSelfUpdate, 60000);
}
main();
