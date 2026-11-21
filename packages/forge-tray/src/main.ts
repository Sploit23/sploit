import { app, Tray, Menu, BrowserWindow, nativeImage, screen } from "electron"
import path from "path"
import { fileURLToPath } from "url"
import { getPairingInfo } from "./pairing.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null
// uma janela nativa por PC -- clicar de novo foca a que já existe em vez
// de empilhar outra apontando pro mesmo link.
const pcWindows = new Map<string, BrowserWindow>()
const BAR_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
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
  const w = 640, h = 80
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
  const html = BAR_HTML.replace("__TOKEN__", JSON.stringify(info.token || "")).replace("__PORT__", JSON.stringify(info.port || "7777"))
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
