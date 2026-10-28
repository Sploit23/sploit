import type { ExecTarget } from "./platform"

export interface TailscaleStatus {
  installed: boolean
  loggedIn: boolean
  hostname?: string
  dnsName?: string
}

export function checkTailscale(target: ExecTarget): TailscaleStatus {
  const which = target.runCaptured(["bash", "-c", "command -v tailscale || true"])
  if (!which.stdout.trim()) return { installed: false, loggedIn: false }

  const statusJson = target.runCaptured(["tailscale", "status", "--json"])
  if (statusJson.code !== 0) return { installed: true, loggedIn: false }

  try {
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- `tailscale status --json` is a trusted, stable CLI output shape.
    const parsed = JSON.parse(statusJson.stdout) as {
      BackendState?: string
      Self?: { HostName?: string; DNSName?: string }
    }
    const loggedIn = parsed.BackendState === "Running"
    return {
      installed: true,
      loggedIn,
      hostname: parsed.Self?.HostName,
      dnsName: parsed.Self?.DNSName?.replace(/\.$/, ""),
    }
  } catch {
    return { installed: true, loggedIn: false }
  }
}

/** Blocks until the user scans the printed QR / opens the login link, or Tailscale's own timeout elapses. */
export async function loginWithQr(target: ExecTarget): Promise<boolean> {
  const code = await target.runStreamed(["tailscale", "up", "--qr", "--accept-routes=false"])
  return code === 0
}

export interface ServeResult {
  ok: boolean
  /** Set when the tailnet needs the Serve/Funnel feature turned on once in the admin console. */
  enableUrl?: string
}

export function startServe(target: ExecTarget, port: number): ServeResult {
  const res = target.runCaptured(["tailscale", "serve", "--bg", String(port)], 15_000)
  if (res.code === 0) return { ok: true }
  const match = (res.stdout + res.stderr).match(/https:\/\/login\.tailscale\.com\/f\/serve\?\S+/)
  return { ok: false, enableUrl: match?.[0] }
}

export function pairingUrl(status: TailscaleStatus, token: string): string | undefined {
  if (!status.dnsName) return undefined
  return `https://${status.dnsName}/#t=${token}`
}
