import { beforeEach, describe, expect, test } from "bun:test"
import { ProviderV2 } from "@sploit-ai/core/provider"
import { ProviderHealth } from "@/provider/health"

describe("ProviderHealth", () => {
  beforeEach(() => {
    ProviderHealth.clear()
  })

  test("unmarked providers are not blocked", () => {
    expect(ProviderHealth.isBlocked(ProviderV2.ID.make("opencode"))).toBe(false)
  })

  test("marked providers are blocked until the given time", () => {
    const id = ProviderV2.ID.make("opencode")
    const now = 1_000_000
    ProviderHealth.markBlocked(id, now + 60_000)
    expect(ProviderHealth.isBlocked(id, now)).toBe(true)
    expect(ProviderHealth.isBlocked(id, now + 30_000)).toBe(true)
  })

  test("block expires once the deadline passes", () => {
    const id = ProviderV2.ID.make("opencode")
    const now = 1_000_000
    ProviderHealth.markBlocked(id, now + 60_000)
    expect(ProviderHealth.isBlocked(id, now + 60_000)).toBe(false)
    // once expired, it should stay unblocked (the entry gets cleared)
    expect(ProviderHealth.isBlocked(id, now + 60_001)).toBe(false)
  })

  test("a later, longer block extends the deadline; a shorter one does not shrink it", () => {
    const id = ProviderV2.ID.make("opencode")
    const now = 1_000_000
    ProviderHealth.markBlocked(id, now + 60_000)
    ProviderHealth.markBlocked(id, now + 10_000)
    expect(ProviderHealth.isBlocked(id, now + 30_000)).toBe(true)
  })

  test("does not affect other providers", () => {
    const blockedID = ProviderV2.ID.make("opencode")
    const otherID = ProviderV2.ID.make("google")
    ProviderHealth.markBlocked(blockedID, Date.now() + 60_000)
    expect(ProviderHealth.isBlocked(otherID)).toBe(false)
  })
})
