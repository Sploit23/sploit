import { cmd } from "../cmd"
import { FORGE_PORT, runInstall, serviceStatus, stopService } from "./install"
import { installWindowsKeepAlive, removeWindowsKeepAlive } from "./keepalive"
import { isRoot, isWindows, listWslDistros, localTarget, pickLinuxDistro, wslTarget, type ExecTarget } from "./platform"
import { checkTailscale, loginWithQr, pairingUrl, startServe } from "./tailscale"
import { readToken } from "./token"

function resolveTarget(): { target: ExecTarget; wslDistro?: string } | undefined {
  if (isWindows()) {
    const distros = listWslDistros()
    const distro = pickLinuxDistro(distros)
    if (!distro) {
      console.log("Nenhuma distribuicao WSL encontrada.")
      console.log("")
      console.log("O FORGE precisa de Linux (tmux, Xvfb, node-pty). Instale uma distro com:")
      console.log("")
      console.log("  wsl --install -d Ubuntu")
      console.log("")
      console.log("A primeira abertura do Ubuntu vai pedir para voce criar um usuario e senha")
      console.log("Linux (isso e interativo, precisa ser feito por voce). Depois, rode de novo:")
      console.log("")
      console.log("  sploit forge up")
      return undefined
    }
    return { target: wslTarget(distro), wslDistro: distro }
  }

  if (!isRoot()) {
    console.log("Rode como root para instalar as dependencias do sistema:")
    console.log("")
    console.log("  sudo sploit forge up")
    return undefined
  }

  return { target: localTarget() }
}

async function printPairingQr(url: string) {
  const { default: qrcode } = await import("qrcode-terminal")
  await new Promise<void>((resolve) => {
    qrcode.generate(url, { small: true }, (output: string) => {
      console.log(output)
      console.log(url)
      resolve()
    })
  })
}

async function finishPairing(target: ExecTarget) {
  const status = checkTailscale(target)
  const token = readToken(target)
  if (!token) {
    console.log("Nao foi possivel ler o token do FORGE (.env ausente). Rode `sploit forge up` de novo.")
    return
  }
  if (!status.loggedIn) {
    console.log("Tailscale ainda nao esta logado. Rode `sploit forge up` de novo para autenticar.")
    return
  }

  const serve = startServe(target, FORGE_PORT)
  if (!serve.ok) {
    console.log("O recurso Serve ainda nao esta habilitado na sua conta Tailscale (so precisa uma vez).")
    if (serve.enableUrl) {
      console.log("Abra este link para habilitar, depois rode `sploit forge status` de novo:")
      console.log("")
      console.log(`  ${serve.enableUrl}`)
    } else {
      console.log("Rode `sploit forge status` depois de confirmar o Serve no admin console do Tailscale.")
    }
    return
  }

  const fresh = checkTailscale(target)
  const url = pairingUrl(fresh, token)
  if (!url) {
    console.log("FORGE esta rodando, mas nao foi possivel obter o endereco Tailscale ainda.")
    console.log("Rode `sploit forge status` em alguns segundos para ver o QR de pareamento.")
    return
  }

  console.log("")
  console.log("Escaneie com o celular (mesma conta Tailscale) para abrir o FORGE:")
  console.log("")
  await printPairingQr(url)
}

export const ForgeCommand = cmd({
  command: "forge",
  describe: "instala e gerencia o FORGE (controle remoto do opencode pelo celular)",
  builder: (yargs) => yargs.command(UpCommand).command(StatusCommand).command(DownCommand).demandCommand(),
  async handler() {},
})

const UpCommand = cmd({
  command: "up",
  describe: "instala dependencias, sobe o servico do FORGE e autentica o Tailscale",
  async handler() {
    const resolved = resolveTarget()
    if (!resolved) {
      process.exitCode = 1
      return
    }
    const { target, wslDistro } = resolved

    console.log(`==> Instalando FORGE (${target.label})`)
    const result = await runInstall(target)
    if (!result.ok) {
      console.log("Falha na instalacao. Veja o log acima.")
      process.exitCode = 1
      return
    }
    if (!result.systemd) {
      console.log("Aviso: systemd nao disponivel aqui, o servico nao fica persistente entre reinicios.")
    }

    if (wslDistro) {
      console.log("==> Garantindo que a WSL fique sempre ligada (sem isso o FORGE desliga quando a WSL fica ociosa)")
      installWindowsKeepAlive(wslDistro)
    }

    const status = checkTailscale(target)
    if (!status.loggedIn) {
      console.log("")
      console.log("==> Autenticando o Tailscale (escaneie o QR com o app do Tailscale no celular)")
      console.log("")
      const ok = await loginWithQr(target)
      if (!ok) {
        console.log("Login do Tailscale nao concluido. Rode `sploit forge up` de novo quando puder.")
        process.exitCode = 1
        return
      }
    }

    await finishPairing(target)
  },
})

const StatusCommand = cmd({
  command: "status",
  describe: "mostra o status do FORGE e reexibe o QR de pareamento",
  async handler() {
    const resolved = resolveTarget()
    if (!resolved) {
      process.exitCode = 1
      return
    }
    const { target } = resolved

    const svc = serviceStatus(target)
    console.log(`instalado: ${svc.installed ? "sim" : "nao"}`)
    console.log(`servico ativo: ${svc.active ? "sim" : "nao"}`)

    if (!svc.installed) {
      console.log("Rode `sploit forge up` para instalar.")
      return
    }

    const ts = checkTailscale(target)
    console.log(`tailscale: ${ts.installed ? (ts.loggedIn ? "logado" : "instalado, sem login") : "nao instalado"}`)

    if (svc.active && ts.loggedIn) await finishPairing(target)
  },
})

const DownCommand = cmd({
  command: "down",
  describe: "para o servico do FORGE (nao desinstala Tailscale nem pacotes do sistema)",
  async handler() {
    const resolved = resolveTarget()
    if (!resolved) {
      process.exitCode = 1
      return
    }
    const ok = stopService(resolved.target)
    if (resolved.wslDistro) removeWindowsKeepAlive()
    console.log(ok ? "FORGE parado." : "Nao foi possivel parar o servico (ja estava parado?).")
  },
})
