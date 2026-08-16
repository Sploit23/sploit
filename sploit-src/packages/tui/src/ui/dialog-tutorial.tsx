import { TextAttributes } from "@opentui/core"
import { createMemo, For } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings, useCommandShortcut } from "../keymap"

type RowPart = { text: string; highlight: boolean }
type Row = { num: string; parts: RowPart[] }

function t(text: string): RowPart {
  return { text, highlight: false }
}

function hl(text: string): RowPart {
  return { text, highlight: true }
}

export function DialogTutorial() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const commandList = useCommandShortcut("command.palette.show")
  const modelList = useCommandShortcut("model.list")
  const pasteImage = useCommandShortcut("prompt.paste.image")
  const interrupt = useCommandShortcut("session.interrupt")

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Fechar tutorial", group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: "Fechar tutorial", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  const rows = createMemo<Row[]>(() => [
    {
      num: "1",
      parts: [t("Anexar arquivo: digite "), hl("@"), t(" + nome (ex.: "), hl("@src/main.ts"), t(")")],
    },
    {
      num: "2",
      parts: [t("Imagem por nome: só citar "), hl("erro.png"), t(" na pasta do projeto e ela anexa sozinha")],
    },
    {
      num: "3",
      parts: [t("Colar screenshot: "), hl(pasteImage() || "Ctrl+Shift+V"), t(" cola a imagem do clipboard")],
    },
    {
      num: "4",
      parts: [t("Comando shell: comece com "), hl("!"), t(" (ex.: "), hl("!git status"), t(")")],
    },
    {
      num: "5",
      parts: [t("Trocar modelo: "), hl("/models"), t(modelList() ? ` ou ${modelList()}` : "")],
    },
    {
      num: "6",
      parts: [t("Ver todos os comandos e atalhos: "), hl(commandList() || "Ctrl+P")],
    },
    {
      num: "7",
      parts: [t("Interromper a resposta: "), hl(interrupt() || "Esc")],
    },
  ])

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Tutorial
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <box paddingBottom={1}>
        <For each={rows()}>
          {(row) => (
            <box flexDirection="row" gap={1}>
              <text fg={theme.textMuted}>{row.num}.</text>
              <text>
                <For each={row.parts}>
                  {(part) => (
                    <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>
                  )}
                </For>
              </text>
            </box>
          )}
        </For>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}
