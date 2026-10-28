import { Context, Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"

// Shared leaf module between registry.ts (writes the catalog, reads the
// unlocked set to filter what's sent to the model) and tool-search.ts (reads
// the catalog to match a query, writes unlocks). Neither of those two files
// imports the other -- this is what lets a tool discover and unlock *other*
// tools without a circular module dependency between the tool and the
// registry that defines it.
export interface CatalogEntry {
  readonly id: string
  readonly description: string
}

export interface Interface {
  readonly setCatalog: (entries: CatalogEntry[]) => Effect.Effect<void>
  readonly search: (query: string) => Effect.Effect<CatalogEntry[]>
  readonly unlock: (sessionID: string, ids: string[]) => Effect.Effect<void>
  readonly unlockedSet: (sessionID: string) => Effect.Effect<ReadonlySet<string>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/DeferredTools") {}

type State = {
  catalog: CatalogEntry[]
  unlocked: Map<string, Set<string>>
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* InstanceState.make<State>(() => Effect.succeed({ catalog: [], unlocked: new Map() }))

    const setCatalog: Interface["setCatalog"] = (entries) =>
      InstanceState.useEffect(state, (s) =>
        Effect.sync(() => {
          s.catalog = entries
        }),
      )

    const search: Interface["search"] = (query) =>
      InstanceState.use(state, (s) => {
        const q = query.trim().toLowerCase()
        if (!q) return s.catalog
        return s.catalog.filter((entry) => entry.id.includes(q) || entry.description.toLowerCase().includes(q))
      })

    const unlock: Interface["unlock"] = (sessionID, ids) =>
      InstanceState.useEffect(state, (s) =>
        Effect.sync(() => {
          const set = s.unlocked.get(sessionID) ?? new Set<string>()
          for (const id of ids) set.add(id)
          s.unlocked.set(sessionID, set)
        }),
      )

    const unlockedSet: Interface["unlockedSet"] = (sessionID) =>
      InstanceState.use(state, (s) => s.unlocked.get(sessionID) ?? new Set<string>())

    return Service.of({ setCatalog, search, unlock, unlockedSet })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })

export * as DeferredTools from "./deferred-tools"
