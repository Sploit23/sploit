import { app, Tray, Menu, BrowserWindow, nativeImage, screen } from "electron"
import path from "path"
import { fileURLToPath } from "url"
import { getPairingInfo } from "./pairing.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null
// uma janela nativa por PC -- clicar de novo foca a que já existe em vez
// de empilhar outra apontando pro mesmo link.
const pcWindows = new Map<string, BrowserWindow>()
// --- Bit: a faixinha de status que fica sempre no topo ---------------------
// Substituiu a barra antiga (só nome+dot+× por PC, feedback real do usuário:
// "aquela barra feia") por um widget que faz 3 coisas que importavam de
// verdade: ver quem tá online/pensando, parear aparelho novo (QR de
// verdade, mesma lib do app), e criar/procurar projeto -- tudo sem precisar
// abrir a janela completa. Status ao vivo via o mesmo /api/events (SSE) que
// a tela Pedidos do PWA já usa, não fica dando polling. Janela continua
// transparente/sem moldura -- "colapsar" é só CSS, a janela nunca muda de
// tamanho de verdade (mais simples que IPC de resize, e o fundo
// transparente já esconde a sobra).
const BAR_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--bg:#05070d;--panel:#11131f;--ln:#1f2436;--mu:#7b85a3;--tx:#eef1fb;--blue:#3ef0d8;--purple:#a855f7;--ok:#2dd4a5;--off:#4a5568;--pink:#ef4fd8}
html,body{margin:0;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none;height:100%}
*{box-sizing:border-box}
body{font:13px/1.4 Inter,"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--tx);display:flex;justify-content:center;align-items:flex-start;padding-top:8px}
.widget{width:272px;border:1px solid #2a3350;background:#0d1120d9;backdrop-filter:blur(14px);box-shadow:0 20px 50px -14px #000000b0, inset 0 1px 0 #ffffff0f;border-radius:18px;overflow:hidden;transition:height .25s}
.whead{display:flex;align-items:center;gap:8px;height:40px;padding:0 8px 0 10px;cursor:pointer}
.wgrip{-webkit-app-region:drag;width:14px;height:100%;flex:none;display:flex;align-items:center;justify-content:center;color:#5a6485;font-size:13px;cursor:move}
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
.widget:not(.expanded) .wctl,.widget:not(.expanded) .chev{display:none}
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
.node .act{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:10px;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node .act b{color:var(--tx);font-weight:600}
.node .upd{margin-top:3px;font-size:9.5px;color:#5a6485}
.node .think{width:4px;height:4px;border-radius:50%;background:var(--pink);flex:none;animation:think 1s ease-in-out infinite}
@keyframes think{0%,100%{transform:scale(.7);opacity:.4}50%{transform:scale(1.15);opacity:1}}
.bit.thinking{animation:thinkpulse 1.1s ease-in-out infinite}
@keyframes thinkpulse{0%,100%{box-shadow:0 0 8px #3ef0d84d}50%{box-shadow:0 0 16px #3ef0d8a0}}
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
    <span class="wgrip" title="arrastar">≡</span>
    <div class="bit" id="bit"><div class="eyes"><span class="eye"></span><span class="eye"></span></div></div>
    <b id="wtitle">verificando PCs...</b>
    <span class="chev">▾</span>
    <button class="wctl" id="wmin" title="minimizar">﹘</button>
    <button class="wctl" id="wclose" title="fechar (continua rodando em segundo plano)">✕</button>
  </div>
  <div class="wbody">
    <div class="page" id="pg-list">
      <div id="approveSlot"></div>
      <div class="wlist" id="wlist"></div>
      <div class="wactions">
        <div class="wa" id="wpair">📱 parear</div>
        <div class="wa" id="wproj">📁 projeto</div>
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
  if(e.target.closest('.wctl,.wgrip'))return;
  widget.classList.toggle('expanded');
});
document.getElementById('wclose').onclick=function(e){e.stopPropagation();window.close()};
document.getElementById('wmin').onclick=function(e){e.stopPropagation();widget.classList.remove('expanded')};

// --- lista de PCs + aprovação pendente -------------------------------------
// activeLabel: pra cada PC, se tem um Pedido running/queued mirando ele,
// mostra o texto do pedido em vez de "ocioso" -- mesmo dado que a tela
// Pedidos do PWA já mostra, só reaproveitado aqui (sem endpoint novo).
var lastTasks=[],thinking=false;
function activeLabel(d){
  var t=lastTasks.find(function(x){return (x.status==='running'||x.status==='queued')&&x.machine&&(x.machine.toLowerCase()===((d.hostname||'').toLowerCase())||x.machine.toLowerCase()===((d.dnsName||'').toLowerCase()))});
  return t ? t.text : null;
}
function renderList(devices){
  lastDevices=devices;
  var list=document.getElementById('wlist');
  var online=devices.filter(function(d){return d.online}).length;
  if(!thinking)document.getElementById('wtitle').textContent=online+'/'+devices.length+' online';
  var pilots=devices.filter(function(d){return d.pilot}),bots=devices.filter(function(d){return !d.pilot});
  var html='';
  if(pilots.length)html+='<div class="lbl">pilotos</div>'+pilots.map(nodeHtml).join('');
  if(bots.length)html+='<div class="lbl">bots</div>'+bots.map(nodeHtml).join('');
  list.innerHTML=html||'<div class="empty">nenhum PC conhecido ainda</div>';
}
// "atualizado há X" por PC -- não é número de versão, só mostra que o
// auto-update passou por ali recentemente (mesmo dado que o PWA mostra na
// tela Central, ver fmtAgo lá; duplicado aqui porque Bit e PWA são
// frontends separados, sem código compartilhado entre os dois).
function fmtAgo(ms){var s=(Date.now()-ms)/1000;if(s<90)return'agora';if(s<3600)return Math.floor(s/60)+'min';if(s<86400)return Math.floor(s/3600)+'h';return Math.floor(s/86400)+'d'}
function nodeHtml(d){
  var act=d.online?activeLabel(d):null;
  var actHtml=!d.online?'':act?'<div class="act"><span class="think"></span>executando: <b>"'+esc(act.length>42?act.slice(0,42)+'…':act)+'"</b></div>':'<div class="act">ocioso</div>';
  var updHtml=d.online&&d.updatedAt?'<div class="upd">atualizado '+fmtAgo(d.updatedAt)+'</div>':'';
  return '<div class="node'+(d.online?'':' off')+'"><div class="nh"><span class="d'+(d.online?' on':' off')+'"></span><span class="nm">'+esc(d.hostname||d.dnsName)+'</span><span class="role'+(d.pilot?'':' bot')+'">'+(d.pilot?'piloto':'bot')+'</span></div>'+actHtml+updHtml+'</div>';
}
var lastDevices=[];
function loadMesh(){ api('/api/mesh').then(renderList).catch(function(){}); }
loadMesh();setInterval(loadMesh,15000);

function renderApprove(tasks){
  lastTasks=tasks||[];
  if(lastDevices.length)renderList(lastDevices); // reflete tarefa nova na lista sem esperar o próximo ciclo do mesh
  var slot=document.getElementById('approveSlot');
  var t=lastTasks.find(function(x){return x.status==='waiting_approval'});
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
  es.onmessage=function(e){
    try{
      var k=JSON.parse(e.data).kind;
      thinking=(k==='busy'||k==='retry');
      bit.classList.toggle('thinking',thinking);
      document.getElementById('wtitle').textContent=thinking?(k==='retry'?'tentando de novo...':'pensando...'):(lastDevices.filter(function(d){return d.online}).length+'/'+lastDevices.length+' online');
      if(k==='idle')setTimeout(loadTasks,1200); // pode ter terminado algo -- atualiza sem esperar o poll de 10s
    }catch(_){}
  };
}catch(_){}
(function blinkLoop(){ setTimeout(function(){ if(!thinking){bit.classList.add('blink');setTimeout(function(){bit.classList.remove('blink')},120)} blinkLoop(); },2200+Math.random()*3200); })();

// --- navegação entre páginas -------------------------------------------
function goto(name){
  ['list','pair','proj'].forEach(function(k){ document.getElementById('pg-'+k).classList.toggle('hidden',k!==name) });
}
document.querySelectorAll('[data-back]').forEach(function(b){b.onclick=function(){goto('list')}});
function paintPairing(devices){
  var self=(devices||[]).find(function(d){return d.self}) || (devices||[])[0];
  var link='https://'+(self&&self.dnsName?self.dnsName:'')+'/#t='+TOKEN;
  document.getElementById('pairlink').value=link;
  document.getElementById('qrbox').innerHTML='';
  if(self&&self.dnsName){ var qr=qrcode(0,'M');qr.addData(link);qr.make();document.getElementById('qrbox').innerHTML=qr.createSvgTag(4); }
}
document.getElementById('wpair').onclick=function(){
  goto('pair');
  // reaproveita o cache de loadMesh() (~5s pra buscar de novo seria bobagem
  // -- o usuário já esperou isso quando a faixinha abriu) -- só busca na
  // hora se ainda não tiver nada (primeiríssimo clique, antes do 1º load).
  if(lastDevices.length)paintPairing(lastDevices);
  else api('/api/mesh').then(function(devices){ lastDevices=devices; paintPairing(devices) });
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
</script></body></html>`
let barWin: BrowserWindow | null = null

// mesmo ícone ">_" com gradiente azul→roxo do manifest PWA (ver
// ICON_ANY_SVG em app/server.js) -- rasterizado em assets/tray-icon-*.png
// porque nativeImage não lê SVG direto (testado: createFromDataURL com um
// data:image/svg+xml dá isEmpty=true). Carrega a versão de 32px e reduz pra
// 16 (ícone renderizado maior e encolhido fica mais nítido que desenhar já
// em 16px direto).
function createTrayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray-icon-32.png"))
  return img.resize({ width: 16, height: 16, quality: "best" })
}

function bringToFront(w: BrowserWindow) {
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
  // Windows nega SetForegroundWindow pra processo que não é o app "ativo" no
  // momento (clicar no ícone da bandeja não conta como foreground de
  // verdade) -- sem isso a janela é criada e mostrada, só que atrás de
  // tudo, parecendo que "não abriu nada".
  app.focus({ steal: true })
}

// janela de verdade (com moldura, redimensionável) carregando o FORGE
// direto -- sem popup customizado, sem depender do navegador padrão do
// Windows pra nada. É o app web de verdade rodando nativo.
function openNativeWindow(url: string, title: string): void {
  const existing = pcWindows.get(url)
  if (existing && !existing.isDestroyed()) {
    bringToFront(existing)
    return
  }
  const pcWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title,
    icon: path.join(__dirname, "..", "assets", "tray-icon-128.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  })
  // sem isso aparece a barra de menu padrão do Electron (File/Edit/View/
  // Window/Help) -- não tem nada a ver com o FORGE, só polui a janela.
  pcWin.removeMenu()
  // clicar num outro PC dentro do app (tela Dispositivos) navega pra outra
  // origem -- sem isso o Electron trocaria ESTA janela de PC inteiro,
  // perdendo de vista o PC que você tinha aberto. Abre uma janela nova pro
  // destino em vez disso, assim dá pra ter "2 PCs abertos ao mesmo tempo".
  pcWin.webContents.on("will-navigate", (e, target) => {
    try {
      const cur = new URL(pcWin.webContents.getURL())
      const dest = new URL(target)
      if (dest.origin !== cur.origin && dest.hash.includes("t=")) {
        e.preventDefault()
        openNativeWindow(target, dest.hostname)
      }
    } catch {}
  })
  void pcWin.loadURL(url)
  pcWindows.set(url, pcWin)
  pcWin.on("closed", () => pcWindows.delete(url))
  pcWin.once("ready-to-show", () => bringToFront(pcWin))
}

function openBar(): void {
  if (barWin && !barWin.isDestroyed()) {
    barWin.show()
    return
  }
  const info = getPairingInfo()
  const width = screen.getPrimaryDisplay().workAreaSize.width
  // alto o bastante pra caber a lista expandida + ações -- "colapsado" é só
  // CSS (ver .widget.expanded no HTML), a janela em si fica desse tamanho
  // sempre, mas o fundo transparente esconde a sobra quando fechado.
  const w = 300, h = 460
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
    webPreferences: { contextIsolation: true, webSecurity: false },
  })
  barWin.setAlwaysOnTop(true, "screen-saver")
  const port = info.port || "7777"
  const html = BAR_HTML.replaceAll("__TOKEN__", JSON.stringify(info.token || ""))
    .replaceAll("__PORT__", JSON.stringify(port))
    .replaceAll("__PORT_RAW__", port)
  void barWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html))
  barWin.on("closed", () => { barWin = null })
}

function toggleBar(): void {
  if (barWin && !barWin.isDestroyed() && barWin.isVisible()) barWin.hide()
  else openBar()
}

function openHub(): void {
  const info = getPairingInfo()
  if (!info.link) {
    // sem link ainda (serviço não instalado, Tailscale sem endereço etc) --
    // não tem pra onde abrir, mas pelo menos não falha em silêncio.
    tray?.displayBalloon?.({ title: "Sploit-Force", content: info.error || "Sploit-Force ainda não está pronto nesta máquina" })
    return
  }
  // clicar na bandeja abre o painel simples (/hub): só a lista de PCs com
  // bolinha online/offline. A interface completa (Projetos/Arquivos/…)
  // continua a um clique de distância, no menu do botão direito.
  openNativeWindow(hubLink(info.link), "Sploit Force")
}

function openThisPc(): void {
  const info = getPairingInfo()
  if (!info.link) {
    tray?.displayBalloon?.({ title: "Sploit-Force", content: info.error || "Sploit-Force ainda não está pronto nesta máquina" })
    return
  }
  openNativeWindow(info.link, "Sploit-Forge")
}

// link do painel a partir do link normal (`https://<dns>/#t=<token>`) --
// o token viaja no fragmento do mesmo jeito, então o /hub já entra logado.
function hubLink(link: string): string {
  return link.replace("/#t=", "/hub#t=")
}

// sem isso, 'bunx electron .' em modo dev não lê o nome do package.json
// (escopado, "@opencode-ai/forge-tray") e cai no userData genérico
// %APPDATA%\Electron -- compartilhado com qualquer outro app Electron
// rodando sem build, risco real de colisão com outro app.
app.setName("forge-tray")

// clicar no ícone da Área de Trabalho de novo com o app já rodando na
// bandeja não deve abrir uma segunda instância (dois ícones de bandeja
// duplicados) -- só foca a janela já aberta (ou abre uma, se nenhuma tava).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => openHub())
}

void app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true })
  tray = new Tray(createTrayIcon())
  tray.setToolTip("Sploit-Forge")
  tray.on("click", toggleBar)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Mostrar/ocultar barra", click: () => toggleBar() },
      { label: "Painel de PCs", click: () => openHub() },
      { label: "Abrir este PC (completo)", click: () => openThisPc() },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ]),
  )
  openBar()
})
