import type { Context } from "hono"
import { cleanupSandbox } from "../tools/bash-exec/sandbox"
import { BadRequestError, mapErrorToResponse } from "../utils/http-errors"

/**
 * Cleanup sandbox endpoint handler.
 * Deletes the bash execution sandbox directory for a specific chat.
 */
export async function handleCleanupSandbox(c: Context) {
  try {
    const body = await c.req.json()
    const chatId = body?.chatId

    // Validate request
    if (!chatId || typeof chatId !== "string") {
      throw new BadRequestError("chatId is required")
    }

    console.log(`[sidecar] Cleaning up sandbox for chat: ${chatId}`)

    // Cleanup sandbox
    await cleanupSandbox(chatId)

    return c.json({
      success: true,
      message: `Sandbox for chat ${chatId} cleaned up successfully`
    })
  } catch (error) {
    console.error("[sidecar] Cleanup error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export const handleCleanupWorkspace = handleCleanupSandbox
