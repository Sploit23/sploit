import path from "path"
import { Global } from "@opencode-ai/core/global"

export interface ProjectEntry {
  alias: string
  directory: string
  addedAt: number
}

function registryPath() {
  return path.join(Global.Path.data, "coordinator", "projects.json")
}

async function readAll(): Promise<ProjectEntry[]> {
  const file = Bun.file(registryPath())
  if (!(await file.exists())) return []
  const data = await file.json().catch(() => undefined)
  return Array.isArray(data) ? data : []
}

async function writeAll(entries: ProjectEntry[]) {
  await Bun.write(registryPath(), JSON.stringify(entries, null, 2))
}

export async function list(): Promise<ProjectEntry[]> {
  return readAll()
}

export async function get(alias: string): Promise<ProjectEntry | undefined> {
  const entries = await readAll()
  return entries.find((entry) => entry.alias === alias)
}

export async function upsert(alias: string, directory: string): Promise<ProjectEntry> {
  const entries = await readAll()
  const resolved = path.resolve(directory)
  const existing = entries.find((entry) => entry.alias === alias)
  if (existing) {
    existing.directory = resolved
    await writeAll(entries)
    return existing
  }
  const entry: ProjectEntry = { alias, directory: resolved, addedAt: Date.now() }
  entries.push(entry)
  await writeAll(entries)
  return entry
}

export async function remove(alias: string): Promise<boolean> {
  const entries = await readAll()
  const next = entries.filter((entry) => entry.alias !== alias)
  if (next.length === entries.length) return false
  await writeAll(next)
  return true
}

export * as CoordinatorRegistry from "./registry"
