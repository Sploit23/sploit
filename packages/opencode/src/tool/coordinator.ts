import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import { CoordinatorRegistry } from "@/coordinator/registry"
import { InstanceStore } from "@/project/instance-store"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import type { TaskPromptOps } from "./task"
import * as Tool from "./tool"

// coordinator_dispatch runs another project's session via InstanceStore.
// InstanceStore.node is deliberately NOT a static dependency of
// ToolRegistry.node (see tool/registry.ts's `node`): InstanceStore's own
// dependency graph only resolves its "InstanceBootstrap" placeholder through
// AppNodeBuilderV1.build, and adding it to ToolRegistry's own node graph
// breaks tests that compile ToolRegistry.node in isolation (registry.test.ts).
// Providing it locally here, the same way control-plane/workspace.ts already
// does, keeps that composition detail out of ToolRegistry entirely.
function dispatchToDirectory(input: {
  directory: string
  instruction: string
  ops: TaskPromptOps
  sessions: Session.Interface
}) {
  const sessions = input.sessions
  return Effect.gen(function* () {
    const instanceStore = yield* InstanceStore.Service
    return yield* instanceStore.provide(
      { directory: input.directory },
      Effect.gen(function* () {
        const existing = yield* sessions.list({ roots: true })
        const [latest] = existing.toSorted((a, b) => b.time.updated - a.time.updated)
        const session =
          latest ??
          (yield* sessions.create({
            title: `Coordenador: ${input.instruction.slice(0, 60)}`,
          }))
        return yield* input.ops.prompt({
          sessionID: session.id,
          parts: [{ type: "text", text: input.instruction }],
        })
      }),
    )
  }).pipe(Effect.provide(AppNodeBuilderV1.build(InstanceStore.node)))
}

const ONLY_COORDINATOR = (ctx: Tool.Context) =>
  ctx.agent !== "coordinator"
    ? Effect.fail(new Error(`This tool is only available to the "coordinator" agent (current agent: "${ctx.agent}").`))
    : Effect.void

export const RegisterParameters = Schema.Struct({
  alias: Schema.String.annotate({
    description: `Short identifier for this project (e.g. "sploit", "landing-cliente"). Used later to dispatch instructions to it.`,
  }),
  directory: Schema.String.annotate({
    description: "Absolute path to the project's directory on this machine.",
  }),
})

export const CoordinatorRegisterTool = Tool.define(
  "coordinator_register_project",
  Effect.gen(function* () {
    return {
      description:
        "Register (or update) a project alias pointing at a directory, so coordinator_dispatch can route instructions to it.",
      parameters: RegisterParameters,
      execute: (params: Schema.Schema.Type<typeof RegisterParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ONLY_COORDINATOR(ctx)
          const entry = yield* Effect.promise(() => CoordinatorRegistry.upsert(params.alias, params.directory))
          return {
            title: `registered "${entry.alias}"`,
            metadata: { alias: entry.alias, directory: entry.directory },
            output: `Registered "${entry.alias}" -> ${entry.directory}`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const ListParameters = Schema.Struct({})

export const CoordinatorListTool = Tool.define(
  "coordinator_list_projects",
  Effect.gen(function* () {
    return {
      description: "List every project currently registered with the coordinator.",
      parameters: ListParameters,
      execute: (_params: Schema.Schema.Type<typeof ListParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ONLY_COORDINATOR(ctx)
          const entries = yield* Effect.promise(() => CoordinatorRegistry.list())
          const output =
            entries.length === 0
              ? "No projects registered yet. Use coordinator_register_project to add one."
              : entries.map((entry) => `${entry.alias} -> ${entry.directory}`).join("\n")
          return {
            title: `${entries.length} project(s)`,
            metadata: { count: entries.length },
            output,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const DispatchParameters = Schema.Struct({
  project: Schema.String.annotate({
    description: "The alias of a project previously registered with coordinator_register_project.",
  }),
  instruction: Schema.String.annotate({
    description: "The instruction to send to that project's own agent session, in natural language.",
  }),
})

export const CoordinatorDispatchTool = Tool.define(
  "coordinator_dispatch",
  Effect.gen(function* () {
    const sessions = yield* Session.Service

    return {
      description:
        "Send an instruction to another project's agent session (identified by its registered alias). Reuses that project's existing session if one exists, or starts a new one. Returns the agent's reply.",
      parameters: DispatchParameters,
      execute: (params: Schema.Schema.Type<typeof DispatchParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ONLY_COORDINATOR(ctx)

          const entry = yield* Effect.promise(() => CoordinatorRegistry.get(params.project))
          if (!entry) {
            const known = yield* Effect.promise(() => CoordinatorRegistry.list())
            const names = known.map((item) => item.alias).join(", ") || "(none registered)"
            return yield* Effect.fail(
              new Error(`Unknown project "${params.project}". Known projects: ${names}`),
            )
          }

          const ops = ctx.extra?.promptOps as TaskPromptOps
          if (!ops) return yield* Effect.fail(new Error("coordinator_dispatch requires promptOps in ctx.extra"))

          const result = yield* dispatchToDirectory({
            directory: entry.directory,
            instruction: params.instruction,
            ops,
            sessions,
          })

          if (result.info.role === "assistant" && result.info.error) {
            const message =
              "message" in result.info.error.data && typeof result.info.error.data.message === "string"
                ? result.info.error.data.message
                : result.info.error.name
            return yield* Effect.fail(new Error(`"${params.project}" failed to respond: ${message}`))
          }

          const reply = result.parts.findLast((part) => part.type === "text")?.text ?? "(no reply)"
          return {
            title: `dispatched to "${params.project}"`,
            metadata: { project: params.project, directory: entry.directory },
            output: reply,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
