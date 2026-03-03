import { beforeEach, describe, expect, it, vi } from "vitest"

const streamTextMock = vi.fn()
const processMessagesMock = vi.fn()
const buildSystemPromptMock = vi.fn()
const buildToolChoiceMock = vi.fn()

vi.mock("ai", () => ({
  stepCountIs: vi.fn((value: number) => value),
  streamText: (...args: unknown[]) => streamTextMock(...args)
}))

vi.mock("../../utils/message-processor", () => ({
  processMessages: (...args: unknown[]) => processMessagesMock(...args)
}))

vi.mock("../../utils/system-prompt-builder", () => ({
  buildSystemPrompt: (...args: unknown[]) => buildSystemPromptMock(...args)
}))

vi.mock("../../utils/tool-choice", () => ({
  buildToolChoice: (...args: unknown[]) => buildToolChoiceMock(...args)
}))

import { ChannelRuntimeConfigService } from "../channel-runtime-config-service"
import { TelegramBotService } from "../telegram-bot-service"

function createTextStream(text: string): AsyncIterable<string> {
  return (async function* () {
    yield text
  })()
}

const telegramApiSuccess = (result: unknown = { message_id: 1 }) =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        ok: true,
        result
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  )

describe("TelegramBotService", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    processMessagesMock.mockImplementation(async (messages: unknown) => messages)
    buildSystemPromptMock.mockReturnValue("system prompt")
    buildToolChoiceMock.mockReturnValue("auto")
  })

  it("queues whitelist request from callback and supports decision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => telegramApiSuccess(true))
    )

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: []
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleCallbackQuery: (
          botToken: string,
          apiBaseUrl: string,
          callback: unknown
        ) => Promise<void>
      }
    ).handleCallbackQuery("token", "https://api.telegram.org", {
      id: "callback-1",
      data: "mf_join_request_v1",
      from: {
        id: 42,
        is_bot: false,
        username: "tester",
        first_name: "Test"
      },
      message: {
        message_id: 1,
        chat: {
          id: 42,
          type: "private"
        },
        text: "please approve"
      }
    })

    const requests = service.listWhitelistRequests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.requestId).toBe("42")

    const decided = await service.decideWhitelistRequest("42", "approve")
    expect(decided?.requestId).toBe("42")
    expect(service.listWhitelistRequests()).toHaveLength(0)
  })

  it("sends whitelist join button for unauthorized private message", async () => {
    const fetchMock = vi.fn(() => telegramApiSuccess(true))
    vi.stubGlobal("fetch", fetchMock)

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn(() => ({ apiKey: "tg-token", baseUrl: "https://api.telegram.org" }))
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: []
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 100,
      chat: {
        id: 99,
        type: "private"
      },
      from: {
        id: 99,
        is_bot: false
      },
      text: "hello"
    })

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, { body?: string } | undefined]
    const firstCallBody = JSON.parse(String(firstCall?.[1]?.body)) as {
      reply_markup?: { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
    }

    expect(firstCallBody.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(
      "mf_join_request_v1"
    )
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it("processes whitelisted messages and stores session history", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 7 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["1001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 100,
      chat: {
        id: 1001,
        type: "private"
      },
      from: {
        id: 1001,
        is_bot: false
      },
      text: "hello"
    })

    const sessions = service.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.sessionKey).toBe("telegram:1001")

    const storedMessages = service.getSessionMessages("telegram:1001")
    expect(storedMessages).toHaveLength(2)
    expect(storedMessages?.[1]?.role).toBe("assistant")

    // sendMessageDraft failed once (404) then fallback to final sendMessage only
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/sendMessageDraft"))).toBe(
      true
    )
  })

  it("sends draft_id when calling sendMessageDraft", async () => {
    const fetchMock = vi.fn((url: string, _options?: { body?: unknown }) => {
      if (url.includes("/sendMessageDraft")) {
        return telegramApiSuccess(true)
      }
      return telegramApiSuccess({ message_id: 9 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Draft body")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["2001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 110,
      chat: {
        id: 2001,
        type: "private"
      },
      from: {
        id: 2001,
        is_bot: false
      },
      text: "hello"
    })

    const draftCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/sendMessageDraft")
    )
    expect(draftCall).toBeDefined()

    const secondArg = draftCall?.[1]
    const body =
      secondArg && typeof secondArg === "object" && secondArg.body instanceof URLSearchParams
        ? secondArg.body
        : null

    expect(body?.get("chat_id")).toBe("2001")
    expect(Number(body?.get("draft_id")) > 0).toBe(true)
    expect(body?.get("text")).toBe("Draft body")
  })
})
