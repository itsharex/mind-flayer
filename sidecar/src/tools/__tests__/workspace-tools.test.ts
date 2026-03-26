import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { memoryGetTool } from "../memory-get"
import { memorySearchTool } from "../memory-search"
import { writeWorkspaceFileTool } from "../write-workspace-file"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"

type WriteWorkspaceFileExecute = NonNullable<ReturnType<typeof writeWorkspaceFileTool>["execute"]>
type MemorySearchExecute = NonNullable<ReturnType<typeof memorySearchTool>["execute"]>
type MemoryGetExecute = NonNullable<ReturnType<typeof memoryGetTool>["execute"]>

async function seedWorkspaceFile(
  appSupportDir: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = join(appSupportDir, "workspace", relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, "utf8")
}

describe("workspace tools", () => {
  let previousAppSupportDir: string | undefined
  let appSupportDir = ""

  beforeEach(async () => {
    previousAppSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
    appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-workspace-tools-test-"))
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

  it("writes approved workspace files and marks bootstrap complete when BOOTSTRAP.md is deleted", async () => {
    const execute = writeWorkspaceFileTool().execute as WriteWorkspaceFileExecute

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

    await execute(
      {
        path: "USER.md",
        operation: "write",
        content: "name: didi"
      },
      {} as never
    )
    await execute(
      {
        path: "BOOTSTRAP.md",
        operation: "delete"
      },
      {} as never
    )

    expect(await readFile(join(appSupportDir, "workspace", "USER.md"), "utf8")).toBe("name: didi")
    await expect(
      readFile(join(appSupportDir, "workspace", "BOOTSTRAP.md"), "utf8")
    ).rejects.toBeDefined()

    const state = JSON.parse(
      await readFile(join(appSupportDir, "workspace", "state.json"), "utf8")
    ) as {
      setupCompletedAt: number | null
    }
    expect(typeof state.setupCompletedAt).toBe("number")
  })

  it("rejects writes outside the approved workspace file set", async () => {
    const execute = writeWorkspaceFileTool().execute as WriteWorkspaceFileExecute

    await expect(
      execute(
        {
          path: "../channels/telegram-sessions.json",
          operation: "write",
          content: "nope"
        },
        {} as never
      )
    ).rejects.toThrow("outside the agent workspace")
  })

  it("searches MEMORY.md and daily memory files with simple text matching", async () => {
    const execute = memorySearchTool().execute as MemorySearchExecute

    await seedWorkspaceFile(
      appSupportDir,
      "MEMORY.md",
      "Timezone: Asia/Shanghai\nPreferred language: Chinese\n"
    )
    await seedWorkspaceFile(
      appSupportDir,
      "memory/2026-03-26.md",
      "今天确认：用户希望默认使用中文。"
    )

    const englishResults = (await execute(
      {
        query: "timezone",
        maxResults: 5
      },
      {} as never
    )) as {
      totalResults: number
      results: Array<{ path: string; snippet: string }>
    }
    const chineseResults = (await execute(
      {
        query: "中文",
        maxResults: 5
      },
      {} as never
    )) as {
      totalResults: number
      results: Array<{ path: string; snippet: string }>
    }

    expect(englishResults.totalResults).toBeGreaterThan(0)
    expect(englishResults.results[0]?.path).toBe("MEMORY.md")
    expect(chineseResults.totalResults).toBeGreaterThan(0)
    expect(chineseResults.results.some(result => result.path === "memory/2026-03-26.md")).toBe(true)
  })

  it("returns empty content when a memory file does not exist", async () => {
    const execute = memoryGetTool().execute as MemoryGetExecute

    const result = (await execute(
      {
        path: "memory/2026-03-26.md"
      },
      {} as never
    )) as {
      exists: boolean
      content: string
    }

    expect(result.exists).toBe(false)
    expect(result.content).toBe("")
  })
})
