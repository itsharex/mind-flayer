import type { UIMessage } from "ai"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import {
  handleTelegramChannelSessionMessages,
  handleTelegramChannelSessions
} from "../channel-telegram-sessions"

const createTextMessage = (id: string, role: "user" | "assistant", text: string): UIMessage =>
  ({
    id,
    role,
    parts: [{ type: "text", text }]
  }) as UIMessage

describe("Telegram channel session routes", () => {
  it("returns sessions from TelegramBotService", async () => {
    const app = new Hono()
    const telegramBotService = {
      listSessions: vi.fn(() => [
        {
          sessionKey: "telegram:thread-2",
          threadId: "thread-2",
          updatedAt: 200,
          messageCount: 3,
          lastMessageRole: "assistant",
          lastMessagePreview: "latest"
        },
        {
          sessionKey: "telegram:thread-1",
          threadId: "thread-1",
          updatedAt: 100,
          messageCount: 2,
          lastMessageRole: "user",
          lastMessagePreview: "hello"
        }
      ])
    }

    app.get("/api/channels/telegram/sessions", c =>
      handleTelegramChannelSessions(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/sessions")
    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      sessions: Array<{ sessionKey: string; updatedAt: number }>
    }

    expect(payload.success).toBe(true)
    expect(payload.sessions).toHaveLength(2)
    expect(payload.sessions[0]?.sessionKey).toBe("telegram:thread-2")
    expect(payload.sessions[0]?.updatedAt).toBe(200)
  })

  it("returns 400 when sessionKey query is missing", async () => {
    const app = new Hono()
    const telegramBotService = {
      getSessionMessages: vi.fn()
    }

    app.get("/api/channels/telegram/session-messages", c =>
      handleTelegramChannelSessionMessages(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/session-messages")
    expect(res.status).toBe(400)

    const payload = (await res.json()) as { error: string; code: string }
    expect(payload.code).toBe("BAD_REQUEST")
  })

  it("returns 404 when session does not exist", async () => {
    const app = new Hono()
    const telegramBotService = {
      getSessionMessages: vi.fn(() => null)
    }

    app.get("/api/channels/telegram/session-messages", c =>
      handleTelegramChannelSessionMessages(c, telegramBotService as never)
    )

    const res = await app.request(
      "/api/channels/telegram/session-messages?sessionKey=telegram%3Amissing"
    )
    expect(res.status).toBe(404)

    const payload = (await res.json()) as { error: string; code: string }
    expect(payload.code).toBe("NOT_FOUND")
  })

  it("returns messages for an existing session", async () => {
    const app = new Hono()
    const messages = [
      createTextMessage("u1", "user", "hello"),
      createTextMessage("a1", "assistant", "world")
    ]
    const telegramBotService = {
      getSessionMessages: vi.fn(() => messages)
    }

    app.get("/api/channels/telegram/session-messages", c =>
      handleTelegramChannelSessionMessages(c, telegramBotService as never)
    )

    const res = await app.request(
      "/api/channels/telegram/session-messages?sessionKey=telegram%3Athread-1"
    )
    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      sessionKey: string
      messages: UIMessage[]
    }

    expect(payload.success).toBe(true)
    expect(payload.sessionKey).toBe("telegram:thread-1")
    expect(payload.messages).toHaveLength(2)
    expect(payload.messages[1]?.role).toBe("assistant")
  })
})
