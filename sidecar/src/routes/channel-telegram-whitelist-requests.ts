import type { Context } from "hono"
import { z } from "zod"
import type { TelegramBotService } from "../services/telegram-bot-service"
import { BadRequestError, mapErrorToResponse } from "../utils/http-errors"

const whitelistDecisionSchema = z.object({
  requestId: z.string().trim().min(1),
  decision: z.union([z.literal("approve"), z.literal("reject")])
})

export async function handleTelegramWhitelistRequests(
  c: Context,
  telegramBotService: TelegramBotService
) {
  try {
    const requests = telegramBotService.listWhitelistRequests()
    return c.json({
      success: true,
      requests
    })
  } catch (error) {
    console.error("[sidecar] Telegram whitelist requests error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export async function handleTelegramWhitelistRequestDecision(
  c: Context,
  telegramBotService: TelegramBotService
) {
  try {
    const body = await c.req.json()
    const parseResult = whitelistDecisionSchema.safeParse(body)
    if (!parseResult.success) {
      throw new BadRequestError("Invalid whitelist decision payload")
    }

    const decided = await telegramBotService.decideWhitelistRequest(
      parseResult.data.requestId,
      parseResult.data.decision
    )

    if (!decided) {
      return c.json({ error: "Whitelist request not found", code: "NOT_FOUND" }, 404)
    }

    return c.json({
      success: true,
      request: decided
    })
  } catch (error) {
    console.error("[sidecar] Telegram whitelist decision error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
