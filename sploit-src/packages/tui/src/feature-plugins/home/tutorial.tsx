import type { TuiPlugin, TuiPluginApi } from "@sploit-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { Show, createMemo } from "solid-js"
import { useBindings } from "../../keymap"
import { DialogTutorial } from "../../ui/dialog-tutorial"

const id = "internal:home-tutorial"

function TutorialLine(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current

  return (
    <box width="100%" maxWidth={75} alignItems="center" paddingTop={3} flexShrink={1}>
      <text fg={theme().text}>/tutorial</text>
    </box>
  )
}function View(props: { api: TuiPluginApi; hidden: boolean; show: boolean }) {
  useBindings(() => ({
    commands: [
      {
        name: "tutorial.show",
        title: "Tutorial",
        slashName: "tutorial",
        category: "System",
        namespace: "palette",
        run() {
          props.api.ui.dialog.replace(() => <DialogTutorial />)
        },
      },
      {
        name: "tips.toggle",
        title: props.hidden ? "Mostrar dica" : "Ocultar dica",
        category: "System",
        namespace: "palette",
        run() {
          props.api.kv.set("tutorial_hidden", !props.api.kv.get("tutorial_hidden", false))
          props.api.ui.dialog.clear()
        },
      },
    ],
    bindings: props.api.tuiConfig.keybinds.get("tips.toggle"),
  }))

  return (
    <Show when={props.show}>
      <TutorialLine api={props.api} />
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      home_bottom() {
        const hidden = createMemo(() => api.kv.get("tutorial_hidden", false))
        const show = createMemo(() => !hidden())
        return <View api={api} hidden={hidden()} show={show()} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
