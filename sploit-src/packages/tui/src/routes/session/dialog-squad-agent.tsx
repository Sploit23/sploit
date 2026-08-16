import { For, Show, createMemo, createResource } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useDialog, type DialogContext } from "../../ui/dialog"
import { lerLogCompleto, type SquadAgent, type SquadPost } from "../../squad/dock-data"

const ESTADO_ICONE: Record<SquadPost["estado"], string> = { feito: "✓", pendente: "○", bloqueado: "✕" }

export function openSquadAgentDialog(
  dialog: DialogContext,
  props: { directory: string; agent: SquadAgent; posts: SquadPost[] },
) {
  dialog.setSize("large")
  dialog.replace(() => <DialogSquadAgent {...props} />)
}

function DialogSquadAgent(props: { directory: string; agent: SquadAgent; posts: SquadPost[] }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [log] = createResource(
    () => `${props.directory}/squad/logs/${props.agent.nome}.log`,
    (logPath) => lerLogCompleto(logPath),
  )
  const postsAgente = createMemo(() => props.posts.filter((p) => p.nome === props.agent.nome).toReversed().slice(0, 8))

  function estadoCor(estado: SquadPost["estado"]) {
    if (estado === "feito") return theme.success
    if (estado === "bloqueado") return theme.error
    return theme.textMuted
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={1}>
          <text attributes={TextAttributes.BOLD} fg={theme.text}>
            {props.agent.nome}
          </text>
          <text fg={theme.textMuted}>{props.agent.papel ? `[${props.agent.papel}]` : props.agent.pasta}</text>
        </box>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme.accent} attributes={TextAttributes.BOLD}>
          Últimos posts no quadro
        </text>
        <Show when={postsAgente().length > 0} fallback={<text fg={theme.textMuted}>(nenhum post ainda)</text>}>
          <For each={postsAgente()}>
            {(p) => (
              <box flexDirection="row" gap={1}>
                <text fg={estadoCor(p.estado)} width={2} wrapMode="none">
                  {ESTADO_ICONE[p.estado]}
                </text>
                <text fg={theme.textMuted} width={12} wrapMode="none">
                  {p.data.slice(-11)}
                </text>
                <text fg={theme.text} flexShrink={1} truncate>
                  {p.msg}
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme.accent} attributes={TextAttributes.BOLD}>
          Log recente
        </text>
        <Show when={!log.loading} fallback={<text fg={theme.textMuted}>carregando...</text>}>
          <Show when={(log() ?? []).length > 0} fallback={<text fg={theme.textMuted}>(sem atividade registrada)</text>}>
            <scrollbox maxHeight={12} scrollbarOptions={{ visible: false }}>
              <For each={log()}>
                {(linha) => (
                  <text fg={theme.textMuted} wrapMode="none" truncate>
                    {linha}
                  </text>
                )}
              </For>
            </scrollbox>
          </Show>
        </Show>
      </box>

      <text fg={theme.borderSubtle}>esc fecha</text>
    </box>
  )
}
