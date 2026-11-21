// src/main.ts
import { app, Tray, Menu, BrowserWindow, nativeImage, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";

// src/pairing.js
import { spawnSync } from "child_process";
import fs from "fs";
var TIMEOUT_MS = 15000;
var NATIVE_DAEMON_XML = "C:\\ProgramData\\SploitForge\\daemon\\sploitforge.xml";
function resolveTailscaleExe() {
  const probe = spawnSync("tailscale", ["version"], { encoding: "utf8", timeout: TIMEOUT_MS });
  if (!probe.error)
    return "tailscale";
  const fallback = "C:\\Program Files\\Tailscale\\tailscale.exe";
  return fs.existsSync(fallback) ? fallback : "tailscale";
}
function readNativeEnv(xml, name) {
  return new RegExp(`<env name="${name}" value="([^"]*)"`).exec(xml)?.[1];
}
function getNativePairingInfo() {
  if (!fs.existsSync(NATIVE_DAEMON_XML))
    return;
  let xml;
  try {
    xml = fs.readFileSync(NATIVE_DAEMON_XML, "utf8");
  } catch {
    return;
  }
  const token = readNativeEnv(xml, "FORGE_TOKEN");
  const port = readNativeEnv(xml, "PORT") || "7777";
  if (!token)
    return { ok: false, running: false, error: "token não encontrado na config do serviço nativo" };
  const svc = spawnSync("sc", ["query", "sploitforge.exe"], { encoding: "utf8", timeout: TIMEOUT_MS });
  const running = /RUNNING/.test(svc.stdout || "");
  const statusRes = spawnSync(resolveTailscaleExe(), ["status", "--json"], { encoding: "utf8", timeout: TIMEOUT_MS });
  let dnsName;
  try {
    const parsed = JSON.parse(statusRes.stdout);
    dnsName = parsed.Self?.DNSName?.replace(/\.$/, "");
  } catch {}
  if (!dnsName)
    return { ok: true, running, token, port, error: "Tailscale sem endereço ainda (logado?)" };
  return { ok: true, running, dnsName, token, port, link: `https://${dnsName}/#t=${token}` };
}
function decodeWslMeta(buf) {
  if (!buf || buf.length === 0)
    return "";
  return buf.toString("utf16le").replace(/\0/g, "").trim();
}
function listDistros() {
  const res = spawnSync("wsl.exe", ["-l", "-q"], { encoding: "buffer", timeout: TIMEOUT_MS });
  return decodeWslMeta(res.stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
function pickDistro(distros) {
  const isDocker = (d) => /^docker-desktop/i.test(d);
  return distros.find((d) => /ubuntu|debian/i.test(d) && !isDocker(d)) ?? distros.find((d) => !isDocker(d));
}
function getWslPairingInfo() {
  const distro = pickDistro(listDistros());
  if (!distro)
    return { ok: false, running: false, error: "Nenhuma distribuição WSL encontrada" };
  const tokenRes = spawnSync("wsl.exe", ["-d", distro, "-u", "root", "--", "bash", "-c", "grep '^FORGE_TOKEN=' /opt/forge/.env 2>/dev/null | cut -d= -f2"], { encoding: "utf8", timeout: TIMEOUT_MS });
  const token = (tokenRes.stdout || "").trim();
  if (!token)
    return { ok: false, running: false, error: "FORGE não instalado nessa WSL ainda" };
  const activeRes = spawnSync("wsl.exe", ["-d", distro, "-u", "root", "--", "bash", "-c", "systemctl is-active forge 2>/dev/null"], {
    encoding: "utf8",
    timeout: TIMEOUT_MS
  });
  const running = activeRes.stdout.trim() === "active";
  const statusRes = spawnSync("wsl.exe", ["-d", distro, "-u", "root", "--", "tailscale", "status", "--json"], {
    encoding: "utf8",
    timeout: TIMEOUT_MS
  });
  let dnsName;
  try {
    const parsed = JSON.parse(statusRes.stdout);
    dnsName = parsed.Self?.DNSName?.replace(/\.$/, "");
  } catch {}
  if (!dnsName)
    return { ok: true, running, token, error: "Tailscale sem endereço ainda (logado?)" };
  return { ok: true, running, dnsName, token, link: `https://${dnsName}/#t=${token}` };
}
function getPairingInfo() {
  return getNativePairingInfo() ?? getWslPairingInfo();
}

// src/main.ts
var __dirname2 = path.dirname(fileURLToPath(import.meta.url));
var tray = null;
var pcWindows = new Map;
var BAR_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent;overflow:hidden;user-select:none}
#bar{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;background:rgba(8,11,20,.88);border:1px solid rgba(125,211,252,.25);border-radius:14px;backdrop-filter:blur(10px);box-shadow:0 8px 30px rgba(0,0,0,.45);font:11px ui-monospace,Consolas,monospace;color:#e6edf7}
.pc{display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid;border-radius:10px;background:rgba(17,24,39,.92);font:inherit;white-space:nowrap}
.pc.main{border-color:rgba(125,211,252,.55);color:#7dd3fc}
.pc.bot{border-color:rgba(52,211,153,.5);color:#6ee7b7}
.dot{width:7px;height:7px;border-radius:50%;background:#64748b}
.dot.on{background:#34d399;box-shadow:0 0 6px #34d399}
.close{margin-left:4px;width:20px;height:20px;padding:0;border:1px solid rgba(148,163,184,.55);border-radius:6px;background:rgba(30,41,59,.95);color:#e2e8f0;font:bold 14px ui-monospace,Consolas,monospace;cursor:pointer;line-height:18px;text-align:center}
.close:hover{background:rgba(71,85,105,.95);color:#fff}
</style></head><body><div id="bar"></div><script>
var TOKEN=__TOKEN__,PORT=__PORT__;
function api(p){return fetch('http://127.0.0.1:'+PORT+p,{headers:{Authorization:'Bearer '+TOKEN}}).then(function(r){return r.json()})}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function render(devices,desktops){
  document.getElementById('bar').innerHTML=devices.map(function(d){
    var key=d.self?'local':(d.dnsName||d.hostname),main=!!desktops[key];
    return '<div class="pc '+(main?'main':'bot')+'" title="'+(main?'PC principal':'bot')+'"><span class="dot '+(d.online?'on':'')+'"></span>'+esc(d.hostname||key)+'</div>';
  }).join('')+'<button class="close" id="close" title="Fechar barra">&times;</button>';
}
function load(){
  api('/api/mesh').then(function(devices){
    Promise.all(devices.map(function(d){
      return d.self?api('/api/stats'):api('/api/stats?machine='+encodeURIComponent(d.dnsName||d.hostname)).catch(function(){return {desktop:false}});
    })).then(function(stats){
      var desktops={};devices.forEach(function(d,i){desktops[d.self?'local':(d.dnsName||d.hostname)]=!!stats[i].desktop});
      render(devices,desktops);
    });
  }).catch(function(){});
}
load();setInterval(load,8000);
document.addEventListener('click',function(e){if(e.target&&e.target.id==='close') window.close()});
</script></body></html>`;
var barWin = null;
function createTrayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname2, "..", "assets", "tray-icon-32.png"));
  return img.resize({ width: 16, height: 16, quality: "best" });
}
function bringToFront(w) {
  if (w.isMinimized())
    w.restore();
  w.show();
  w.focus();
  app.focus({ steal: true });
}
function openNativeWindow(url, title) {
  const existing = pcWindows.get(url);
  if (existing && !existing.isDestroyed()) {
    bringToFront(existing);
    return;
  }
  const pcWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title,
    icon: path.join(__dirname2, "..", "assets", "tray-icon-128.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  });
  pcWin.removeMenu();
  pcWin.webContents.on("will-navigate", (e, target) => {
    try {
      const cur = new URL(pcWin.webContents.getURL());
      const dest = new URL(target);
      if (dest.origin !== cur.origin && dest.hash.includes("t=")) {
        e.preventDefault();
        openNativeWindow(target, dest.hostname);
      }
    } catch {}
  });
  pcWin.loadURL(url);
  pcWindows.set(url, pcWin);
  pcWin.on("closed", () => pcWindows.delete(url));
  pcWin.once("ready-to-show", () => bringToFront(pcWin));
}
function openBar() {
  if (barWin && !barWin.isDestroyed()) {
    barWin.show();
    return;
  }
  const info = getPairingInfo();
  const width = screen.getPrimaryDisplay().workAreaSize.width;
  const w = 640, h = 80;
  barWin = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round((width - w) / 2),
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: { contextIsolation: true, webSecurity: false }
  });
  barWin.setAlwaysOnTop(true, "screen-saver");
  const html = BAR_HTML.replace("__TOKEN__", JSON.stringify(info.token || "")).replace("__PORT__", JSON.stringify(info.port || "7777"));
  barWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  barWin.on("closed", () => {
    barWin = null;
  });
}
function toggleBar() {
  if (barWin && !barWin.isDestroyed() && barWin.isVisible())
    barWin.hide();
  else
    openBar();
}
function openHub() {
  const info = getPairingInfo();
  if (!info.link) {
    tray?.displayBalloon?.({ title: "Sploit-Force", content: info.error || "Sploit-Force ainda não está pronto nesta máquina" });
    return;
  }
  openNativeWindow(hubLink(info.link), "Sploit Force");
}
function openThisPc() {
  const info = getPairingInfo();
  if (!info.link) {
    tray?.displayBalloon?.({ title: "Sploit-Force", content: info.error || "Sploit-Force ainda não está pronto nesta máquina" });
    return;
  }
  openNativeWindow(info.link, "Sploit-Forge");
}
function hubLink(link) {
  return link.replace("/#t=", "/hub#t=");
}
app.setName("forge-tray");
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openHub());
}
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true });
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Sploit-Forge");
  tray.on("click", toggleBar);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Mostrar/ocultar barra", click: () => toggleBar() },
    { label: "Painel de PCs", click: () => openHub() },
    { label: "Abrir este PC (completo)", click: () => openThisPc() },
    { type: "separator" },
    { label: "Sair", click: () => app.quit() }
  ]));
  openBar();
});
