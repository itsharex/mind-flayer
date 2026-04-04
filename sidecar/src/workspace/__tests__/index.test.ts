import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getWorkspaceStatus, loadWorkspacePromptContext, searchMemory } from ".."

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

  it("loads workspace prompt files in the expected order with MEMORY.md", async () => {
    await Promise.all([
      seedWorkspaceFile(appSupportDir, "AGENTS.md", "agents"),
      seedWorkspaceFile(appSupportDir, "SOUL.md", "soul"),
      seedWorkspaceFile(appSupportDir, "IDENTITY.md", "identity"),
      seedWorkspaceFile(appSupportDir, "USER.md", "user"),
      seedWorkspaceFile(appSupportDir, "BOOTSTRAP.md", "bootstrap"),
      seedWorkspaceFile(appSupportDir, "MEMORY.md", "canonical-memory")
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

  it("omits BOOTSTRAP.md when onboarding is complete", async () => {
    await Promise.all([
      seedWorkspaceFile(appSupportDir, "AGENTS.md", "agents"),
      seedWorkspaceFile(appSupportDir, "SOUL.md", "soul"),
      seedWorkspaceFile(appSupportDir, "IDENTITY.md", "identity"),
      seedWorkspaceFile(appSupportDir, "USER.md", "user"),
      seedWorkspaceFile(appSupportDir, "MEMORY.md", "canonical-memory"),
      seedWorkspaceFile(
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
      "MEMORY.md"
    ])
    expect(status).toMatchObject({
      needsBootstrap: false,
      setupCompletedAt: 200
    })
  })

  it("truncates oversized prompt files to fit the workspace prompt budget", async () => {
    await Promise.all([
      seedWorkspaceFile(appSupportDir, "AGENTS.md", "a".repeat(25_000)),
      seedWorkspaceFile(appSupportDir, "SOUL.md", "soul")
    ])

    const promptContext = await loadWorkspacePromptContext()
    const agentsFile = promptContext.files.find(file => file.path === "AGENTS.md")

    expect(agentsFile).toBeDefined()
    expect(agentsFile?.truncated).toBe(true)
    expect(agentsFile?.content).toContain("[Truncated to fit prompt budget]")
    expect(agentsFile?.content.length).toBeLessThanOrEqual(20_000)
  })

  it("ignores symlinked memory directories during memory search", async () => {
    if (process.platform === "win32") {
      return
    }

    const externalMemoryRoot = join(appSupportDir, "external-memory")
    await mkdir(externalMemoryRoot, { recursive: true })
    await writeFile(join(externalMemoryRoot, "2026-03-27.md"), "secret memory snippet", "utf8")
    await symlink(externalMemoryRoot, join(appSupportDir, "workspace", "memory"), "dir")

    const results = await searchMemory("secret")

    expect(results).toEqual([])
  })

  it("ignores non-daily markdown files under memory/ during memory search", async () => {
    await Promise.all([
      seedWorkspaceFile(appSupportDir, "MEMORY.md", "release plan"),
      seedWorkspaceFile(appSupportDir, "memory/notes.md", "release plan"),
      seedWorkspaceFile(appSupportDir, "memory/2026-03-27.md", "daily release plan")
    ])

    const results = await searchMemory("release")

    expect(results.some(result => result.path === "memory/notes.md")).toBe(false)
    expect(results.some(result => result.path === "memory/2026-03-27.md")).toBe(true)
    expect(results.some(result => result.path === "MEMORY.md")).toBe(true)
  })

  it("falls back to regex tokenization when Intl.Segmenter is unavailable", async () => {
    const originalSegmenter = Intl.Segmenter

    await seedWorkspaceFile(
      appSupportDir,
      "memory/2026-03-25.md",
      "今天在看租房，想找安静一点的房子。"
    )

    try {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        writable: true,
        value: undefined
      })

      const results = await searchMemory("租房 房子")

      expect(results).not.toHaveLength(0)
      expect(results[0]?.path).toBe("memory/2026-03-25.md")
    } finally {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        writable: true,
        value: originalSegmenter
      })
    }
  })
})
