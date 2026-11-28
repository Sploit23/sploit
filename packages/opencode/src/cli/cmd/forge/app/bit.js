// Bit, em modo terminal -- substitui o app de bandeja (Electron) por um
// script Node puro que roda direto no console. Motivo (pedido do usuário em
// 28/11): o Electron nunca se auto-atualizava sozinho (instalado uma vez,
// congelado pra sempre -- só um `win-native-install.ps1` manual trazia
// versão nova). Sendo só um .js puro igual o server.js, dá pra colocar na
// mesma lista de auto-update (ver UPDATE_FILES em server.js) -- esse
// arquivo se auto-detecta mudado e se reinicia sozinho (ver
// maybeSelfUpdate), sem precisar de Serviço/Task Scheduler (é um processo
// comum do usuário, não do LocalSystem -- respawn direto é seguro aqui).
// Custo aceito conscientemente: perde o visual rico do Electron (mascote,
// QR gráfico, arrastar janela) -- vira tudo texto/teclado.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
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
const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', gray: '\x1b[90m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m' };
const clear = () => process.stdout.write('\x1b[2J\x1b[H');

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
  console.log(C.bold + C.cyan + '  Sploit-Forge — Bit' + C.reset + C.dim + '  (terminal)' + C.reset);
  console.log(C.dim + '  ' + online + '/' + devices.length + ' online' + (lastErr ? '  ' + C.red + 'erro: ' + lastErr + C.reset : '') + C.reset);
  console.log('');
  const waiting = tasks.find(t => t.status === 'waiting_approval');
  if (waiting) {
    console.log(C.yellow + C.bold + '  ⏸ PEDIDO ESPERANDO APROVAÇÃO' + C.reset);
    console.log('  ' + waiting.question);
    console.log(C.dim + '  [a] aprovar    [d] negar' + C.reset);
    console.log('');
  }
  const pilots = devices.filter(d => d.pilot), bots = devices.filter(d => !d.pilot);
  const line = d => {
    const dot = d.online ? C.green + '●' : C.gray + '○';
    const name = (d.hostname || d.dnsName || '?').padEnd(14);
    const role = d.pilot ? C.cyan + 'piloto' : C.gray + 'bot   ';
    const upd = d.online && d.updatedAt ? C.dim + '  atualizado ' + fmtAgo(d.updatedAt) + C.reset : '';
    const running = tasks.find(t => (t.status === 'running' || t.status === 'queued') && t.machine && (t.machine.toLowerCase() === (d.hostname || '').toLowerCase() || t.machine.toLowerCase() === (d.dnsName || '').toLowerCase()));
    const act = !d.online ? '' : running ? C.dim + '  ' + (running.text || '').slice(0, 50) + C.reset : C.dim + '  ocioso' + C.reset;
    return '  ' + dot + C.reset + ' ' + name + '  ' + role + C.reset + act + upd;
  };
  if (pilots.length) { console.log(C.dim + '  PILOTOS' + C.reset); pilots.forEach(d => console.log(line(d))); console.log(''); }
  if (bots.length) { console.log(C.dim + '  BOTS' + C.reset); bots.forEach(d => console.log(line(d))); console.log(''); }
  console.log(C.dim + '  [p] parear   [n] novo projeto   [r] atualizar   [q] sair' + C.reset);
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
    console.log(C.bold + C.cyan + '  Pareamento' + C.reset);
    console.log('');
    console.log('  Abra esse link no celular (mesma conta Tailscale):');
    console.log('');
    console.log('  ' + C.bold + link + C.reset);
    console.log('');
    console.log(C.dim + '  [enter] voltar' + C.reset);
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
    console.log(C.green + 'criado.' + C.reset);
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
  console.log('\n' + C.cyan + '  versão nova detectada, reiniciando...' + C.reset);
  const child = spawn(process.execPath, [SELF], { detached: true, stdio: 'inherit', cwd: DIR });
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
