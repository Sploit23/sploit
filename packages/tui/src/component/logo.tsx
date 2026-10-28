import { RGBA, TextAttributes } from "@opentui/core"
import { For, type JSX, createSignal, onCleanup, onMount } from "solid-js"
import { tint, useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import { logo } from "../logo"

const SWEEP_DURATION_MS = 700
const GLOW_WIDTH = 6
const WORDMARK_WIDTH = Math.max(...logo.left.map((line) => line.length))

export function Logo() {
  const { theme } = useTheme()
  const kv = useKV()
  const [sweep, setSweep] = createSignal(1)

  onMount(() => {
    if (!kv.get("animations_enabled", true)) return
    const start = performance.now()
    setSweep(0)
    const timer = setInterval(() => {
      const progress = Math.min((performance.now() - start) / SWEEP_DURATION_MS, 1)
      setSweep(progress)
      if (progress >= 1) clearInterval(timer)
    }, 16)
    onCleanup(() => clearInterval(timer))
  })

  // Permanent primary->secondary gradient across the wordmark, plus a
  // one-shot bright glow band sweeping left to right once on mount.
  const colorAt = (x: number): RGBA => {
    const t = WORDMARK_WIDTH > 1 ? x / (WORDMARK_WIDTH - 1) : 0
    const base = tint(theme.primary, theme.secondary, t)
    const glowPos = sweep() * (WORDMARK_WIDTH + GLOW_WIDTH * 2) - GLOW_WIDTH
    const dist = Math.abs(x - glowPos)
    const glow = Math.max(0, 1 - dist / GLOW_WIDTH)
    return glow > 0 ? tint(base, RGBA.fromInts(255, 255, 255), glow * 0.85) : base
  }

  const renderLine = (line: string, bold: boolean): JSX.Element[] => {
    const attrs = bold ? TextAttributes.BOLD : undefined
    return Array.from(line).map((char, x) => {
      const fg = colorAt(x)
      const shadow = tint(theme.background, fg, 0.25)
      if (char === "_") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            {" "}
          </text>
        )
      }
      if (char === "^") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === "~") {
        return (
          <text fg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === ",") {
        return (
          <text fg={shadow} attributes={attrs} selectable={false}>
            ▄
          </text>
        )
      }
      return (
        <text fg={fg} attributes={attrs} selectable={false}>
          {char}
        </text>
      )
    })
  }

  return (
    <box>
      <For each={logo.left}>
        {(line, index) => (
          <box flexDirection="row" gap={1}>
            <box flexDirection="row">{renderLine(line, false)}</box>
            <box flexDirection="row">{renderLine(logo.right[index()], true)}</box>
          </box>
        )}
      </For>
    </box>
  )
}
