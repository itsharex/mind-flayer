import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

import { TelegramBotService } from "../telegram-bot-service"

function createTextStream(text: string): AsyncIterable<string> {
  return (async function* () {
    yield text
  })()
}

describe("TelegramBotService local image handling", () => {
  beforeEach(() => {
    streamTextMock.mockReset()
    processMessagesMock.mockReset()
    buildSystemPromptMock.mockReset()
    buildToolChoiceMock.mockReset()

    processMessagesMock.mockImplementation(async (messages: unknown) => messages)
    buildSystemPromptMock.mockReturnValue("system prompt")
    buildToolChoiceMock.mockReturnValue("auto")
  })

  it("streams text, edits sanitized message, uploads local image, and stores sanitized history", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-service-test-"))
    const imagePath = join(tempDir, "screen.png")
    await writeFile(
      imagePath,
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00])
    )

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({}))
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }
    const channelRuntimeConfigService = {
      getSelectedModel: vi.fn(() => ({ provider: "minimax", modelId: "abab6.5s-chat" }))
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      channelRuntimeConfigService as never
    )

    const editMock = vi.fn(async () => ({}))
    const postMock = vi.fn(async (payload: unknown) => {
      if (payload && typeof payload === "object" && Symbol.asyncIterator in payload) {
        for await (const _chunk of payload as AsyncIterable<string>) {
          // consume stream chunks to simulate adapter streaming
        }
        return { edit: editMock }
      }

      return { edit: vi.fn(async () => ({})) }
    })

    streamTextMock.mockReturnValue({
      textStream: createTextStream(`Done.\n![shot](file://${imagePath})`)
    })

    const thread = {
      id: "chat-1",
      post: postMock,
      subscribe: vi.fn(async () => {})
    }

    await (
      service as unknown as {
        handleIncomingMessage: (thread: unknown, message: unknown) => Promise<void>
      }
    ).handleIncomingMessage(thread, {
      text: "show screenshot",
      author: { isMe: false }
    })

    expect(postMock).toHaveBeenCalledTimes(2)
    expect(postMock.mock.calls[0]?.[0]).toBeTruthy()
    expect(
      postMock.mock.calls[0]?.[0] &&
        typeof postMock.mock.calls[0]?.[0] === "object" &&
        Symbol.asyncIterator in (postMock.mock.calls[0]?.[0] as object)
    ).toBe(true)

    const uploadPayload = postMock.mock.calls[1]?.[0] as {
      markdown?: string
      files?: Array<{ filename?: string }>
    }
    expect(uploadPayload.markdown).toBe("shot")
    expect(uploadPayload.files).toHaveLength(1)
    expect(uploadPayload.files?.[0]?.filename).toBe("screen.png")

    expect(editMock).toHaveBeenCalledWith("Done.\n[image: shot]")
    const uploadCallOrder = postMock.mock.invocationCallOrder[1] ?? 0
    const editCallOrder = editMock.mock.invocationCallOrder[0] ?? 0
    expect(editCallOrder).toBeGreaterThan(0)
    expect(editCallOrder).toBeLessThan(uploadCallOrder)

    const sessionMessages = (
      service as unknown as {
        sessionMessages: Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>
      }
    ).sessionMessages
    const storedMessages = sessionMessages.get("telegram:chat-1")
    expect(storedMessages).toHaveLength(2)
    expect(storedMessages?.[1]?.role).toBe("assistant")
    expect(storedMessages?.[1]?.parts[0]?.text).toBe("Done.\n[image: shot]")

    await rm(tempDir, { recursive: true, force: true })
  })

  it("does not fail the whole response when image upload fails", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-service-test-"))
    const imagePath = join(tempDir, "upload-fail.png")
    await writeFile(
      imagePath,
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00])
    )

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({}))
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }
    const channelRuntimeConfigService = {
      getSelectedModel: vi.fn(() => ({ provider: "minimax", modelId: "abab6.5s-chat" }))
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      channelRuntimeConfigService as never
    )

    const editMock = vi.fn(async () => ({}))
    const postMock = vi.fn(async (payload: unknown) => {
      if (payload && typeof payload === "object" && Symbol.asyncIterator in payload) {
        for await (const _chunk of payload as AsyncIterable<string>) {
          // consume stream chunks
        }
        return { edit: editMock }
      }

      throw new Error("upload failed")
    })

    streamTextMock.mockReturnValue({
      textStream: createTextStream(`Try this:\n![fail](file://${imagePath})`)
    })

    const thread = {
      id: "chat-2",
      post: postMock,
      subscribe: vi.fn(async () => {})
    }

    await expect(
      (
        service as unknown as {
          handleIncomingMessage: (thread: unknown, message: unknown) => Promise<void>
        }
      ).handleIncomingMessage(thread, {
        text: "show screenshot",
        author: { isMe: false }
      })
    ).resolves.toBeUndefined()

    const sessionMessages = (
      service as unknown as {
        sessionMessages: Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>
      }
    ).sessionMessages
    const storedMessages = sessionMessages.get("telegram:chat-2")
    expect(storedMessages).toHaveLength(2)
    expect(storedMessages?.[1]?.parts[0]?.text).toBe("Try this:\n[image: fail]")

    await rm(tempDir, { recursive: true, force: true })
  })

  it("exposes session summaries and cloned session messages for debug routes", async () => {
    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({}))
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }
    const channelRuntimeConfigService = {
      getSelectedModel: vi.fn(() => ({ provider: "minimax", modelId: "abab6.5s-chat" }))
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      channelRuntimeConfigService as never
    )

    const postMock = vi.fn(async (payload: unknown) => {
      if (payload && typeof payload === "object" && Symbol.asyncIterator in payload) {
        for await (const _chunk of payload as AsyncIterable<string>) {
          // consume stream chunks
        }
      }
      return { edit: vi.fn(async () => ({})) }
    })

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })

    const thread = {
      id: "chat-3",
      post: postMock,
      subscribe: vi.fn(async () => {})
    }

    await (
      service as unknown as {
        handleIncomingMessage: (thread: unknown, message: unknown) => Promise<void>
      }
    ).handleIncomingMessage(thread, {
      text: "Hello",
      author: { isMe: false }
    })

    const sessions = service.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.sessionKey).toBe("telegram:chat-3")
    expect(sessions[0]?.threadId).toBe("chat-3")
    expect(sessions[0]?.messageCount).toBe(2)
    expect(sessions[0]?.lastMessageRole).toBe("assistant")
    expect(sessions[0]?.lastMessagePreview).toBe("Assistant reply")
    expect((sessions[0]?.updatedAt ?? 0) > 0).toBe(true)

    const firstRead = service.getSessionMessages("telegram:chat-3")
    expect(firstRead).toHaveLength(2)
    expect(firstRead?.[0]?.role).toBe("user")

    if (!firstRead) {
      throw new Error("Expected firstRead to be non-null")
    }

    const firstMessage = firstRead[0]
    if (!firstMessage) {
      throw new Error("Expected first message to exist")
    }

    firstRead[0] = {
      ...firstMessage,
      id: "mutated-id"
    }

    const secondRead = service.getSessionMessages("telegram:chat-3")
    expect(secondRead?.[0]?.id).not.toBe("mutated-id")
    expect(service.getSessionMessages("telegram:missing")).toBeNull()
  })
})
