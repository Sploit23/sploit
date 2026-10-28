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
export {
  getPairingInfo
};
