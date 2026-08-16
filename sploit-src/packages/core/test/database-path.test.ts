import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { Database } from "@sploit-ai/core/database/database"
import { InstallationChannel } from "@sploit-ai/core/installation/version"

const channelSuffix = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sploit-db-"))
}

describe("Database legacy migration", () => {
  test("migrates a legacy channeled database to the sploit name", () => {
    const dir = tmpDataDir()
    const legacy = path.join(dir, `opencode-${channelSuffix}.db`)
    fs.writeFileSync(legacy, "legacy-db")
    fs.writeFileSync(legacy + "-wal", "legacy-wal")
    fs.writeFileSync(legacy + "-shm", "legacy-shm")

    Database.migrateLegacyDatabase(dir)

    const target = path.join(dir, Database.databaseFileName())
    expect(fs.readFileSync(target, "utf8")).toBe("legacy-db")
    expect(fs.readFileSync(target + "-wal", "utf8")).toBe("legacy-wal")
    expect(fs.readFileSync(target + "-shm", "utf8")).toBe("legacy-shm")
  })

  test("is idempotent and never overwrites an existing target", () => {
    const dir = tmpDataDir()
    const legacy = path.join(dir, `opencode-${channelSuffix}.db`)
    const target = path.join(dir, Database.databaseFileName())
    fs.writeFileSync(legacy, "legacy")
    fs.writeFileSync(target, "existing")

    Database.migrateLegacyDatabase(dir)

    expect(fs.readFileSync(target, "utf8")).toBe("existing")
  })

  test("falls back to opencode.db when no channeled legacy exists", () => {
    const dir = tmpDataDir()
    fs.writeFileSync(path.join(dir, "opencode.db"), "plain-legacy")

    Database.migrateLegacyDatabase(dir)

    expect(fs.readFileSync(path.join(dir, Database.databaseFileName()), "utf8")).toBe("plain-legacy")
  })

  test("creates nothing when there is no legacy database", () => {
    const dir = tmpDataDir()
    Database.migrateLegacyDatabase(dir)
    expect(fs.readdirSync(dir)).toEqual([])
  })
})
