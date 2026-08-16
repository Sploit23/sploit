import type { Argv } from "yargs"
import semver from "semver"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"
import { InstallationVersion } from "@sploit-ai/core/installation/version"
import { errorMessage } from "@/util/error"

interface UpgradeArgs {
  target?: string
}

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "atualiza o binário do Sploit para a última versão",
  builder: (yargs: Argv) =>
    yargs.positional("target", {
      type: "string",
      describe: "versão específica (padrão: última release do GitHub)",
    }),
  handler: async (args: UpgradeArgs) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Upgrade")

    const method = await Installation.method()
    if (method !== "sploit") {
      prompts.log.error(`Método de instalação não suportado para auto-update: ${method}`)
      prompts.outro("Done")
      return
    }

    let target: string
    try {
      target = args.target || (await Installation.latest("sploit"))
    } catch (error) {
      prompts.log.error(`Não consegui consultar a última versão no GitHub: ${errorMessage(error)}`)
      prompts.log.info("Verifique a internet ou rode `sploit upgrade <versão>` informando uma versão.")
      prompts.outro("Done")
      return
    }

    if (semver.eq(InstallationVersion, target)) {
      prompts.log.success(`O Sploit já está na versão mais recente (${InstallationVersion}).`)
      prompts.outro("Done")
      return
    }

    prompts.log.info(`Atualizando Sploit ${InstallationVersion} -> ${target} ...`)
    try {
      await Installation.upgrade("sploit", target)
      prompts.log.success(
        `Nova versão ${target} baixada. Ela será aplicada quando você fechar o Sploit (e abrirá de novo sozinha).`,
      )
    } catch (error) {
      prompts.log.error(`Falha na atualização: ${errorMessage(error)}`)
    }
    prompts.outro("Done")
  },
}
