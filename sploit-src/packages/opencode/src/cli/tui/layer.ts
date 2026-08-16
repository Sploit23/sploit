import { run as runTui, type TuiInput } from "@sploit-ai/tui"
import { Global } from "@sploit-ai/core/global"
import { AppNodeBuilder } from "@sploit-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
