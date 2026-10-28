import { spawn, spawnSync } from "child_process"
import os from "os"
import path from "path"

const DEFAULT_CAPTURE_TIMEOUT_MS = 15_000

export function isWindows() {
  return os.platform() === "win32"
}

function decodeWslMeta(buf: Buffer | undefined): string {
  if (!buf || buf.length === 0) return ""
  // wsl.exe's own stdout (list/status/etc, as opposed to a relayed Linux
  // program's output) is UTF-16LE when piped, unlike everything else on this
  // codebase's usual UTF-8 assumption.
  return buf.toString("utf16le").replace(/\0/g, "").trim()
}

export function listWslDistros(): string[] {
  // sem timeout, um wsl.exe que nunca retorna (visto num shell sandboxed sem
  // TTY) trava `sploit forge up/status` pra sempre, sem nenhum erro visivel.
  const res = spawnSync("wsl.exe", ["-l", "-q"], { encoding: "buffer", timeout: DEFAULT_CAPTURE_TIMEOUT_MS })
  const text = decodeWslMeta(res.stdout)
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function pickLinuxDistro(distros: string[]): string | undefined {
  const isDocker = (d: string) => /^docker-desktop/i.test(d)
  const preferred = distros.find((d) => /ubuntu|debian/i.test(d) && !isDocker(d))
  if (preferred) return preferred
  return distros.find((d) => !isDocker(d))
}

export function windowsPathToWsl(winPath: string): string {
  const resolved = path.win32.resolve(winPath)
  const drive = resolved[0].toLowerCase()
  const rest = resolved.slice(2).split("\\").join("/")
  return `/mnt/${drive}${rest}`
}

export type RunResult = { code: number; stdout: string; stderr: string }

export interface ExecTarget {
  readonly label: string
  runStreamed(args: string[]): Promise<number>
  /** code is 124 if the command hit timeoutMs (default 15s) without exiting, matching the `timeout` CLI convention. */
  runCaptured(args: string[], timeoutMs?: number): RunResult
  toPath(windowsPath: string): string
}

export function wslTarget(distro: string): ExecTarget {
  return {
    label: `WSL:${distro}`,
    runStreamed(args) {
      return new Promise((resolve) => {
        const child = spawn("wsl.exe", ["-d", distro, "-u", "root", "--", ...args], {
          stdio: ["inherit", "inherit", "inherit"],
        })
        child.on("close", (code) => resolve(code ?? 1))
        child.on("error", () => resolve(1))
      })
    },
    runCaptured(args, timeoutMs) {
      const res = spawnSync("wsl.exe", ["-d", distro, "-u", "root", "--", ...args], {
        encoding: "utf8",
        timeout: timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS,
      })
      return { code: res.status ?? (res.signal ? 124 : 1), stdout: res.stdout ?? "", stderr: res.stderr ?? "" }
    },
    toPath: windowsPathToWsl,
  }
}

export function localTarget(): ExecTarget {
  return {
    label: "local",
    runStreamed(args) {
      return new Promise((resolve) => {
        const child = spawn(args[0], args.slice(1), { stdio: ["inherit", "inherit", "inherit"] })
        child.on("close", (code) => resolve(code ?? 1))
        child.on("error", () => resolve(1))
      })
    },
    runCaptured(args, timeoutMs) {
      const res = spawnSync(args[0], args.slice(1), {
        encoding: "utf8",
        timeout: timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS,
      })
      return { code: res.status ?? (res.signal ? 124 : 1), stdout: res.stdout ?? "", stderr: res.stderr ?? "" }
    },
    toPath: (p) => p,
  }
}

export function isRoot(): boolean {
  if (isWindows()) return true
  return typeof process.getuid === "function" && process.getuid() === 0
}
