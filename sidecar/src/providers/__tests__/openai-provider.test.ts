import { beforeEach, describe, expect, it, vi } from "vitest"
import { MODEL_PROVIDERS } from "../../config/constants"
import type { ProviderConfig } from "../../type"
import { OpenAIProvider } from "../openai-provider"

const { createOpenAIMock, openAIModelFactoryMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
  openAIModelFactoryMock: vi.fn()
}))

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock
}))

describe("OpenAIProvider", () => {
  beforeEach(() => {
    createOpenAIMock.mockReset()
    openAIModelFactoryMock.mockReset()

    createOpenAIMock.mockReturnValue(openAIModelFactoryMock)
    openAIModelFactoryMock.mockImplementation((modelId: string) => ({
      provider: "openai",
      modelId
    }))
  })

  it("should have correct name", () => {
    const provider = new OpenAIProvider()
    expect(provider.name).toBe("openai")
  })

  describe("createModel", () => {
    it("passes the API key and selected model ID to createOpenAI", () => {
      const provider = new OpenAIProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }
      const modelId = "gpt-5.4"

      const model = provider.createModel(modelId, config)

      expect(createOpenAIMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: MODEL_PROVIDERS.openai.defaultBaseUrl
      })
      expect(openAIModelFactoryMock).toHaveBeenCalledWith(modelId)
      expect(model).toEqual({
        provider: "openai",
        modelId
      })
    })

    it("uses a custom base URL when provided", () => {
      const provider = new OpenAIProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://custom.api.com/v1"
      }
      const modelId = "gpt-5.4-pro"

      provider.createModel(modelId, config)

      expect(createOpenAIMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      expect(openAIModelFactoryMock).toHaveBeenCalledWith(modelId)
    })

    it("falls back to the default base URL when one is not provided", () => {
      const provider = new OpenAIProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }
      const modelId = "gpt-5.3-chat-latest"

      provider.createModel(modelId, config)

      expect(createOpenAIMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: MODEL_PROVIDERS.openai.defaultBaseUrl
      })
      expect(openAIModelFactoryMock).toHaveBeenCalledWith(modelId)
    })
  })
})
