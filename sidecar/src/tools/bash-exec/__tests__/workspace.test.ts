import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  cleanupSandbox,
  cleanupTransientSandboxes,
  ensureChatSandbox,
  getSandboxPath
} from "../sandbox"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"

describe("sandbox manager", () => {
  let previousAppSupportDir: string | undefined
  let testAppSupportDir = ""

  beforeEach(async () => {
    previousAppSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
    testAppSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-sandboxes-test-"))
    process.env[APP_SUPPORT_DIR_ENV_KEY] = testAppSupportDir
  })

  afterEach(async () => {
    await cleanupTransientSandboxes()
    await rm(testAppSupportDir, { recursive: true, force: true })

    if (previousAppSupportDir === undefined) {
      delete process.env[APP_SUPPORT_DIR_ENV_KEY]
      return
    }
    process.env[APP_SUPPORT_DIR_ENV_KEY] = previousAppSupportDir
  })

  it("should create a sandbox under the app support sandboxes directory", async () => {
    const chatId = "chat_abc-123"
    const sandboxPath = await ensureChatSandbox(chatId)

    expect(sandboxPath).toMatch(
      new RegExp(
        `${resolve(testAppSupportDir, "sandboxes").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d{8}-\\d{6}__${chatId}$`
      )
    )
    await expect(access(sandboxPath)).resolves.toBeUndefined()

    const readme = await readFile(join(sandboxPath, "README.md"), "utf-8")
    expect(readme).toContain("persistent sandbox directory")
  })

  it("should reject invalid chatId", async () => {
    await expect(ensureChatSandbox("../etc")).rejects.toThrow("Invalid chatId")
  })

  it("should cleanup only the target chat sandbox", async () => {
    const sandboxA = await ensureChatSandbox("chat-one")
    const sandboxB = await ensureChatSandbox("chat-two")

    await cleanupSandbox("chat-one")

    await expect(access(sandboxA)).rejects.toThrow()
    await expect(access(sandboxB)).resolves.toBeUndefined()
  })

  it("should cleanup both legacy and timestamped sandbox names for the same chat", async () => {
    const legacySandbox = resolve(testAppSupportDir, "workspaces", "legacy-chat")
    const timestampedSandbox = resolve(
      testAppSupportDir,
      "workspaces",
      "20260101-010101__legacy-chat"
    )
    await mkdir(legacySandbox, { recursive: true })
    await mkdir(timestampedSandbox, { recursive: true })

    await cleanupSandbox("legacy-chat")

    await expect(access(legacySandbox)).rejects.toThrow()
    await expect(access(timestampedSandbox)).rejects.toThrow()
  })

  it("should cleanup transient sandboxes only", async () => {
    const transientSandbox = await ensureChatSandbox("")
    const persistentSandbox = await ensureChatSandbox("chat-stable")

    expect(transientSandbox).toContain(`${resolve(testAppSupportDir, "sandboxes")}/temp-`)

    await cleanupTransientSandboxes()

    await expect(access(transientSandbox)).rejects.toThrow()
    await expect(access(persistentSandbox)).resolves.toBeUndefined()
  })

  it("should resolve sandbox paths with legacy fallback without creating them", async () => {
    const expectedFallbackPath = resolve(testAppSupportDir, "sandboxes", "chat-path")
    expect(getSandboxPath("chat-path")).toBe(expectedFallbackPath)

    const createdPath = await ensureChatSandbox("chat-path")
    expect(getSandboxPath("chat-path")).toBe(createdPath)

    expect(() => getSandboxPath("../unsafe")).toThrow("Invalid chatId")
  })

  it("should prefer an existing legacy workspace directory for compatibility", async () => {
    const legacySandbox = resolve(testAppSupportDir, "workspaces", "legacy-chat")
    await mkdir(legacySandbox, { recursive: true })

    const resolvedPath = await ensureChatSandbox("legacy-chat")

    expect(resolvedPath).toBe(legacySandbox)
    expect(getSandboxPath("legacy-chat")).toBe(legacySandbox)
  })

  it("should require app support directory environment variable", async () => {
    const originalValue = process.env[APP_SUPPORT_DIR_ENV_KEY]
    delete process.env[APP_SUPPORT_DIR_ENV_KEY]

    try {
      expect(() => getSandboxPath("chat-path")).toThrow(
        `Environment variable '${APP_SUPPORT_DIR_ENV_KEY}' is required`
      )
      await expect(ensureChatSandbox("chat-path")).rejects.toThrow(
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
