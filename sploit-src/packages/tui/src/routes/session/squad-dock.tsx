import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import { EmptyBorder, SplitBorder } from "../../ui/border"
import { openSquadAgentDialog } from "./dialog-squad-agent"
import {
  estadoAgente,
  lerAtividade,
  lerModeloAtual,
  parseQuadro,
  verificarTravamento,
  type Atividade,
  type SquadAgent,
  type SquadCfg,
  type SquadPost,
  type Travamento,
} from "../../squad/dock-data"

export type { SquadAgent, SquadPost } from "../../squad/dock-data"

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const GRAFO = "▁▂▃▄▅▆▇█"

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseData(data: string): Date | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(data)
  if (!m) return undefined
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
}

function sparkline(posts: SquadPost[]): string {
  const horarios = posts.map((p) => parseData(p.data)).filter((d): d is Date => d !== undefined)
  if (horarios.length === 0) return ""
  const fim = Math.max(...horarios.map((d) => d.getTime()))
  const inicio = fim - 23 * 3_600_000
  const buckets = new Array(24).fill(0)
  for (const d of horarios) {
    const i = Math.min(23, Math.max(0, Math.floor((d.getTime() - inicio) / 3_600_000)))
    buckets[i]++
  }
  const mx = Math.max(...buckets)
  if (mx === 0) return ""
  return buckets
    .map((n) => (n === 0 ? "·" : GRAFO[Math.min(7, Math.floor((n / mx) * 7.99))]))
    .join("")
    .replace(/^·+/, "")
}

type LinhaExibida = {
  estado: SquadPost["estado"]
  rotulo: string
  texto: string
  trabalhando: boolean
  travado: boolean
}

function linha(
  est: { estado: SquadPost["estado"]; acao: string },
  a: SquadAgent,
  agora?: Atividade,
  nomes: string[] = [],
  travamento?: Travamento,
): LinhaExibida {
  const trabalho = est.estado === "pendente" && est.acao !== "aguardando"
  if (!trabalho && est.acao === "aguardando")
    return { estado: "pendente", rotulo: "aguardando", texto: "aguardando sua vez", trabalhando: false, travado: false }
  if (!trabalho) return { estado: est.estado, rotulo: est.estado, texto: est.acao, trabalhando: false, travado: false }
  if (travamento?.travado) {
    return {
      estado: "pendente",
      rotulo: "travado",
      texto: `sem atividade há ${Math.round(travamento.minutos)}min — confira o modelo (/squad-modelo)`,
      trabalhando: false,
      travado: true,
    }
  }
  const alvo = nomes.filter((x) => x !== a.nome).find((x) => new RegExp(`${escapeRegExp(x)}\\s*:`).test(est.acao))
  if (alvo)
    return { estado: "pendente", rotulo: `perguntando a ${alvo}`, texto: est.acao, trabalhando: true, travado: false }
  if (agora && agora.rotulo !== "aguardando")
    return { estado: "pendente", rotulo: agora.rotulo, texto: agora.texto, trabalhando: true, travado: false }
  return { estado: "pendente", rotulo: "trabalhando", texto: est.acao, trabalhando: true, travado: false }
}

export function SquadDock(props: { directory?: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [frame, setFrame] = createSignal(0)
  const [hoverNome, setHoverNome] = createSignal<string>()
  const [squad, setSquad] = createSignal<{
    projeto: string
    modo?: string
    agentes: SquadAgent[]
    posts: SquadPost[]
    logs: Record<string, Atividade>
    modelos: Record<string, string | undefined>
    travamentos: Record<string, Travamento | undefined>
  }>()

  createEffect(() => {
    const dir = props.directory
    if (!dir) {
      setSquad(undefined)
      return
    }
    async function tick(dir: string) {
      try {
        const cfgFile = Bun.file(`${dir}/squad/squad.json`)
        if (!(await cfgFile.exists())) {
          if (props.directory === dir) setSquad(undefined)
          return
        }
        const cfg = (await cfgFile.json()) as SquadCfg
        const agentes = cfg.agentes ?? []
        const quadro = await Bun.file(`${dir}/squad/quadro.md`).text()
        const logs: Record<string, Atividade> = {}
        const modelos: Record<string, string | undefined> = {}
        const travamentos: Record<string, Travamento | undefined> = {}
        for (const a of agentes) {
          const logPath = `${dir}/squad/logs/${a.nome}.log`
          logs[a.nome] = (await lerAtividade(logPath)) ?? {
            rotulo: "aguardando",
            texto: "aguardando sua vez",
          }
          modelos[a.nome] = await lerModeloAtual(logPath)
          travamentos[a.nome] = await verificarTravamento(logPath)
        }
        if (props.directory !== dir) return
        setSquad({
          projeto: cfg.projeto ?? dir.split(/[\\/]/).pop() ?? "",
          modo: cfg.modo,
          agentes,
          posts: parseQuadro(quadro),
          logs,
          modelos,
          travamentos,
        })
      } catch {
        if (props.directory === dir) setSquad(undefined)
      }
    }
    void tick(dir)
    const timer = setInterval(() => void tick(dir), 2000)
    onCleanup(() => clearInterval(timer))
  })

  createEffect(() => {
    if (!squad()) return
    const t = setInterval(() => setFrame((f) => (f + 1) % SPIN.length), 500)
    onCleanup(() => clearInterval(t))
  })

  function corPara(nome: string) {
    const paleta = [theme.success, theme.warning, theme.error, theme.accent, theme.secondary, theme.primary, theme.info]
    let h = 0
    for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
    return paleta[h % paleta.length]
  }

  function corPapel(papel: string) {
    const p = papel.toLowerCase()
    if (/audit|qualid|qa|revis|teste/.test(p)) return theme.warning
    if (/segur|vulner|pentest|hack|ataque/.test(p)) return theme.error
    if (/front|visual|ui|tela|totem|design/.test(p)) return theme.accent
    if (/back|api|server|dado|sql|banco|infra/.test(p)) return theme.info
    return theme.secondary
  }

  function dadosEstado(ls: LinhaExibida) {
    if (ls.travado) return { fg: theme.error, icone: "⚠" }
    if (ls.trabalhando) return { fg: theme.warning, icone: SPIN[frame() % SPIN.length] }
    if (ls.estado === "feito") return { fg: theme.success, icone: "✓" }
    if (ls.estado === "bloqueado") return { fg: theme.error, icone: "✕" }
    return { fg: theme.textMuted, icone: "○" }
  }

  function atributosTexto(l: LinhaExibida): number {
    if (l.travado) return TextAttributes.BOLD
    if (!l.trabalhando) return TextAttributes.DIM | TextAttributes.ITALIC
    if (l.rotulo === "pensando" || l.rotulo === "postando") return TextAttributes.ITALIC
    return TextAttributes.NONE
  }

  function corTexto(l: LinhaExibida) {
    if (l.travado) return theme.error
    if (l.rotulo === "postando") return theme.success
    if (l.rotulo === "delegando") return theme.accent
    if (l.rotulo === "editando" || l.rotulo === "rodando") return theme.text
    return theme.textMuted
  }

  return (
    <Show when={squad()}>
      {(data) => {
        const exibidos = data().agentes.map((a) => ({
          a,
          l: linha(
            estadoAgente(data().posts, a.nome),
            a,
            data().logs[a.nome],
            data().agentes.map((x) => x.nome),
            data().travamentos[a.nome],
          ),
        }))
        const contagem = exibidos.reduce(
          (acc, { l }) => {
            if (l.travado) acc.travado++
            else if (l.trabalhando) acc.trabalhando++
            else if (l.estado === "feito") acc.feito++
            else if (l.estado === "bloqueado") acc.bloqueado++
            else acc.ocioso++
            return acc
          },
          { trabalhando: 0, feito: 0, bloqueado: 0, ocioso: 0, travado: 0 },
        )
        const ultimo = data().posts.length > 0 ? data().posts[data().posts.length - 1].data : undefined
        const spark = sparkline(data().posts)
        return (
          <box width={42} height="100%" flexDirection="column" {...SplitBorder} borderColor={theme.border}>
            <scrollbox flexGrow={1} backgroundColor={theme.backgroundPanel}>
              <box flexShrink={0} flexDirection="column" gap={1} paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={1}>
                <box flexDirection="column">
                  <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                    SQUAD <span style={{ fg: theme.text }}>· {data().projeto}</span>
                  </text>
                  <text fg={theme.textMuted} wrapMode="none">
                    {data().agentes.length} {data().agentes.length === 1 ? "agente" : "agentes"}
                  </text>
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.warning} wrapMode="none">
                      ●{contagem.trabalhando}
                    </text>
                    <text fg={theme.success} wrapMode="none">
                      ✓{contagem.feito}
                    </text>
                    <text fg={theme.error} wrapMode="none">
                      ✕{contagem.bloqueado}
                    </text>
                    <text fg={theme.textMuted} wrapMode="none">
                      ○{contagem.ocioso}
                    </text>
                    <Show when={contagem.travado > 0}>
                      <text fg={theme.error} attributes={TextAttributes.BOLD} wrapMode="none">
                        ⚠{contagem.travado}
                      </text>
                    </Show>
                    <Show when={contagem.trabalhando > 0}>
                      <text fg={theme.warning} wrapMode="none">
                        {SPIN[frame() % SPIN.length]}
                      </text>
                    </Show>
                  </box>
                </box>
                <For each={exibidos}>
                  {({ a, l }) => {
                    const est = dadosEstado(l)
                    const modelo = () => data().modelos[a.nome]
                    return (
                      <box
                        flexDirection="column"
                        gap={0}
                        paddingTop={1}
                        border={["top"]}
                        customBorderChars={{ ...EmptyBorder, horizontal: "─" }}
                        borderColor={theme.borderSubtle}
                        backgroundColor={hoverNome() === a.nome ? theme.backgroundElement : undefined}
                        onMouseOver={() => setHoverNome(a.nome)}
                        onMouseOut={() => setHoverNome((n) => (n === a.nome ? undefined : n))}
                        onMouseUp={() =>
                          openSquadAgentDialog(dialog, {
                            directory: props.directory ?? "",
                            agent: a,
                            posts: data().posts,
                          })
                        }
                      >
                        <box flexDirection="row" gap={1}>
                          <text fg={est.fg} wrapMode="none">
                            {est.icone}
                          </text>
                          <text fg={corPara(a.nome)} attributes={TextAttributes.BOLD} wrapMode="none">
                            {a.nome}
                          </text>
                          <text
                            fg={corPapel(a.papel ?? "")}
                            attributes={TextAttributes.DIM}
                            wrapMode="none"
                            flexShrink={1}
                            truncate
                          >
                            {a.pasta}
                          </text>
                        </box>
                        <text fg={est.fg} wrapMode="none">
                          {"  " + l.rotulo}
                        </text>
                        <text fg={corTexto(l)} attributes={atributosTexto(l)} wrapMode="none" truncate>
                          {"  " + l.texto}
                        </text>
                        <Show when={modelo()}>
                          <text fg={theme.info} attributes={TextAttributes.DIM} wrapMode="none" truncate>
                            {"  ◇ " + modelo()}
                          </text>
                        </Show>
                      </box>
                    )
                  }}
                </For>
                <Show when={data().posts.length > 0}>
                  <text fg={theme.borderSubtle} attributes={TextAttributes.DIM}>
                    último post {ultimo?.slice(-5)}
                    {data().modo ? ` · modo ${data().modo}` : ""}
                    {spark ? `\natividade 24h ${spark}` : ""}
                  </text>
                </Show>
              </box>
            </scrollbox>
          </box>
        )
      }}
    </Show>
  )
}
