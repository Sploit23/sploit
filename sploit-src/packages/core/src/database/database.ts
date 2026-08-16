export * as Database from "./database"

import { EffectDrizzleSqlite } from "@sploit-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { copyFileSync, existsSync } from "fs"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@sploit/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

const channelSuffix = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")

function plainChannel() {
  return (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "true" ||
    InstallationChannel === "sploit"
  )
}

export function databaseFileName() {
  if (plainChannel()) return "sploit.db"
  return `sploit-${channelSuffix}.db`
}

export function path() {
  if (Flag.OPENCODE_DB) {
    if (Flag.OPENCODE_DB === ":memory:" || isAbsolute(Flag.OPENCODE_DB)) return Flag.OPENCODE_DB
    return join(Global.Path.data, Flag.OPENCODE_DB)
  }
  return join(Global.Path.data, databaseFileName())
}

// Copies a legacy opencode-named database to the sploit name on first boot,
// preserving db + wal + shm so no history is lost. The copy never removes the
// legacy file, so a broken migration is recoverable by reverting the binary.
// Callers decide whether an explicit OPENCODE_DB path should skip migration.
export function migrateLegacyDatabase(dataDir: string) {
  const target = join(dataDir, databaseFileName())
  if (existsSync(target)) return
  const candidates = [join(dataDir, `opencode-${channelSuffix}.db`), join(dataDir, "opencode.db")]
  for (const legacy of candidates) {
    if (legacy === target || !existsSync(legacy)) continue
    for (const suffix of ["", "-wal", "-shm"]) {
      const src = legacy + suffix
      if (existsSync(src)) copyFileSync(src, target + suffix)
    }
    return
  }
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
