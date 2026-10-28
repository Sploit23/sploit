import os from "os"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { effectCmd } from "../effect-cmd"
import { UI } from "../ui"
import { Config } from "@/config/config"
import { Auth } from "../../auth"
import { Database } from "@opencode-ai/core/database/database"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

// Restores the "doctor" command the original Sploit build had (environment,
// config, auth, database) -- absent from vanilla opencode. Reuses the same
// services the existing debug/providers/db commands already use; no new
// diagnostic machinery.
type CheckResult = { name: string; ok: boolean; detail: string }

export const DoctorCommand = effectCmd({
  command: "doctor",
  describe: "diagnose the local setup (environment, config, auth, database)",
  handler: Effect.fn("Cli.doctor")(function* () {
    const checks: CheckResult[] = []

    checks.push({
      name: "environment",
      ok: true,
      detail: `node ${process.version}, ${os.type()} ${os.release()} ${os.arch()}, sploit ${InstallationVersion}`,
    })

    const configResult = yield* Config.Service.use((cfg) => cfg.get()).pipe(
      Effect.map((cfg) => ({ ok: true as const, cfg })),
      Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
    )
    checks.push(
      configResult.ok
        ? {
            name: "config",
            ok: true,
            detail: `loaded (providers: ${Object.keys(configResult.cfg.provider ?? {}).length}, default model: ${configResult.cfg.model ?? "none set"})`,
          }
        : { name: "config", ok: false, detail: String(configResult.error) },
    )

    const authResult = yield* Effect.gen(function* () {
      const auth = yield* Auth.Service
      return yield* auth.all()
    }).pipe(
      Effect.map((all) => ({ ok: true as const, count: Object.keys(all).length })),
      Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
    )
    checks.push(
      authResult.ok
        ? {
            name: "auth",
            ok: authResult.count > 0,
            detail:
              authResult.count > 0
                ? `${authResult.count} credential(s) stored`
                : "no credentials stored (log in with `providers login`, or confirm the active provider needs none)",
          }
        : { name: "auth", ok: false, detail: String(authResult.error) },
    )

    const dbResult = yield* Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* db.all(sql.raw("select 1")).pipe(Effect.orDie)
      return Database.path()
    }).pipe(
      Effect.map((dbPath) => ({ ok: true as const, dbPath })),
      Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
    )
    checks.push(
      dbResult.ok
        ? { name: "database", ok: true, detail: dbResult.dbPath }
        : { name: "database", ok: false, detail: String(dbResult.error) },
    )

    for (const check of checks) {
      UI.println(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}`)
    }

    if (checks.some((check) => !check.ok)) process.exitCode = 1
  }),
})
