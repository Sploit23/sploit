import { AnthropicPlugin } from "./provider/anthropic"
import { DynamicProviderPlugin } from "./provider/dynamic"
import { GooglePlugin } from "./provider/google"
import { OpenAIPlugin } from "./provider/openai"
import { OpenAICompatiblePlugin } from "./provider/openai-compatible"
import { OpencodePlugin } from "./provider/opencode"
import { XAIPlugin } from "./provider/xai"
import type { PluginInternal } from "./internal"
import type { Scope } from "effect"

// Sploit lean profile: only the providers this fork actually configures
// (opencode/zen for big-pickle, xai, plus the generic anthropic/google/
// openai/openai-compatible AI-SDK bridges that other Zen catalog models
// route through) and the generic DynamicProviderPlugin that backs
// config-defined custom providers like "llama.cpp"/"colab". The long tail
// of first-party vendor integrations (Alibaba, Bedrock, Azure, Cerebras,
// Cloudflare, Cohere, DeepInfra, Gateway, GitHub Copilot, GitLab, Google
// Vertex, Groq, Kilo, LLM Gateway, Mistral, Nvidia, OpenRouter, Perplexity,
// SAP AI Core, TogetherAI, Vercel, Venice, Snowflake Cortex, Zenmux) was
// removed from the source tree -- never configured here, just dead weight.
export const ProviderPlugins: PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>[] = [
  AnthropicPlugin,
  GooglePlugin,
  OpencodePlugin,
  OpenAICompatiblePlugin,
  OpenAIPlugin,
  XAIPlugin,
  DynamicProviderPlugin,
]
