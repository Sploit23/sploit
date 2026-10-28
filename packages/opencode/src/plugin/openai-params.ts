import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import os from "node:os"

// Generic request shaping for the plain "openai" provider id (a user's own
// OpenAI API key, configured directly -- not Zen/big-pickle, which routes
// through the "opencode" provider id and never hits this check). Split out
// of the upstream Codex OAuth-login plugin, which bundled this in with a
// whole device-code login flow, model allow/deny lists and a WebSocket
// transport pool this fork never uses. Those stay removed; this generic
// bit stays because it's not Codex-specific -- it applies to every openai
// request regardless of auth method.
export async function OpenAIParamsPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    "chat.headers": async (input, output) => {
      if (input.model.providerID !== "openai") return
      output.headers.originator = "opencode"
      output.headers["User-Agent"] = `opencode/${InstallationVersion} (${os.platform()} ${os.release()}; ${os.arch()})`
      output.headers["session-id"] = input.sessionID
    },
    "chat.params": async (input, output) => {
      if (input.model.providerID !== "openai") return
      // Match codex cli: the OpenAI responses API rejects/clips certain
      // reasoning models when max_output_tokens is sent explicitly.
      output.maxOutputTokens = undefined
    },
  }
}
