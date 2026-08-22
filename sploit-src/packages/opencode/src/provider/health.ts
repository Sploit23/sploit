import type { ProviderV2 } from "@sploit-ai/core/provider"

// Tracks providers that just failed with a hard, non-transient error (free
// tier / account rate limit exhausted) so defaultModel() can skip straight to
// a configured fallback instead of retrying the same dead provider on the
// next turn. Per-process only: a restart clears it, which is fine since the
// next real request will re-derive the block if it's still in effect.
const blocked = new Map<string, number>()

export function markBlocked(providerID: ProviderV2.ID, untilMs: number) {
  const existing = blocked.get(providerID)
  if (existing !== undefined && existing >= untilMs) return
  blocked.set(providerID, untilMs)
}

export function isBlocked(providerID: ProviderV2.ID, now = Date.now()) {
  const until = blocked.get(providerID)
  if (until === undefined) return false
  if (now >= until) {
    blocked.delete(providerID)
    return false
  }
  return true
}

export function clear() {
  blocked.clear()
}

export * as ProviderHealth from "./health"
