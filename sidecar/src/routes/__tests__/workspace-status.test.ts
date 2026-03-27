import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { handleWorkspaceStatus } from "../workspace-status"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"

async function seedWorkspaceFile(
  appSupportDir: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = join(appSupportDir, "workspace", relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, "utf8")
}

describe("workspace status route", () => {
  let previousAppSupportDir: string | undefined
  let appSupportDir = ""

  beforeEach(async () => {
    previousAppSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
    appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-workspace-route-test-"))
    process.env[APP_SUPPORT_DIR_ENV_KEY] = appSupportDir
  })

  afterEach(async () => {
    await rm(appSupportDir, { recursive: true, force: true })

    if (previousAppSupportDir === undefined) {
      delete process.env[APP_SUPPORT_DIR_ENV_KEY]
    } else {
      process.env[APP_SUPPORT_DIR_ENV_KEY] = previousAppSupportDir
    }
  })

  it("returns workspace status from the global prompt workspace", async () => {
    await seedWorkspaceFile(appSupportDir, "BOOTSTRAP.md", "bootstrap")
    await seedWorkspaceFile(
      appSupportDir,
      "state.json",
      JSON.stringify({
        version: 1,
        bootstrapSeededAt: 100,
        setupCompletedAt: null
      })
    )

    const app = new Hono()
    app.get("/api/workspace/status", handleWorkspaceStatus)

    const response = await app.request("/api/workspace/status")
    expect(response.status).toBe(200)

    const payload = (await response.json()) as {
      success: boolean
      workspaceDir: string
      needsBootstrap: boolean
      setupCompletedAt: number | null
    }

    expect(payload.success).toBe(true)
    expect(payload.workspaceDir).toBe(join(appSupportDir, "workspace"))
    expect(payload.needsBootstrap).toBe(true)
    expect(payload.setupCompletedAt).toBeNull()
  })
})
