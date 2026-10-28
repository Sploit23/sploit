import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import { Spinner } from "./spinner"

function randomBits(length: number): string {
  let out = ""
  for (let i = 0; i < length; i++) out += Math.random() < 0.5 ? "0" : "1"
  return out
}

export function StartupLoading(props: { ready: () => boolean }) {
  const theme = useTheme().theme
  const kv = useKV()
  const [show, setShow] = createSignal(false)
  const [bits, setBits] = createSignal(randomBits(24))
  const text = createMemo(() => (props.ready() ? "Finishing startup…" : "Loading plugins…"))

  createEffect(() => {
    if (!show() || !kv.get("animations_enabled", true)) return
    const timer = setInterval(() => setBits(randomBits(24)), 180)
    onCleanup(() => clearInterval(timer))
  })
  let wait: NodeJS.Timeout | undefined
  let hold: NodeJS.Timeout | undefined
  let stamp = 0

  createEffect(() => {
    if (props.ready()) {
      if (wait) {
        clearTimeout(wait)
        wait = undefined
      }
      if (!show()) return
      if (hold) return

      const left = 3000 - (Date.now() - stamp)
      if (left <= 0) {
        setShow(false)
        return
      }

      hold = setTimeout(() => {
        hold = undefined
        setShow(false)
      }, left).unref()
      return
    }

    if (hold) {
      clearTimeout(hold)
      hold = undefined
    }
    if (show()) return
    if (wait) return

    wait = setTimeout(() => {
      wait = undefined
      stamp = Date.now()
      setShow(true)
    }, 500).unref()
  })

  onCleanup(() => {
    if (wait) clearTimeout(wait)
    if (hold) clearTimeout(hold)
  })

  return (
    <Show when={show()}>
      <box position="absolute" zIndex={5000} left={0} right={0} bottom={1} justifyContent="center" alignItems="center">
        <box backgroundColor={theme.backgroundPanel} paddingLeft={1} paddingRight={1} flexDirection="row" gap={1}>
          <Spinner color={theme.primary}>{text()}</Spinner>
          <text fg={theme.borderActive}>{bits()}</text>
        </box>
      </box>
    </Show>
  )
}
