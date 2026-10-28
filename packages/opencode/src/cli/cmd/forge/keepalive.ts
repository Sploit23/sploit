import fs from "fs"
import os from "os"
import path from "path"
import { spawn } from "child_process"

// WSL2 shuts its VM down a few seconds after nothing is attached to it, which
// kills tailscaled and the forge service with it. A Startup-folder script
// that holds a `sleep infinity` handle open keeps the VM alive across logins
// without needing Administrator rights (unlike a scheduled task).
function startupScriptPath(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "SploitForgeKeepAlive.vbs")
}

export function installWindowsKeepAlive(distro: string) {
  const vbs = `Set objShell = CreateObject("WScript.Shell")\r\nobjShell.Run "wsl.exe -d ${distro} -u root -- sleep infinity", 0, False\r\n`
  fs.writeFileSync(startupScriptPath(), vbs)

  const child = spawn("wsl.exe", ["-d", distro, "-u", "root", "--", "sleep", "infinity"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  child.unref()
}

export function removeWindowsKeepAlive() {
  fs.rm(startupScriptPath(), { force: true }, () => {})
}
