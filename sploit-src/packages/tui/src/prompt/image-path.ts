import { statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { FilePartInput } from "@sploit-ai/sdk/v2"

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"])

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

type ExistingFile = Readonly<{ source?: unknown; filename?: string }>

export function findImagePaths(
  text: string,
  cwd: string,
  home: string,
  existing: readonly ExistingFile[],
): string[] {
  const already = new Set(
    existing
      .map((part) => {
        const raw = isRecordWithPath(part.source) ? part.source.path : undefined
        if (!raw) return
        try {
          return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(cwd, raw)
        } catch {
          return
        }
      })
      .filter((value): value is string => Boolean(value)),
  )
  const found = new Set<string>()
  for (const token of text.split(/\s+/)) {
    const abs = resolveImageToken(token, cwd, home)
    if (!abs || found.has(abs) || already.has(abs) || !isFile(abs)) continue
    found.add(abs)
  }
  return [...found]
}

export async function readImageParts(
  text: string,
  cwd: string,
  home: string,
  existing: readonly ExistingFile[],
): Promise<FilePartInput[]> {
  const parts: FilePartInput[] = []
  for (const file of findImagePaths(text, cwd, home, existing)) {
    const mime = MIME[path.extname(file).toLowerCase()]
    if (!mime) continue
    const content = await readFile(file).catch(() => undefined)
    if (!content) continue
    parts.push({
      type: "file",
      mime,
      filename: path.basename(file),
      url: `data:${mime};base64,${content.toString("base64")}`,
    })
  }
  return parts
}

function resolveImageToken(token: string, cwd: string, home: string): string | undefined {
  const raw = token.replace(/^[\[("'`@]+/, "").replace(/[\])"',.;:!?`]+$/, "").trim()
  if (!raw || raw.length > 4096) return
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return
  const ext = path.extname(raw).toLowerCase()
  if (!IMAGE_EXTENSIONS.has(ext)) return
  try {
    if (path.isAbsolute(raw)) return path.normalize(raw)
    if (raw.startsWith("~/")) return path.join(home, raw.slice(2))
    return path.resolve(cwd, raw)
  } catch {
    return
  }
}

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile()
  } catch {
    return false
  }
}

function isRecordWithPath(value: unknown): value is { path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string"
  )
}
