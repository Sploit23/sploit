import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "rebuild sploit a partir do código-fonte",
  builder: (yargs: Argv) => yargs,
  handler: async () => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Upgrade")
    prompts.log.info("O Sploit é compilado localmente a partir do código-fonte em sploit-src/.")
    prompts.log.info("Para atualizar o binário, rode scripts/build-sploit.ps1 na raiz do repositório.")
    prompts.outro("Done")
  },
}
