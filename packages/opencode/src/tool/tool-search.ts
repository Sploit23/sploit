import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { DeferredTools } from "./deferred-tools"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description:
      "Name or keyword for a capability you need but don't see in your tool list (for example 'webfetch', 'task', 'skill', 'mcp', 'lsp').",
  }),
})

const DESCRIPTION = [
  "Find tools that exist but aren't loaded yet, so the default tool list can stay small.",
  "Call this with a name or keyword (webfetch, task, skill, mcp, lsp, apply_patch, question, todowrite, websearch) when you need a capability that isn't in your current tools.",
  "Matches become callable for the rest of this session -- no need to call this again for the same tool.",
].join("\n")

export const ToolSearchTool = Tool.define(
  "tool_search",
  Effect.gen(function* () {
    const deferred = yield* DeferredTools.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { query: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const matches = yield* deferred.search(params.query)
          if (matches.length === 0) {
            return {
              title: params.query,
              metadata: { unlocked: [] },
              output: `No deferred tool matches "${params.query}". Known deferred tools: task, webfetch, websearch, todowrite, skill, apply_patch, question, lsp.`,
            }
          }
          yield* deferred.unlock(ctx.sessionID, matches.map((match) => match.id))
          return {
            title: params.query,
            metadata: { unlocked: matches.map((match) => match.id) },
            output: [
              "Unlocked for the rest of this session:",
              ...matches.map((match) => `- ${match.id}: ${match.description.split("\n")[0]}`),
            ].join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export * as ToolSearch from "./tool-search"
