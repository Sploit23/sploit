// Le o token/status do FORGE -- nativo (Serviço do Windows, sem WSL) ou,
// se não achar a instalação nativa, cai pro caminho WSL antigo. Reimplementa
// só o necessário em vez de importar packages/opencode (evita acoplar um app
// Electron pequeno a um workspace gigante) -- mesma lógica já provada em
// cli/cmd/forge/{platform,token,tailscale}.ts.
import { spawnSync } from "child_process"
import fs from "fs"

// sem timeout, um wsl.exe/tailscale.exe que nao retorna trava a popup pra
// sempre, em silencio -- mesmo bug que corrigimos hoje no listWslDistros do CLI.
const TIMEOUT_MS = 15_000

const NATIVE_DAEMON_XML = "C:\\ProgramData\\SploitForge\\daemon\\sploitforge.xml"

function resolveTailscaleExe(): string {
  const probe = spawnSync("tailscale", ["version"], { encoding: "utf8", timeout: TIMEOUT_MS })
  if (!probe.error) return "tailscale"
  const fallback = "C:\\Program Files\\Tailscale\\tailscale.exe"
  return fs.existsSync(fallback) ? fallback : "tailscale"
}

function readNativeEnv(xml: string, name: string): string | undefined {
  return new RegExp(`<env name="${name}" value="([^"]*)"`).exec(xml)?.[1]
}

function getNativePairingInfo(): PairingInfo | undefined {
  if (!fs.existsSync(NATIVE_DAEMON_XML)) return undefined
  let xml: string
  try {
    xml = fs.readFileSync(NATIVE_DAEMON_XML, "utf8")
  } catch {
    return undefined
  }
  const token = readNativeEnv(xml, "FORGE_TOKEN")
  const port = readNativeEnv(xml, "PORT") || "7777"
  if (!token) return { ok: false, running: false, error: "token não encontrado na config do serviço nativo" }

  // nome do serviço no SCM é "sploitforge.exe" (o <id> do XML, não o <name>
  // "SploitForge" que aparece no services.msc) -- "sc query SploitForge"
  // simplesmente não acha o serviço (erro 1060) e sempre voltava running:false.
  const svc = spawnSync("sc", ["query", "sploitforge.exe"], { encoding: "utf8", timeout: TIMEOUT_MS })
  const running = /RUNNING/.test(svc.stdout || "")

  const statusRes = spawnSync(resolveTailscaleExe(), ["status", "--json"], { encoding: "utf8", timeout: TIMEOUT_MS })
  let dnsName: string | undefined
  try {
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- `tailscale status --json` is a trusted, stable CLI output shape.
    const parsed = JSON.parse(statusRes.stdout) as { Self?: { DNSName?: string } }
    dnsName = parsed.Self?.DNSName?.replace(/\.$/, "")
  } catch {}

  if (!dnsName) return { ok: true, running, token, port, error: "Tailscale sem endereço ainda (logado?)" }
  return { ok: true, running, dnsName, token, port, link: `https://${dnsName}/#t=${token}` }
}

function decodeWslMeta(buf: Buffer | undefined): string {
  if (!buf || buf.length === 0) return ""
  return buf.toString("utf16le").replace(/\0/g, "").trim()
}

function listDistros(): string[] {
  const res = spawnSync("wsl.exe", ["-l", "-q"], { encoding: "buffer", timeout: TIMEOUT_MS })
  return decodeWslMeta(res.stdout)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function pickDistro(distros: string[]): string | undefined {
  const isDocker = (d: string) => /^docker-desktop/i.test(d)
  return distros.find((d) => /ubuntu|debian/i.test(d) && !isDocker(d)) ?? distros.find((d) => !isDocker(d))
}

export interface PairingInfo {
  ok: boolean
  running: boolean
  dnsName?: string
  token?: string
  port?: string
  link?: string
  error?: string
}

function getWslPairingInfo(): PairingInfo {
  const distro = pickDistro(listDistros())
  if (!distro) return { ok: false, running: false, error: "Nenhuma distribuição WSL encontrada" }

  const tokenRes = spawnSync(
    "wsl.exe",
    ["-d", distro, "-u", "root", "--", "bash", "-c", "grep '^FORGE_TOKEN=' /opt/forge/.env 2>/dev/null | cut -d= -f2"],
    { encoding: "utf8", timeout: TIMEOUT_MS },
  )
  const token = (tokenRes.stdout || "").trim()
  if (!token) return { ok: false, running: false, error: "FORGE não instalado nessa WSL ainda" }

  const activeRes = spawnSync("wsl.exe", ["-d", distro, "-u", "root", "--", "bash", "-c", "systemctl is-active forge 2>/dev/null"], {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  })
  const running = activeRes.stdout.trim() === "active"

  const statusRes = spawnSync("wsl.exe", ["-d", distro, "-u", "root", "--", "tailscale", "status", "--json"], {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  })
  let dnsName: string | undefined
  try {
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- `tailscale status --json` is a trusted, stable CLI output shape.
    const parsed = JSON.parse(statusRes.stdout) as { Self?: { DNSName?: string } }
    dnsName = parsed.Self?.DNSName?.replace(/\.$/, "")
  } catch {}

  if (!dnsName) return { ok: true, running, token, error: "Tailscale sem endereço ainda (logado?)" }
  return { ok: true, running, dnsName, token, link: `https://${dnsName}/#t=${token}` }
}

// nativo primeiro (é o caminho novo/principal pras duas máquinas reais hoje),
// cai pro WSL só se não achar o XML do serviço nativo -- preserva quem ainda
// estiver na instalação antiga.
export function getPairingInfo(): PairingInfo {
  return getNativePairingInfo() ?? getWslPairingInfo()
}
