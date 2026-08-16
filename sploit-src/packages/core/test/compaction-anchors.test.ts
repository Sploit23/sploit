import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "fs"
import { tmpdir } from "os"
import { Effect } from "effect"
import { SessionCompaction } from "@sploit-ai/core/session/compaction"

const runAnchors = (directory: string) =>
  SessionCompaction.loadAnchors(directory).pipe(Effect.runPromise)

function makeGraph(directory: string, nodes: unknown[], links: unknown[]) {
  const graphDir = path.join(directory, "graphify-out")
  mkdirSync(graphDir, { recursive: true })
  writeFileSync(
    path.join(graphDir, "graph.json"),
    JSON.stringify({ nodes, links }),
    "utf-8",
  )
}

describe("SessionCompaction.loadAnchors", () => {
  test("returns empty when the project has no graph", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anchors-nograph-"))
    try {
      expect(await runAnchors(dir)).toBe("")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("returns the highest-degree code files as anchors", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anchors-"))
    try {
      const nodes = [
        { id: "a", label: "core.ts", file_type: "code", source_file: "src/core.ts" },
        { id: "b", label: "side.ts", file_type: "code", source_file: "src/side.ts" },
        { id: "c", label: "doc.md", file_type: "docs", source_file: "docs/readme.md" },
      ]
      const links = [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "a" },
      ]
      makeGraph(dir, nodes, links)
      const anchors = await runAnchors(dir)
      expect(anchors).toBe("- src/core.ts\n- src/side.ts")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("recomputes when graph.json changes (cache invalidation by mtime)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anchors-cache-"))
    try {
      const nodes = [{ id: "a", label: "core.ts", file_type: "code", source_file: "src/core.ts" }]
      makeGraph(dir, nodes, [{ source: "a", target: "a" }])
      expect(await runAnchors(dir)).toBe("- src/core.ts")

      makeGraph(dir, nodes, [{ source: "a", target: "b" }])
      const graphPath = path.join(dir, "graphify-out", "graph.json")
      const future = new Date(Date.now() + 60_000)
      utimesSync(graphPath, future, future)
      expect(await runAnchors(dir)).toBe("- src/core.ts")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("does not break on a malformed graph file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anchors-bad-"))
    try {
      const graphDir = path.join(dir, "graphify-out")
      mkdirSync(graphDir, { recursive: true })
      writeFileSync(path.join(graphDir, "graph.json"), "not json", "utf-8")
      expect(await runAnchors(dir)).toBe("")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
