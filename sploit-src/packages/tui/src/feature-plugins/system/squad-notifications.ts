import type { TuiPlugin, TuiPluginApi } from "@sploit-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import {
  detectarPostsInvalidos,
  estadoAgente,
  parseQuadro,
  trabalhando,
  verificarTravamento,
  type SquadCfg,
  type SquadPost,
} from "../../squad/dock-data"

const id = "internal:squad-notifications"
const POLL_MS = 4000
const LIMIAR_TRAVAMENTO_MIN = 3

type Snapshot = { estado: SquadPost["estado"]; trabalhando: boolean }
type Memoria = {
  anteriores: Record<string, Snapshot>
  filaAtiva: boolean
  projeto?: string
  avisadoTravado: Set<string>
  avisadoLinhasInvalidas: Set<number>
}

export async function tick(api: TuiPluginApi, memoria: Memoria) {
  const dir = api.state.path.directory
  if (!dir) return
  try {
    const cfgFile = Bun.file(`${dir}/squad/squad.json`)
    if (!(await cfgFile.exists())) {
      memoria.anteriores = {}
      memoria.filaAtiva = false
      memoria.projeto = undefined
      memoria.avisadoTravado.clear()
      memoria.avisadoLinhasInvalidas.clear()
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
      memoria.avisadoTravado.clear()
      memoria.avisadoLinhasInvalidas.clear()
    }

    const invalidos = detectarPostsInvalidos(quadro)
    const linhasAtuais = new Set(invalidos.map((p) => p.linha))
    for (const inv of invalidos) {
      if (memoria.avisadoLinhasInvalidas.has(inv.linha)) continue
      memoria.avisadoLinhasInvalidas.add(inv.linha)
      void api.attention.notify({
        title: "Squad",
        message: `Post inválido no quadro (linha ${inv.linha}) — estado não é feito/pendente/bloqueado, ninguém vai ver essa tarefa.`,
        notification: { when: "always" },
        sound: { name: "error", when: "always" },
      })
    }
    // Linha corrigida ou removida: libera pra avisar de novo se voltar a acontecer.
    for (const linha of [...memoria.avisadoLinhasInvalidas]) {
      if (!linhasAtuais.has(linha)) memoria.avisadoLinhasInvalidas.delete(linha)
    }

    const atuais: Record<string, Snapshot> = {}
    let algumTrabalhando = false

    for (const a of agentes) {
      const est = estadoAgente(posts, a.nome)
      const ativo = trabalhando(est)
      atuais[a.nome] = { estado: est.estado, trabalhando: ativo }
      if (ativo) algumTrabalhando = true

      if (!ativo) {
        memoria.avisadoTravado.delete(a.nome)
      } else {
        const tv = await verificarTravamento(`${dir}/squad/logs/${a.nome}.log`, LIMIAR_TRAVAMENTO_MIN)
        if (tv?.travado && !memoria.avisadoTravado.has(a.nome)) {
          memoria.avisadoTravado.add(a.nome)
          void api.attention.notify({
            title: "Squad",
            message: `${a.nome} travado — sem atividade há ${Math.round(tv.minutos)}min. Confira o modelo (/squad-modelo).`,
            notification: { when: "always" },
            sound: { name: "error", when: "always" },
          })
        } else if (!tv?.travado) {
          memoria.avisadoTravado.delete(a.nome)
        }
      }

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
  const memoria: Memoria = {
    anteriores: {},
    filaAtiva: false,
    avisadoTravado: new Set(),
    avisadoLinhasInvalidas: new Set(),
  }
  void tick(api, memoria)
  setInterval(() => void tick(api, memoria), POLL_MS)
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
