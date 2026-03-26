import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getWorkspaceStatus, loadWorkspacePromptContext } from ".."

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"

async function writeWorkspaceFile(
  appSupportDir: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = join(appSupportDir, "workspace", relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, "utf8")
}

describe("workspace helpers", () => {
  let previousAppSupportDir: string | undefined
  let appSupportDir = ""

  beforeEach(async () => {
    previousAppSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
    appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-workspace-test-"))
    process.env[APP_SUPPORT_DIR_ENV_KEY] = appSupportDir
    await mkdir(join(appSupportDir, "workspace"), { recursive: true })
  })

  afterEach(async () => {
    await rm(appSupportDir, { recursive: true, force: true })

    if (previousAppSupportDir === undefined) {
      delete process.env[APP_SUPPORT_DIR_ENV_KEY]
    } else {
      process.env[APP_SUPPORT_DIR_ENV_KEY] = previousAppSupportDir
    }
  })

  it("loads workspace prompt files in the expected order and prefers MEMORY.md", async () => {
    await Promise.all([
      writeWorkspaceFile(appSupportDir, "AGENTS.md", "agents"),
      writeWorkspaceFile(appSupportDir, "SOUL.md", "soul"),
      writeWorkspaceFile(appSupportDir, "IDENTITY.md", "identity"),
      writeWorkspaceFile(appSupportDir, "USER.md", "user"),
      writeWorkspaceFile(appSupportDir, "BOOTSTRAP.md", "bootstrap"),
      writeWorkspaceFile(appSupportDir, "MEMORY.md", "canonical-memory")
    ])

    const promptContext = await loadWorkspacePromptContext()

    expect(promptContext.needsBootstrap).toBe(true)
    expect(promptContext.files.map(file => file.path)).toEqual([
      "AGENTS.md",
      "SOUL.md",
      "IDENTITY.md",
      "USER.md",
      "BOOTSTRAP.md",
      "MEMORY.md"
    ])
    expect(promptContext.files.at(-1)?.content).toContain("canonical-memory")
  })

  it("falls back to memory.md and omits BOOTSTRAP.md when onboarding is complete", async () => {
    await Promise.all([
      writeWorkspaceFile(appSupportDir, "AGENTS.md", "agents"),
      writeWorkspaceFile(appSupportDir, "SOUL.md", "soul"),
      writeWorkspaceFile(appSupportDir, "IDENTITY.md", "identity"),
      writeWorkspaceFile(appSupportDir, "USER.md", "user"),
      writeWorkspaceFile(appSupportDir, "memory.md", "legacy-memory"),
      writeWorkspaceFile(
        appSupportDir,
        "state.json",
        JSON.stringify({
          version: 1,
          bootstrapSeededAt: 100,
          setupCompletedAt: 200
        })
      )
    ])

    const promptContext = await loadWorkspacePromptContext()
    const status = await getWorkspaceStatus()

    expect(promptContext.needsBootstrap).toBe(false)
    expect(promptContext.files.map(file => file.path)).toEqual([
      "AGENTS.md",
      "SOUL.md",
      "IDENTITY.md",
      "USER.md",
      "memory.md"
    ])
    expect(status).toMatchObject({
      needsBootstrap: false,
      setupCompletedAt: 200
    })
  })

  it("truncates oversized prompt files to fit the workspace prompt budget", async () => {
    await Promise.all([
      writeWorkspaceFile(appSupportDir, "AGENTS.md", "a".repeat(25_000)),
      writeWorkspaceFile(appSupportDir, "SOUL.md", "soul")
    ])

    const promptContext = await loadWorkspacePromptContext()
    const agentsFile = promptContext.files.find(file => file.path === "AGENTS.md")

    expect(agentsFile).toBeDefined()
    expect(agentsFile?.truncated).toBe(true)
    expect(agentsFile?.content).toContain("[Truncated to fit prompt budget]")
    expect(agentsFile?.content.length).toBeLessThanOrEqual(20_000)
  })
})
