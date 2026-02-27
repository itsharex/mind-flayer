import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  cleanupTransientWorkspaces,
  cleanupWorkspace,
  ensureChatWorkspace,
  getWorkspacePath
} from "../workspace"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"

describe("workspace manager", () => {
  let previousAppSupportDir: string | undefined
  let testAppSupportDir = ""

  beforeEach(async () => {
    previousAppSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
    testAppSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-workspaces-test-"))
    process.env[APP_SUPPORT_DIR_ENV_KEY] = testAppSupportDir
  })

  afterEach(async () => {
    await cleanupTransientWorkspaces()
    await rm(testAppSupportDir, { recursive: true, force: true })

    if (previousAppSupportDir === undefined) {
      delete process.env[APP_SUPPORT_DIR_ENV_KEY]
      return
    }
    process.env[APP_SUPPORT_DIR_ENV_KEY] = previousAppSupportDir
  })

  it("should create workspace under app support workspaces directory", async () => {
    const chatId = "chat_abc-123"
    const workspacePath = await ensureChatWorkspace(chatId)

    expect(workspacePath).toMatch(
      new RegExp(
        `${resolve(testAppSupportDir, "workspaces").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d{8}-\\d{6}__${chatId}$`
      )
    )
    await expect(access(workspacePath)).resolves.toBeUndefined()

    const readme = await readFile(join(workspacePath, "README.md"), "utf-8")
    expect(readme).toContain("persistent session workspace")
  })

  it("should reject invalid chatId", async () => {
    await expect(ensureChatWorkspace("../etc")).rejects.toThrow("Invalid chatId")
  })

  it("should cleanup only target chat workspace", async () => {
    const workspaceA = await ensureChatWorkspace("chat-one")
    const workspaceB = await ensureChatWorkspace("chat-two")

    await cleanupWorkspace("chat-one")

    await expect(access(workspaceA)).rejects.toThrow()
    await expect(access(workspaceB)).resolves.toBeUndefined()
  })

  it("should cleanup both legacy and timestamped workspace names for same chat", async () => {
    const legacyWorkspace = resolve(testAppSupportDir, "workspaces", "legacy-chat")
    const timestampedWorkspace = resolve(
      testAppSupportDir,
      "workspaces",
      "20260101-010101__legacy-chat"
    )
    await mkdir(legacyWorkspace, { recursive: true })
    await mkdir(timestampedWorkspace, { recursive: true })

    await cleanupWorkspace("legacy-chat")

    await expect(access(legacyWorkspace)).rejects.toThrow()
    await expect(access(timestampedWorkspace)).rejects.toThrow()
  })

  it("should cleanup transient workspaces only", async () => {
    const transientWorkspace = await ensureChatWorkspace("")
    const persistentWorkspace = await ensureChatWorkspace("chat-stable")

    expect(transientWorkspace).toContain(`${resolve(testAppSupportDir, "workspaces")}/temp-`)

    await cleanupTransientWorkspaces()

    await expect(access(transientWorkspace)).rejects.toThrow()
    await expect(access(persistentWorkspace)).resolves.toBeUndefined()
  })

  it("should resolve workspace path without creating it", async () => {
    const expectedFallbackPath = resolve(testAppSupportDir, "workspaces", "chat-path")
    expect(getWorkspacePath("chat-path")).toBe(expectedFallbackPath)

    const createdPath = await ensureChatWorkspace("chat-path")
    expect(getWorkspacePath("chat-path")).toBe(createdPath)

    expect(() => getWorkspacePath("../unsafe")).toThrow("Invalid chatId")
  })

  it("should require app support directory environment variable", async () => {
    const originalValue = process.env[APP_SUPPORT_DIR_ENV_KEY]
    delete process.env[APP_SUPPORT_DIR_ENV_KEY]

    try {
      expect(() => getWorkspacePath("chat-path")).toThrow(
        `Environment variable '${APP_SUPPORT_DIR_ENV_KEY}' is required`
      )
      await expect(ensureChatWorkspace("chat-path")).rejects.toThrow(
        `Environment variable '${APP_SUPPORT_DIR_ENV_KEY}' is required`
      )
    } finally {
      if (originalValue === undefined) {
        delete process.env[APP_SUPPORT_DIR_ENV_KEY]
      } else {
        process.env[APP_SUPPORT_DIR_ENV_KEY] = originalValue
      }
    }
  })
})
