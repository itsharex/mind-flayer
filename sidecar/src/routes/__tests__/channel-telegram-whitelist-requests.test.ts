import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import {
  handleTelegramWhitelistRequestDecision,
  handleTelegramWhitelistRequests
} from "../channel-telegram-whitelist-requests"

describe("Telegram whitelist routes", () => {
  it("returns whitelist requests", async () => {
    const app = new Hono()
    const telegramBotService = {
      listWhitelistRequests: vi.fn(() => [
        {
          requestId: "123",
          userId: "123",
          chatId: "123",
          requestedAt: 100,
          lastMessagePreview: "hello"
        }
      ])
    }

    app.get("/api/channels/telegram/whitelist-requests", c =>
      handleTelegramWhitelistRequests(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/whitelist-requests")
    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      requests: Array<{ requestId: string }>
    }

    expect(payload.success).toBe(true)
    expect(payload.requests[0]?.requestId).toBe("123")
  })

  it("returns 400 when decision payload is invalid", async () => {
    const app = new Hono()
    const telegramBotService = {
      decideWhitelistRequest: vi.fn()
    }

    app.post("/api/channels/telegram/whitelist-requests/decision", c =>
      handleTelegramWhitelistRequestDecision(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/whitelist-requests/decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requestId: "", decision: "approve" })
    })

    expect(res.status).toBe(400)
  })

  it("returns 404 when request does not exist", async () => {
    const app = new Hono()
    const telegramBotService = {
      decideWhitelistRequest: vi.fn(async () => null)
    }

    app.post("/api/channels/telegram/whitelist-requests/decision", c =>
      handleTelegramWhitelistRequestDecision(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/whitelist-requests/decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requestId: "123", decision: "approve" })
    })

    expect(res.status).toBe(404)
  })

  it("approves a whitelist request", async () => {
    const app = new Hono()
    const telegramBotService = {
      decideWhitelistRequest: vi.fn(async () => ({
        requestId: "123",
        userId: "123",
        chatId: "123",
        requestedAt: 100,
        lastMessagePreview: "hello"
      }))
    }

    app.post("/api/channels/telegram/whitelist-requests/decision", c =>
      handleTelegramWhitelistRequestDecision(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/whitelist-requests/decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requestId: "123", decision: "approve" })
    })

    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      request: { requestId: string }
    }

    expect(payload.success).toBe(true)
    expect(payload.request.requestId).toBe("123")
  })
})
