import { RGBA, TextAttributes } from "@opentui/core"
import { For, type JSX } from "solid-js"
import { tint, useTheme } from "../context/theme"
import { logo, sploitColorsHex } from "../logo"

export function Logo() {
  const { theme } = useTheme()

  const renderLine = (line: string, start: number, bold: boolean): JSX.Element[] => {
    const shadow = tint(theme.background, theme.text, 0.25)
    const attrs = bold ? TextAttributes.BOLD : undefined
    const out: JSX.Element[] = []
    let token = 0
    for (const part of line.split(/( +)/)) {
      if (part.length === 0) continue
      if (part[0] === " ") {
        out.push(
          <text attributes={attrs} selectable={false}>
            {part}
          </text>,
        )
        continue
      }
      const fg = RGBA.fromHex(sploitColorsHex[start + token] ?? "#888888")
      token += 1
      for (const char of part) {
        if (char === "_") {
          out.push(
            <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
              {" "}
            </text>,
          )
        } else if (char === "^") {
          out.push(
            <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
              ▀
            </text>,
          )
        } else if (char === "~") {
          out.push(
            <text fg={shadow} attributes={attrs} selectable={false}>
              ▀
            </text>,
          )
        } else if (char === ",") {
          out.push(
            <text fg={shadow} attributes={attrs} selectable={false}>
              ▄
            </text>,
          )
        } else {
          out.push(
            <text fg={fg} attributes={attrs} selectable={false}>
              {char}
            </text>,
          )
        }
      }
    }
    return out
  }

  return (
    <box>
      <For each={logo.left}>
        {(line, index) => (
          <box flexDirection="row" gap={1}>
            <box flexDirection="row">{renderLine(line, 0, true)}</box>
            <box flexDirection="row">{renderLine(logo.right[index()], 3, true)}</box>
          </box>
        )}
      </For>
    </box>
  )
}
