import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { BackgroundJob } from "@/background/job"

export const Parameters = Schema.Struct({
  id: Schema.String.annotate({
    description: "The job id returned by bash when you set run_in_background: true.",
  }),
  kill: Schema.optional(Schema.Boolean).annotate({
    description: "Set true to stop the background command instead of just checking it.",
  }),
})

const DESCRIPTION = [
  "Check the status and accumulated output of a bash command started with run_in_background, or stop it.",
  "Call with {id} to check without waiting (never blocks). Call with {id, kill: true} to stop it.",
].join("\n")

export const BashOutputTool = Tool.define(
  "bash_output",
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { id: string; kill?: boolean }) =>
        Effect.gen(function* () {
          const info = params.kill ? yield* background.cancel(params.id) : yield* background.get(params.id)
          if (!info) {
            return {
              title: params.id,
              metadata: { status: undefined as BackgroundJob.Status | undefined },
              output: `No background job with id "${params.id}".`,
            }
          }
          return {
            title: params.id,
            metadata: { status: info.status },
            output: [
              `status: ${info.status}`,
              info.error ? `error: ${info.error}` : undefined,
              info.output ?? (info.status === "running" ? "(still running, no output yet)" : "(no output)"),
            ]
              .filter(Boolean)
              .join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
