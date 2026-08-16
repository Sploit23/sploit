import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { TextAttributes } from "@opentui/core"
import path from "node:path"
import { useTheme } from "../../context/theme"
import { useDialog, type DialogContext } from "../../ui/dialog"
import { useToast } from "../../ui/toast"
import { useKV } from "../../context/kv"
import { useBindings } from "../../keymap"
import { DialogPrompt } from "../../ui/dialog-prompt"
import { DialogSelect } from "../../ui/dialog-select"
import { SplitBorder } from "../../ui/border"
import {
  detectarAreasProjeto,
  nomeSugestaoPara,
  type AreaDetectada,
} from "@sploit-ai/core/squad/detectar"
import { gerarSquad } from "@sploit-ai/core/squad/gerar"

type AreaEditable = AreaDetectada & { nome: string }

const TIPOS: { tipo: string; rotulo: string }[] = [
  { tipo: "backend", rotulo: "backend — API e servidor" },
  { tipo: "frontend", rotulo: "frontend — telas e visual" },
  { tipo: "mobile", rotulo: "mobile — aplicativo" },
  { tipo: "infra", rotulo: "infra — infraestrutura e deploys" },
  { tipo: "qa", rotulo: "qa — testes e qualidade" },
  { tipo: "docs", rotulo: "docs — documentação" },
  { tipo: "scripts", rotulo: "scripts — automação e ferramentas" },
  { tipo: "db", rotulo: "db — banco de dados" },
  { tipo: "app", rotulo: "app — aplicação geral" },
]

const SQUAD_SETUP_DISMISS_WINDOW = 7 * 24 * 60 * 60 * 1000

// Estado editável do assistente (sobrevive aos diálogos aninhados, que usam
// `dialog.replace` e desmontam o assistente). Chave = diretório do projeto.
const edits = new Map<string, AreaEditable[]>()

function loadAreas(directory: string): AreaEditable[] {
  let list = edits.get(directory)
  if (!list) {
    list = detectarAreasProjeto(directory)
      .filter((a) => a.path !== ".")
      .map((a) => ({ ...a, nome: a.nomeSugestao }))
    edits.set(directory, list)
  }
  return list
}

export function openSquadSetup(dialog: DialogContext, directory: string) {
  dialog.setSize("large")
  dialog.replace(() => <DialogSquadSetup directory={directory} />)
}

type Zona = "list" | "criar" | "cancelar"

function DialogSquadSetup(props: { directory: string }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const toast = useToast()
  const [areas, setAreas] = createSignal<AreaEditable[]>(loadAreas(props.directory))
  const [selected, setSelected] = createSignal(0)
  const [zona, setZona] = createSignal<Zona>("list")
  const [busy, setBusy] = createSignal(false)
  const [erro, setErro] = createSignal<string>()
  const [sucesso, setSucesso] = createSignal<string>()

  const areaAtual = () => {
    const list = areas()
    const i = Math.min(selected(), list.length - 1)
    return list[i]
  }

  function mover(delta: number) {
    const list = areas()
    if (list.length === 0) return
    setSelected((i) => (i + delta + list.length) % list.length)
  }

  function trocarZona() {
    setZona((z) => (z === "list" ? "criar" : z === "criar" ? "cancelar" : "list"))
  }

  function cancelar() {
    // Descarta a edição em andamento — sem isso, reabrir o wizard depois
    // (mesmo em outra sessão, mesmo diretório) voltaria com as áreas e
    // nomes da tentativa abandonada em vez de redetectar do disco.
    edits.delete(props.directory)
    dialog.clear()
  }

  function confirmar() {
    if (zona() === "criar") void criar()
    else if (zona() === "cancelar") cancelar()
    else void renomear()
  }

  async function renomear() {
    const atual = areaAtual()
    if (!atual) return
    const nome = await DialogPrompt.show(dialog, "Nome do agente", {
      value: atual.nome,
      placeholder: "Nome do agente",
    })
    if (!nome) return
    const limpo = nome.trim()
    if (!limpo || limpo === atual.nome) return
    const list = areas()
    list[Math.min(selected(), list.length - 1)] = { ...atual, nome: limpo }
    setAreas([...list])
    edits.set(props.directory, list)
    dialog.replace(() => <DialogSquadSetup directory={props.directory} />)
  }

  function escolherTipo() {
    const atual = areaAtual()
    if (!atual) return
    const indice = Math.min(selected(), areas().length - 1)
    dialog.replace(() => (
      <DialogSelect
        title="Tipo do agente"
        placeholder="filtre por tipo"
        skipFilter
        renderFilter={false}
        current={atual.tipo}
        options={TIPOS.map((t) => ({
          title: t.rotulo,
          value: t.tipo,
          description: "nome sugerido: " + nomeSugestaoPara(t.tipo),
        }))}
        onSelect={(o) => {
          const list = areas()
          const antigo = list[indice]
          list[indice] = {
            ...antigo,
            tipo: o.value,
            nome: antigo.nome === nomeSugestaoPara(antigo.tipo) ? nomeSugestaoPara(o.value) : antigo.nome,
          }
          setAreas([...list])
          edits.set(props.directory, list)
          openSquadSetup(dialog, props.directory)
        }}
      />
    ))
  }

  function remover() {
    const list = areas()
    const indice = Math.min(selected(), list.length - 1)
    if (indice < 0) return
    const novo = [...list.slice(0, indice), ...list.slice(indice + 1)]
    setAreas(novo)
    edits.set(props.directory, novo)
    if (novo.length === 0) setSelected(0)
    else setSelected(Math.max(0, Math.min(indice, novo.length - 1)))
  }

  async function criar() {
    const list = areas()
    if (list.length === 0 || busy()) return
    setBusy(true)
    setErro(undefined)
    try {
      const gerado = await gerarSquad(
        props.directory,
        list.map((a) => ({ tipo: a.tipo, path: a.path, nome: a.nome })),
        path.basename(props.directory),
      )
      edits.delete(props.directory)
      setSucesso(`Squad criado: ${gerado.agentes.map((a) => a.nome).join(", ")}`)
      toast.show({
        variant: "success",
        message: `Squad criado com ${gerado.agentes.length} ${gerado.agentes.length === 1 ? "agente" : "agentes"}`,
      })
      dialog.clear()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useBindings(() => ({
    enabled: !busy(),
    bindings: [
      {
        key: "up",
        desc: "Anterior",
        group: "Dialog",
        cmd: () => {
          if (zona() === "list") mover(-1)
          else setZona("list")
        },
      },
      {
        key: "down",
        desc: "Próximo",
        group: "Dialog",
        cmd: () => {
          if (zona() === "list") mover(1)
          else setZona("list")
        },
      },
      {
        key: "tab",
        desc: "Próxima ação",
        group: "Dialog",
        cmd: trocarZona,
      },
      {
        key: "return",
        desc: "Confirmar",
        group: "Dialog",
        cmd: confirmar,
      },
      {
        key: "t",
        desc: "Mudar tipo",
        group: "Dialog",
        cmd: () => {
          if (zona() === "list") escolherTipo()
        },
      },
      {
        key: "d",
        desc: "Remover área",
        group: "Dialog",
        cmd: () => {
          if (zona() === "list") remover()
        },
      },
    ],
  }))

  function corTipo(tipo: string) {
    const t = tipo.toLowerCase()
    if (/front|ui|visual|app|mobile/.test(t)) return theme.accent
    if (/back|api|server|infra|db/.test(t)) return theme.info
    if (/qa|test/.test(t)) return theme.warning
    if (/doc|script/.test(t)) return theme.secondary
    return theme.textMuted
  }

  function botaoZona(nome: Zona, rotulo: string) {
    const ativo = zona() === nome
    return (
      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={ativo ? theme.primary : undefined}
        onMouseUp={() => {
          if (busy()) return
          setZona(nome)
          if (nome === "criar") void criar()
          else if (nome === "cancelar") cancelar()
        }}
      >
        <text fg={ativo ? theme.selectedListItemText : theme.textMuted}>{rotulo}</text>
      </box>
    )
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Montar squad do projeto
        </text>
        <text fg={theme.textMuted} onMouseUp={cancelar}>
          esc
        </text>
      </box>
      <Show when={!sucesso()}>
        <box flexDirection="column" gap={1}>
          <text fg={theme.textMuted}>
            Detectamos {areas().length} {areas().length === 1 ? "área" : "áreas"} no projeto. Ajuste os nomes e
            papéis antes de confirmar.
          </text>
          <Show when={areas().length > 0} fallback={<text fg={theme.textMuted}>(nenhuma área selecionada)</text>}>
            <box flexDirection="column" gap={0}>
              <For each={areas()}>
                {(a, i) => {
                  const ativo = zona() === "list" && i() === selected()
                  return (
                    <box
                      flexDirection="row"
                      gap={1}
                      backgroundColor={ativo ? theme.primary : undefined}
                      onMouseUp={() => {
                        if (busy()) return
                        setSelected(i())
                        setZona("list")
                      }}
                      onMouseDown={() => {
                        if (busy()) return
                        setSelected(i())
                      }}
                    >
                      <text fg={ativo ? theme.selectedListItemText : theme.textMuted}>
                        {i() === selected() ? "›" : " "}
                      </text>
                      <text
                        fg={ativo ? theme.selectedListItemText : theme.text}
                        attributes={TextAttributes.BOLD}
                        wrapMode="none"
                      >
                        {a.nome}
                      </text>
                      <text fg={corTipo(a.tipo)} wrapMode="none">
                        [{a.tipo}]
                      </text>
                      <text fg={ativo ? theme.selectedListItemText : theme.textMuted} wrapMode="none">
                        · {a.path}
                      </text>
                    </box>
                  )
                }}
              </For>
            </box>
          </Show>
          <Show when={erro()}>
            <text fg={theme.error}>{erro()}</text>
          </Show>
          <Show when={busy()}>
            <text fg={theme.textMuted}>criando squad...</text>
          </Show>
          <box flexDirection="row" justifyContent="flex-end" gap={1} paddingBottom={1}>
            {botaoZona("criar", "Criar squad")}
            {botaoZona("cancelar", "Cancelar")}
          </box>
          <text fg={theme.borderSubtle}>
            enter renomeia · t muda o tipo · d remove · tab troca de ação · esc fecha
          </text>
        </box>
      </Show>
    </box>
  )
}

export function SquadSetupBanner(props: { directory?: string }) {
  const dialog = useDialog()
  const kv = useKV()
  const { theme } = useTheme()
  const [detected, setDetected] = createSignal<AreaDetectada[]>()
  const [dismissed, setDismissed] = createSignal(false)

  createEffect(() => {
    const dir = props.directory
    if (!dir) {
      setDetected(undefined)
      return
    }
    setDismissed(false)
    async function tick(dir: string) {
      try {
        const cfgFile = Bun.file(`${dir}/squad/squad.json`)
        if (await cfgFile.exists()) {
          setDetected(undefined)
          return
        }
        const areas = detectarAreasProjeto(dir).filter((a) => a.path !== ".")
        if (areas.length === 0) {
          setDetected(undefined)
          return
        }
        const dismiss = kv.get(`squad_setup_dismissed:${dir}`)
        if (typeof dismiss === "number" && Date.now() - dismiss < SQUAD_SETUP_DISMISS_WINDOW) {
          setDetected(undefined)
          return
        }
        if (props.directory !== dir) return
        setDetected(areas)
      } catch {
        setDetected(undefined)
      }
    }
    void tick(dir)
    const timer = setInterval(() => void tick(dir), 3000)
    onCleanup(() => clearInterval(timer))
  })

  const areasVisiveis = createMemo(() => (dismissed() || !props.directory ? undefined : detected()))

  return (
    <Show when={areasVisiveis()}>
      {(areas) => (
        <Show when={props.directory}>
          {(dir) => (
            <box
              flexShrink={0}
              flexDirection="row"
              gap={1}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={1}
              {...SplitBorder}
              borderColor={theme.border}
              backgroundColor={theme.backgroundPanel}
            >
              <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                SQUAD
              </text>
              <text fg={theme.textMuted} wrapMode="none">
                detectamos {areas().length} {areas().length === 1 ? "área" : "áreas"} no projeto —
              </text>
              <text fg={theme.text} wrapMode="none">
                {areas()
                  .slice(0, 3)
                  .map((a) => a.nomeSugestao)
                  .join(", ")}
                {areas().length > 3 ? "..." : ""}
              </text>
              <box
                backgroundColor={theme.primary}
                paddingLeft={1}
                paddingRight={1}
                onMouseUp={() => openSquadSetup(dialog, dir())}
              >
                <text fg={theme.selectedListItemText}>Montar squad</text>
              </box>
              <text
                fg={theme.textMuted}
                onMouseUp={() => {
                  setDismissed(true)
                  kv.set(`squad_setup_dismissed:${dir()}`, Date.now())
                }}
              >
                agora não
              </text>
            </box>
          )}
        </Show>
      )}
    </Show>
  )
}
