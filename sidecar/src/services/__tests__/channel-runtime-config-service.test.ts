import { describe, expect, it } from "vitest"
import { ChannelRuntimeConfigService } from "../channel-runtime-config-service"

describe("ChannelRuntimeConfigService", () => {
  it("normalizes explicit disabled skills and preserves them when later updates omit the field", () => {
    const service = new ChannelRuntimeConfigService()

    service.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["1001", " 1001 ", "1002"]
        }
      },
      disabledSkills: [" user:writer ", "bundled:reader", "user:writer", ""]
    })

    expect(service.getConfig()).toMatchObject({
      channels: {
        telegram: {
          allowedUserIds: ["1001", "1002"]
        }
      },
      disabledSkills: ["user:writer", "bundled:reader"]
    })

    service.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-b",
        modelLabel: "MiniMax-M2.1"
      },
      channels: {
        telegram: {
          enabled: false,
          allowedUserIds: ["2001"]
        }
      }
    })

    expect(service.getConfig()).toMatchObject({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-b",
        modelLabel: "MiniMax-M2.1"
      },
      channels: {
        telegram: {
          enabled: false,
          allowedUserIds: ["2001"]
        }
      },
      disabledSkills: ["user:writer", "bundled:reader"]
    })
  })
})
