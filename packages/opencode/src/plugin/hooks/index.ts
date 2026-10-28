import { spawn } from "node:child_process"
import type { Hooks, Plugin } from "@opencode-ai/plugin"

// First-party plugin that gives `opencode.json`/`sploit.jsonc` a declarative
// `hooks` block (same PreToolUse/PostToolUse shape as Claude Code's
// settings.json) without anyone having to write a JS plugin. It's built on
// the Hooks already exposed to every plugin (`tool.execute.before/after`),
// not on anything new in the runtime.
//
// First pass is observational, not blocking: the Hooks.config/tool.execute
// contract here has no "deny this call" output slot, so a non-zero exit is
// logged (stderr + exit code) rather than aborting the tool call. Making it
// blocking would need a change to the Hooks type itself -- noted as a
// follow-up, not silently pretended away.

interface HookEntry {
  readonly matcher?: string
  readonly command: string
}

interface HooksConfig {
  readonly PreToolUse?: HookEntry[]
  readonly PostToolUse?: HookEntry[]
}

function matchesTool(entry: HookEntry, toolID: string): boolean {
  if (!entry.matcher) return true
  try {
    return new RegExp(entry.matcher).test(toolID)
  } catch {
    return entry.matcher === toolID
  }
}

function runHook(entry: HookEntry, payload: unknown): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(entry.command, { shell: true, stdio: ["pipe", "pipe", "pipe"] })
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => {
      console.error(`[hooks] failed to start "${entry.command}": ${error.message}`)
      resolve()
    })
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[hooks] "${entry.command}" exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`)
      }
      resolve()
    })
  })
}

export const HooksConfigPlugin: Plugin = async () => {
  let config: HooksConfig = {}

  const hooks: Hooks = {
    async config(input) {
      config = (input as unknown as { hooks?: HooksConfig }).hooks ?? {}
    },
    async "tool.execute.before"(input) {
      for (const entry of (config.PreToolUse ?? []).filter((e) => matchesTool(e, input.tool))) {
        await runHook(entry, { event: "PreToolUse", tool: input.tool, sessionID: input.sessionID })
      }
    },
    async "tool.execute.after"(input, output) {
      for (const entry of (config.PostToolUse ?? []).filter((e) => matchesTool(e, input.tool))) {
        await runHook(entry, {
          event: "PostToolUse",
          tool: input.tool,
          sessionID: input.sessionID,
          args: input.args,
          title: output.title,
        })
      }
    },
  }

  return hooks
}
