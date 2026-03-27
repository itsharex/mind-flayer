import type { Context } from "hono"
import { mapErrorToResponse } from "../utils/http-errors"
import { getWorkspaceStatus } from "../workspace"

export async function handleWorkspaceStatus(c: Context) {
  try {
    const status = await getWorkspaceStatus()

    return c.json({
      success: true,
      ...status
    })
  } catch (error) {
    console.error("[sidecar] Workspace status error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
