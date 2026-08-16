import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"

const TEXT_MS = 4000
const GAP_MS = 300
const PALETTE = ["#b14dff", "#c94df4", "#e14de9", "#f84dbf", "#ff4d94"]

type BrandStep =
  | { type: "text"; text: string; fg: string }
  | { type: "rainbow"; prefix: string; prefixFg: string; text: string }
  | { type: "gap" }

export function SploitBrand(props: { version: string }) {
  const version = props.version.replace(/-sploit$/, "")

  const cycle = createMemo<BrandStep[]>(() => [
    { type: "text", text: `sploit ${version}`, fg: "#8a8a8a" },
    { type: "gap" },
    { type: "rainbow", prefix: "Criado por ", prefixFg: "#8a8a8a", text: "Flávio Alex" },
    { type: "gap" },
  ])

  const [step, setStep] = createSignal<BrandStep>(cycle()[0])

  createEffect(() => {
    const steps = cycle()
    let i = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      i = (i + 1) % steps.length
      setStep(steps[i])
      timer = setTimeout(tick, steps[i].type === "gap" ? GAP_MS : TEXT_MS)
    }
    timer = setTimeout(tick, steps[i].type === "gap" ? GAP_MS : TEXT_MS)
    onCleanup(() => clearTimeout(timer))
  })

  const brand = createMemo(() => {
    const current = step()
    if (current.type === "gap") return
    return current
  })

  return (
    <Show when={brand()} fallback={<b> </b>}>
      {(value) => {
        const step = value()
        if (step.type === "text") return <b style={{ fg: step.fg }}>{step.text}</b>
        return (
          <b>
            <span style={{ fg: step.prefixFg }}>{step.prefix}</span>
            {step.text.split("").map((char, i) => (
              <span style={{ fg: PALETTE[i % PALETTE.length] }}>{char}</span>
            ))}
          </b>
        )
      }}
    </Show>
  )
}
