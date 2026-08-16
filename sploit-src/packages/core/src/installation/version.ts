declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
// "sploit" is this fork's own build channel — its version string (e.g. "0.1.0-sploit") is never
// published to npm, so it must be treated like "local": don't pin @sploit-ai/plugin to it.
export const InstallationLocal = InstallationChannel === "local" || InstallationChannel === "sploit"
