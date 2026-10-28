import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import { registerOpencodeSpinner } from "./register-spinner"

registerOpencodeSpinner()

// A scanning block sweeps across a signal-strength bar instead of a plain
// spinner, to read as "scanning"/signal rather than a generic loading dial.
export const SPINNER_FRAMES = [
  "▓░░░░░",
  "░▓░░░░",
  "░░▓░░░",
  "░░░▓░░",
  "░░░░▓░",
  "░░░░░▓",
  "░░░░▓░",
  "░░░▓░░",
  "░░▓░░░",
  "░▓░░░░",
]

export function Spinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.textMuted
  return (
    <Show when={kv.get("animations_enabled", true)} fallback={<text fg={color()}>{"> "}{props.children}</text>}>
      <box flexDirection="row" gap={1}>
        <spinner frames={SPINNER_FRAMES} interval={80} color={color()} />
        <Show when={props.children}>
          <text fg={color()}>{props.children}</text>
        </Show>
      </box>
    </Show>
  )
}
