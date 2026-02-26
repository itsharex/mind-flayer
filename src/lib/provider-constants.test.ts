import { describe, expect, it } from "vitest"
import { MODEL_PROVIDERS } from "@/lib/provider-constants"

const expectedMinimaxPricing = {
  "MiniMax-M2.5": {
    currency: "CNY",
    input: 2.1,
    output: 8.4,
    cachedRead: 0.21,
    cachedWrite: 2.625
  },
  "MiniMax-M2.5-highspeed": {
    currency: "CNY",
    input: 4.2,
    output: 16.8,
    cachedRead: 0.21,
    cachedWrite: 2.625
  },
  "MiniMax-M2.1": {
    currency: "CNY",
    input: 2.1,
    output: 8.4,
    cachedRead: 0.21,
    cachedWrite: 2.625
  },
  "MiniMax-M2.1-highspeed": {
    currency: "CNY",
    input: 4.2,
    output: 16.8,
    cachedRead: 0.21,
    cachedWrite: 2.625
  },
  "MiniMax-M2": {
    currency: "CNY",
    input: 2.1,
    output: 8.4,
    cachedRead: 0.21,
    cachedWrite: 2.625
  }
} as const

describe("MODEL_PROVIDERS minimax pricing", () => {
  it("matches the expected minimax model set and excludes M2-her", () => {
    const minimaxProvider = MODEL_PROVIDERS.find(provider => provider.id === "minimax")

    expect(minimaxProvider).toBeDefined()
    if (!minimaxProvider) {
      return
    }

    const modelIds = (minimaxProvider.models ?? []).map(model => model.api_id).sort()
    const expectedModelIds = Object.keys(expectedMinimaxPricing).sort()

    expect(modelIds).toEqual(expectedModelIds)
    expect(modelIds).not.toContain("M2-her")
  })

  it("uses CNY pricing and expected values for all minimax models", () => {
    const minimaxProvider = MODEL_PROVIDERS.find(provider => provider.id === "minimax")

    expect(minimaxProvider).toBeDefined()
    if (!minimaxProvider) {
      return
    }

    for (const model of minimaxProvider.models ?? []) {
      const expectedPricing =
        expectedMinimaxPricing[model.api_id as keyof typeof expectedMinimaxPricing]

      expect(expectedPricing).toBeDefined()
      expect(model.pricing).toEqual(expectedPricing)
      expect(model.pricing?.currency).toBe("CNY")
    }
  })
})
