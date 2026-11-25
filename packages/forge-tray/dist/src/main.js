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
:root{--bg:#05070d;--panel:#11131f;--ln:#1f2436;--mu:#7b85a3;--tx:#eef1fb;--blue:#3ef0d8;--purple:#a855f7;--ok:#2dd4a5;--off:#4a5568;--pink:#ef4fd8}
html,body{margin:0;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none;height:100%}
*{box-sizing:border-box}
body{font:13px/1.4 Inter,"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--tx);display:flex;justify-content:center;padding-top:8px}
.widget{width:272px;border:1px solid #2a3350;background:#0d1120d9;backdrop-filter:blur(14px);box-shadow:0 20px 50px -14px #000000b0, inset 0 1px 0 #ffffff0f;border-radius:18px;overflow:hidden;transition:height .25s}
.whead{display:flex;align-items:center;gap:8px;height:40px;padding:0 8px 0 10px;cursor:pointer;-webkit-app-region:drag}
.whead button{-webkit-app-region:no-drag}
.bit{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,var(--blue),var(--purple));flex:none;position:relative;box-shadow:0 0 8px #3ef0d84d;transition:background .4s,box-shadow .4s}
.bit .eyes{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);display:flex;gap:4px}
.bit .eye{width:3px;height:3px;border-radius:50%;background:#06101a;transition:height .12s}
.bit.blink .eye{height:1px;border-radius:1px}
.widget.needs .bit{background:linear-gradient(135deg,var(--pink),#ff8a3d);box-shadow:0 0 12px #ef4fd8a0;animation:bitshake .5s ease-in-out infinite}
@keyframes bitshake{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}
.whead b{font-size:11.5px;font-weight:700;white-space:nowrap;flex:1}
.widget.needs .whead b{color:var(--pink)}
.whead .chev{color:var(--mu);font-size:10px;transition:transform .3s}
.widget.expanded .whead .chev{transform:rotate(180deg)}
.wctl{width:18px;height:18px;border-radius:5px;border:none;background:transparent;color:var(--mu);font-size:10px;cursor:pointer}
.wctl:hover{background:#ffffff1a;color:var(--tx)}
.wbody{display:none;flex-direction:column;max-height:380px}
.widget.expanded .wbody{display:flex}
.page{display:flex;flex-direction:column}
.page.hidden{display:none}
.wlist{overflow-y:auto;padding:2px 8px 6px;display:flex;flex-direction:column;gap:5px;max-height:240px}
.lbl{font:9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.1em;color:#5a6485;text-transform:uppercase;margin:6px 2px 0}
.node{border:1px solid #1f2436;background:#11131fb0;border-radius:10px;padding:7px 9px}
.node .nh{display:flex;align-items:center;gap:6px}
.node .d{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 5px #2dd4a580;flex:none}
.node .d.off{background:var(--off);box-shadow:none}
.node .nm{font-size:11.5px;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node .role{font:8px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--blue);border:1px solid #3ef0d84a;border-radius:9px;padding:1px 5px}
.node .role.bot{color:#6a7493;border-color:#1f2436}
.node.off{opacity:.45}
.wactions{display:flex;gap:7px;padding:8px}
.wa{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 0;border-radius:9px;border:1px solid #1f2436;background:#161a2a;color:var(--tx);cursor:pointer;font-size:10.5px;font-weight:700}
.wa:hover{border-color:var(--blue)}
.phead{display:flex;align-items:center;gap:7px;padding:8px 10px 2px}
.back{width:19px;height:19px;border-radius:50%;background:#161a2a;border:1px solid #1f2436;color:var(--mu);cursor:pointer;font-size:11px}
.phead b{font-size:11px}
.pbody{padding:4px 12px 12px;display:flex;flex-direction:column;align-items:center;gap:8px}
#qrbox{width:140px;height:140px;border-radius:9px;overflow:hidden;background:#0a0d16;border:1px solid #1f2436}
#qrbox svg{width:100%;height:100%}
.qrhint{font-size:10px;color:var(--mu);text-align:center}
.linkrow{width:100%;display:flex;gap:5px}
.linkrow input{flex:1;background:#0d1320;border:1px solid #1f2436;border-radius:7px;padding:6px 8px;color:var(--mu);font:9.5px ui-monospace,Consolas,monospace;min-width:0}
.linkrow button{border-radius:7px;border:1px solid #1f2436;background:#161a2a;color:var(--tx);font-size:10px;font-weight:700;padding:0 8px;cursor:pointer}
.pform{width:100%;display:flex;flex-direction:column;gap:6px}
.pform label{font:8.5px ui-monospace,Consolas,monospace;color:#5a6485;text-transform:uppercase}
.pform input{background:#0d1320;border:1px solid #1f2436;border-radius:8px;padding:7px 8px;color:var(--tx);font-size:11px}
.pgo{border:none;border-radius:8px;padding:8px 0;color:#06110f;background:linear-gradient(135deg,var(--blue),var(--purple));font-size:11px;font-weight:700;cursor:pointer}
.por{text-align:center;color:#5a6485;font-size:9.5px}
.pbrowse{border:1px solid #1f2436;background:#161a2a;border-radius:8px;padding:8px 0;color:var(--tx);font-size:11px;font-weight:600;cursor:pointer}
.approve{border:1px solid #ef4fd84a;background:#1a0f20c0;border-radius:10px;padding:8px 9px;margin:0 8px 6px}
.approve .ah{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--pink);font-weight:700;margin-bottom:4px}
.approve .aq{font-size:10.5px;color:var(--tx);line-height:1.4;margin-bottom:6px}
.approve .arow{display:flex;gap:6px}
.approve button{flex:1;border-radius:7px;padding:6px 0;font-size:10px;font-weight:700;border:1px solid #1f2436;background:#161a2a;color:var(--tx);cursor:pointer}
.approve .allow{border-color:transparent;background:linear-gradient(135deg,var(--blue),var(--purple));color:#06110f}
.empty{color:#5a6485;font-size:10.5px;text-align:center;padding:14px 8px}
</style></head><body>
<div class="widget" id="widget">
  <div class="whead" id="whead">
    <div class="bit" id="bit"><div class="eyes"><span class="eye"></span><span class="eye"></span></div></div>
    <b id="wtitle">carregando...</b>
    <span class="chev">▾</span>
    <button class="wctl" id="wclose" title="fechar (continua rodando em segundo plano)">✕</button>
  </div>
  <div class="wbody">
    <div class="page" id="pg-list">
      <div id="approveSlot"></div>
      <div class="wlist" id="wlist"></div>
      <div class="wactions">
        <div class="wa" id="wpair">\uD83D\uDCF1 parear</div>
        <div class="wa" id="wproj">\uD83D\uDCC1 projeto</div>
      </div>
    </div>
    <div class="page hidden" id="pg-pair">
      <div class="phead"><div class="back" data-back>‹</div><b>parear aparelho novo</b></div>
      <div class="pbody">
        <div id="qrbox"></div>
        <div class="qrhint">escaneia com a câmera do celular, ou copia o link</div>
        <div class="linkrow"><input id="pairlink" readonly><button id="copylink">copiar</button></div>
      </div>
    </div>
    <div class="page hidden" id="pg-proj">
      <div class="phead"><div class="back" data-back>‹</div><b>novo projeto</b></div>
      <div class="pbody">
        <div class="pform">
          <label>nome</label><input id="pname" placeholder="ex: kauanne_natal-loja4">
          <label>git (opcional, clona direto)</label><input id="pgit" placeholder="https://github.com/...">
          <button class="pgo" id="pcreate">criar</button>
        </div>
        <div class="qrhint">pra procurar uma pasta já existente, abra "Abrir este PC" no menu da bandeja.</div>
      </div>
    </div>
  </div>
</div>
<script src="http://127.0.0.1:__PORT_RAW__/vendor/qrcode.min.js"></script>
<script>
var TOKEN=__TOKEN__,PORT=__PORT__;
function api(p,opts){return fetch('http://127.0.0.1:'+PORT+p,Object.assign({headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'}},opts||{})).then(function(r){return r.json()})}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var widget=document.getElementById('widget');
document.getElementById('whead').addEventListener('click',function(e){
  if(e.target.closest('.wctl'))return;
  widget.classList.toggle('expanded');
});
document.getElementById('wclose').onclick=function(e){e.stopPropagation();window.close()};

// --- lista de PCs + aprovação pendente -------------------------------------
function renderList(devices){
  var list=document.getElementById('wlist');
  var online=devices.filter(function(d){return d.online}).length;
  document.getElementById('wtitle').textContent=online+'/'+devices.length+' online';
  var pilots=devices.filter(function(d){return d.pilot}),bots=devices.filter(function(d){return !d.pilot});
  var html='';
  if(pilots.length)html+='<div class="lbl">pilotos</div>'+pilots.map(nodeHtml).join('');
  if(bots.length)html+='<div class="lbl">bots</div>'+bots.map(nodeHtml).join('');
  list.innerHTML=html||'<div class="empty">nenhum PC conhecido ainda</div>';
}
function nodeHtml(d){
  return '<div class="node'+(d.online?'':' off')+'"><div class="nh"><span class="d'+(d.online?' on':' off')+'"></span><span class="nm">'+esc(d.hostname||d.dnsName)+'</span><span class="role'+(d.pilot?'':' bot')+'">'+(d.pilot?'piloto':'bot')+'</span></div></div>';
}
function loadMesh(){ api('/api/mesh').then(renderList).catch(function(){}); }
loadMesh();setInterval(loadMesh,15000);

function renderApprove(tasks){
  var slot=document.getElementById('approveSlot');
  var t=(tasks||[]).find(function(x){return x.status==='waiting_approval'});
  widget.classList.toggle('needs',!!t);
  if(!t){slot.innerHTML='';return}
  slot.innerHTML='<div class="approve"><div class="ah">⏸ esperando você</div><div class="aq">'+esc(t.question||t.text)+'</div><div class="arow"><button data-deny="'+t.id+'">negar</button><button class="allow" data-allow="'+t.id+'">permitir</button></div></div>';
}
function loadTasks(){ api('/api/tasks').then(renderApprove).catch(function(){}); }
loadTasks();setInterval(loadTasks,10000);
document.addEventListener('click',function(e){
  var id=e.target.getAttribute('data-allow')||e.target.getAttribute('data-deny');
  if(!id)return;
  api('/api/task/'+encodeURIComponent(id)+'/approve',{method:'POST',body:JSON.stringify({approved:!!e.target.getAttribute('data-allow')})}).then(loadTasks);
});

// --- status ao vivo (pensando/ocioso) via SSE, zero polling extra ----------
var bit=document.getElementById('bit');
try{
  var es=new EventSource('http://127.0.0.1:'+PORT+'/api/events?token='+encodeURIComponent(TOKEN));
  es.onmessage=function(e){ try{ var k=JSON.parse(e.data).kind; if(k==='busy'){ setTimeout(loadTasks,1500) } }catch(_){} };
}catch(_){}
(function blinkLoop(){ setTimeout(function(){ bit.classList.add('blink'); setTimeout(function(){bit.classList.remove('blink')},120); blinkLoop(); },2200+Math.random()*3200); })();

// --- navegação entre páginas -------------------------------------------
function goto(name){
  ['list','pair','proj'].forEach(function(k){ document.getElementById('pg-'+k).classList.toggle('hidden',k!==name) });
}
document.querySelectorAll('[data-back]').forEach(function(b){b.onclick=function(){goto('list')}});
document.getElementById('wpair').onclick=function(){
  goto('pair');
  api('/api/mesh').then(function(devices){
    var self=devices.find(function(d){return d.self}) || devices[0];
    var link='https://'+(self&&self.dnsName?self.dnsName:'')+'/#t='+TOKEN;
    document.getElementById('pairlink').value=link;
    var qr=qrcode(0,'M');qr.addData(link);qr.make();
    document.getElementById('qrbox').innerHTML=qr.createSvgTag(4);
  });
};
document.getElementById('copylink').onclick=function(){
  var v=document.getElementById('pairlink').value;
  navigator.clipboard.writeText(v).then(function(){
    var b=document.getElementById('copylink');b.textContent='✓ copiado';setTimeout(function(){b.textContent='copiar'},1500);
  });
};
document.getElementById('wproj').onclick=function(){goto('proj')};
document.getElementById('pcreate').onclick=function(){
  var name=document.getElementById('pname').value.trim(),git=document.getElementById('pgit').value.trim();
  if(!name)return;
  api('/api/projects',{method:'POST',body:JSON.stringify({name:name,git:git})}).then(function(r){
    if(r&&r.ok){goto('list');document.getElementById('pname').value='';document.getElementById('pgit').value=''}
  });
};
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
  const w = 300, h = 460;
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
  const port = info.port || "7777";
  const html = BAR_HTML.replaceAll("__TOKEN__", JSON.stringify(info.token || "")).replaceAll("__PORT__", JSON.stringify(port)).replaceAll("__PORT_RAW__", port);
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
