import type { TuiPlugin, TuiPluginApi } from "@sploit-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { estadoAgente, parseQuadro, trabalhando, type SquadCfg, type SquadPost } from "../../squad/dock-data"

const id = "internal:squad-notifications"
const POLL_MS = 4000

type Snapshot = { estado: SquadPost["estado"]; trabalhando: boolean }

export async function tick(
  api: TuiPluginApi,
  memoria: { anteriores: Record<string, Snapshot>; filaAtiva: boolean; projeto?: string },
) {
  const dir = api.state.path.directory
  if (!dir) return
  try {
    const cfgFile = Bun.file(`${dir}/squad/squad.json`)
    if (!(await cfgFile.exists())) {
      memoria.anteriores = {}
      memoria.filaAtiva = false
      memoria.projeto = undefined
      return
    }
    const cfg = (await cfgFile.json()) as SquadCfg
    const agentes = cfg.agentes ?? []
    const quadro = await Bun.file(`${dir}/squad/quadro.md`).text()
    const posts = parseQuadro(quadro)
    const projeto = cfg.projeto ?? dir.split(/[\\/]/).pop() ?? ""

    // Projeto trocou (sessão foi aberta em outro diretório) — não compara com o estado antigo.
    if (projeto !== memoria.projeto) {
      memoria.anteriores = {}
      memoria.filaAtiva = false
      memoria.projeto = projeto
    }

    const atuais: Record<string, Snapshot> = {}
    let algumTrabalhando = false

    for (const a of agentes) {
      const est = estadoAgente(posts, a.nome)
      const ativo = trabalhando(est)
      atuais[a.nome] = { estado: est.estado, trabalhando: ativo }
      if (ativo) algumTrabalhando = true

      const antes = memoria.anteriores[a.nome]
      if (!antes) continue

      if (est.estado === "bloqueado" && antes.estado !== "bloqueado") {
        void api.attention.notify({
          title: "Squad",
          message: `${a.nome} travou: ${est.acao}`,
          notification: { when: "blurred" },
          sound: { name: "error", when: "always" },
        })
      } else if (est.estado === "feito" && antes.trabalhando) {
        void api.attention.notify({
          title: "Squad",
          message: `${a.nome} terminou uma tarefa`,
          notification: { when: "blurred" },
          sound: { name: "subagent_done", when: "always" },
        })
      }
    }

    if (memoria.filaAtiva && !algumTrabalhando && agentes.length > 0) {
      void api.attention.notify({
        title: "Squad",
        message: `${projeto}: fila zerada, squad em espera`,
        notification: { when: "blurred" },
        sound: { name: "done", when: "always" },
      })
    }

    memoria.filaAtiva = algumTrabalhando
    memoria.anteriores = atuais
  } catch {
    // squad é opcional por projeto — silencioso, igual ao SquadDock
  }
}

const tui: TuiPlugin = async (api) => {
  const memoria: { anteriores: Record<string, Snapshot>; filaAtiva: boolean; projeto?: string } = {
    anteriores: {},
    filaAtiva: false,
  }
  void tick(api, memoria)
  setInterval(() => void tick(api, memoria), POLL_MS)
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
