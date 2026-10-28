import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import { CoordinatorRegistry } from "@/coordinator/registry"
import { InstanceStore } from "@/project/instance-store"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import type { TaskPromptOps } from "./task"
import * as Tool from "./tool"

// --- descoberta ao vivo de projetos no mesh do Sploit-Forge ---
// Quando esta sessão foi aberta pelo FORGE como o coordenador
// (sessions-native.js's mode:'coordinator'), FORGE_TOKEN/PORT vêm no
// ambiente -- exceção estreita ao CHILD_ENV que tira o token de toda
// sessão normal (só o coordenador precisa se autenticar na própria API
// local pra descobrir o resto da rede). Sem esses dois, a descoberta ao
// vivo simplesmente não roda, e só o registro manual (CoordinatorRegistry)
// continua funcionando -- degrada graciosamente fora do FORGE.
interface KnownDevice {
  hostname: string
  dnsName: string
  token: string
}
interface ForgeProject {
  name: string
  path: string
}
interface ResolvedProject {
  alias: string
  directory: string
  machine: string // "local" ou o dnsName da máquina onde o projeto mora
  token?: string // só presente quando machine !== "local"
}

async function fetchJson(url: string, token: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return undefined
    return await res.json()
  } catch {
    return undefined
  }
}

async function listAllProjects(): Promise<ResolvedProject[]> {
  const localToken = process.env.FORGE_TOKEN
  const localPort = process.env.PORT || "7777"
  const out: ResolvedProject[] = []

  if (localToken) {
    const localProjects = (await fetchJson(`http://127.0.0.1:${localPort}/api/projects`, localToken)) as
      | ForgeProject[]
      | undefined
    for (const p of localProjects ?? []) out.push({ alias: p.name, directory: p.path, machine: "local" })

    const machines = (await fetchJson(`http://127.0.0.1:${localPort}/api/known-devices`, localToken)) as
      | KnownDevice[]
      | undefined
    for (const m of machines ?? []) {
      const remoteProjects = (await fetchJson(`https://${m.dnsName}/api/projects`, m.token)) as
        | ForgeProject[]
        | undefined
      for (const p of remoteProjects ?? [])
        out.push({ alias: p.name, directory: p.path, machine: m.dnsName, token: m.token })
    }
  }

  // registro manual (CoordinatorRegistry) só entra pra aliases que a
  // descoberta ao vivo não achou -- evita duplicar o mesmo projeto com
  // dois nomes diferentes quando ele já apareceu via /api/projects.
  const known = new Set(out.map((e) => e.alias))
  const registered = await CoordinatorRegistry.list()
  for (const r of registered) if (!known.has(r.alias)) out.push({ alias: r.alias, directory: r.directory, machine: "local" })

  return out
}

async function resolveProject(alias: string): Promise<ResolvedProject | undefined> {
  const all = await listAllProjects()
  return all.find((e) => e.alias === alias)
}

async function listKnownMachines(): Promise<KnownDevice[]> {
  const localToken = process.env.FORGE_TOKEN
  const localPort = process.env.PORT || "7777"
  if (!localToken) return []
  const machines = await fetchJson(`http://127.0.0.1:${localPort}/api/known-devices`, localToken)
  return (machines as KnownDevice[] | undefined) ?? []
}

// coordinator_dispatch roda outra sessão de projeto via InstanceStore.
// InstanceStore.node é propositalmente NÃO uma dependência estática de
// ToolRegistry.node (ver tool/registry.ts's `node`): o grafo de
// dependências do InstanceStore só resolve seu placeholder
// "InstanceBootstrap" através de AppNodeBuilderV1.build, e adicioná-lo ao
// grafo do ToolRegistry quebra testes que compilam ToolRegistry.node
// isoladamente (registry.test.ts). Provendo localmente aqui, do mesmo
// jeito que control-plane/workspace.ts já faz, mantém esse detalhe de
// composição fora do ToolRegistry inteiramente.
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
        "Register (or update) a project alias pointing at a directory on THIS machine, for projects coordinator_list_projects can't discover automatically (e.g. not managed by a Sploit-Forge instance).",
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
      description:
        "List every project the coordinator can reach -- auto-discovered live across every Sploit-Forge machine on the network (this one and any other that has announced itself), plus anything manually registered with coordinator_register_project. Each entry shows which machine it lives on.",
      parameters: ListParameters,
      execute: (_params: Schema.Schema.Type<typeof ListParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ONLY_COORDINATOR(ctx)
          const entries = yield* Effect.promise(() => listAllProjects())
          const output =
            entries.length === 0
              ? "No projects found. Use coordinator_register_project to add one manually."
              : entries
                  .map((e) => `${e.alias} -> ${e.machine === "local" ? "" : `[${e.machine}] `}${e.directory}`)
                  .join("\n")
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
    description: "The alias of a project, as returned by coordinator_list_projects.",
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
        "Send an instruction to another project's agent session -- works whether that project lives on this machine or on another Sploit-Forge machine on the network (resolved automatically via coordinator_list_projects). Reuses that project's existing session if one exists, or starts a new one. Returns the agent's reply. Use this for 'work on / continue / fix project X' -- not for moving files between machines (see coordinator_transfer_project).",
      parameters: DispatchParameters,
      execute: (params: Schema.Schema.Type<typeof DispatchParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ONLY_COORDINATOR(ctx)

          const entry = yield* Effect.promise(() => resolveProject(params.project))
          if (!entry) {
            const all = yield* Effect.promise(() => listAllProjects())
            const names = all.map((e) => e.alias).join(", ") || "(none found)"
            return yield* Effect.fail(new Error(`Unknown project "${params.project}". Known projects: ${names}`))
          }

          if (entry.machine === "local") {
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
              metadata: { project: params.project, directory: entry.directory, machine: "local" },
              output: reply,
            }
          }

          // projeto remoto -- a máquina de destino já roda um
          // `opencode serve` local que server.js supervisiona; a ponte
          // autenticada é POST /api/coordinator/prompt (ver server.js).
          const reply = yield* Effect.promise(async () => {
            const res = await fetch(`https://${entry.machine}/api/coordinator/prompt`, {
              method: "POST",
              headers: { Authorization: `Bearer ${entry.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ project: entry.alias, instruction: params.instruction }),
              signal: AbortSignal.timeout(120_000),
            })
            return (await res.json()) as { reply?: string; error?: string }
          })

          if (reply.error) return yield* Effect.fail(new Error(`"${params.project}" (${entry.machine}) failed: ${reply.error}`))
          return {
            title: `dispatched to "${params.project}" (${entry.machine})`,
            metadata: { project: params.project, directory: entry.directory, machine: entry.machine },
            output: reply.reply ?? "(no reply)",
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const TransferParameters = Schema.Struct({
  alias: Schema.String.annotate({
    description: "The alias of the project to transfer, as returned by coordinator_list_projects.",
  }),
  toMachine: Schema.String.annotate({
    description: "Hostname or dnsName of the destination machine, as returned by coordinator_list_projects.",
  }),
})

export const CoordinatorTransferTool = Tool.define(
  "coordinator_transfer_project",
  Effect.gen(function* () {
    return {
      description:
        "Move an entire project's files from the machine it currently lives on to another Sploit-Forge machine. Use this for 'send/move/copy project X to machine Y' -- not for dispatching an instruction to an agent (see coordinator_dispatch).",
      parameters: TransferParameters,
      execute: (params: Schema.Schema.Type<typeof TransferParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ONLY_COORDINATOR(ctx)

          const localToken = process.env.FORGE_TOKEN
          const localPort = process.env.PORT || "7777"
          if (!localToken)
            return yield* Effect.fail(new Error("coordinator_transfer_project needs FORGE_TOKEN in the environment (only available when running as the FORGE coordinator session)."))

          const entry = yield* Effect.promise(() => resolveProject(params.alias))
          if (!entry) return yield* Effect.fail(new Error(`Unknown project "${params.alias}".`))

          const machines = yield* Effect.promise(() => listKnownMachines())
          const dest = machines.find(
            (m) => m.hostname === params.toMachine || m.dnsName === params.toMachine || m.dnsName.startsWith(params.toMachine + "."),
          )
          if (!dest) {
            const names = machines.map((m) => m.hostname).join(", ") || "(none known)"
            return yield* Effect.fail(new Error(`Unknown destination machine "${params.toMachine}". Known machines: ${names}`))
          }

          const sourceBase = entry.machine === "local" ? `http://127.0.0.1:${localPort}` : `https://${entry.machine}`
          const sourceToken = entry.machine === "local" ? localToken : entry.token!

          const result = yield* Effect.promise(async () => {
            const res = await fetch(`${sourceBase}/api/relay-send`, {
              method: "POST",
              headers: { Authorization: `Bearer ${sourceToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                path: entry.directory,
                targetUrl: `https://${dest.dnsName}`,
                targetToken: dest.token,
                name: entry.alias,
              }),
              signal: AbortSignal.timeout(120_000),
            })
            return (await res.json()) as { ok?: boolean; error?: string }
          })

          if (result.error) return yield* Effect.fail(new Error(`Transfer of "${params.alias}" failed: ${result.error}`))
          return {
            title: `transferred "${params.alias}" -> ${dest.hostname}`,
            metadata: { alias: params.alias, from: entry.machine, to: dest.hostname },
            output: `"${params.alias}" transferred from ${entry.machine === "local" ? "this machine" : entry.machine} to ${dest.hostname}.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
