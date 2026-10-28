// src/pairing.ts
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
import { app, Tray, Menu, BrowserWindow, nativeImage } from "electron";
import path from "path";
import { fileURLToPath } from "url";
var __dirname2 = path.dirname(fileURLToPath(import.meta.url));
var tray = null;
var pcWindows = new Map;
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
function openThisPc() {
  const info = getPairingInfo();
  if (!info.link) {
    tray?.displayBalloon?.({ title: "Sploit-Forge", content: info.error || "Sploit-Forge ainda não está pronto nesta máquina" });
    return;
  }
  openNativeWindow(info.link, "Sploit-Forge");
}
app.setName("forge-tray");
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openThisPc());
}
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true });
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Sploit-Forge");
  tray.on("click", openThisPc);
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Sair", click: () => app.quit() }]));
});
