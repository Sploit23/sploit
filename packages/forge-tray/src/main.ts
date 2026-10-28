import { app, Tray, Menu, BrowserWindow, nativeImage } from "electron"
import path from "path"
import { fileURLToPath } from "url"
import { getPairingInfo } from "./pairing.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null
// uma janela nativa por PC -- clicar de novo foca a que já existe em vez
// de empilhar outra apontando pro mesmo link.
const pcWindows = new Map<string, BrowserWindow>()

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

function openThisPc(): void {
  const info = getPairingInfo()
  if (!info.link) {
    // sem link ainda (serviço não instalado, Tailscale sem endereço etc) --
    // não tem pra onde abrir, mas pelo menos não falha em silêncio.
    tray?.displayBalloon?.({ title: "Sploit-Forge", content: info.error || "Sploit-Forge ainda não está pronto nesta máquina" })
    return
  }
  openNativeWindow(info.link, "Sploit-Forge")
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
  app.on("second-instance", () => openThisPc())
}

void app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true })
  tray = new Tray(createTrayIcon())
  tray.setToolTip("Sploit-Forge")
  tray.on("click", openThisPc)
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Sair", click: () => app.quit() }]))
})
