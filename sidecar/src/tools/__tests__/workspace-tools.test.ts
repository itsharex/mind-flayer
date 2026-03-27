import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendDailyMemoryTool } from "../append-daily-memory"
import { appendWorkspaceSectionTool } from "../append-workspace-section"
import { deleteWorkspaceFileTool } from "../delete-workspace-file"
import { memoryGetTool } from "../memory-get"
import { memorySearchTool } from "../memory-search"
import { replaceWorkspaceSectionTool } from "../replace-workspace-section"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"

type AppendWorkspaceSectionExecute = NonNullable<
  ReturnType<typeof appendWorkspaceSectionTool>["execute"]
>
type ReplaceWorkspaceSectionExecute = NonNullable<
  ReturnType<typeof replaceWorkspaceSectionTool>["execute"]
>
type AppendDailyMemoryExecute = NonNullable<ReturnType<typeof appendDailyMemoryTool>["execute"]>
type DeleteWorkspaceFileExecute = NonNullable<ReturnType<typeof deleteWorkspaceFileTool>["execute"]>
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

  it("creates USER.md from the managed template and appends to an existing canonical section", async () => {
    const execute = appendWorkspaceSectionTool().execute as AppendWorkspaceSectionExecute

    const result = await execute(
      {
        path: "USER.md",
        sectionTitle: "Identity",
        content: "- Name: USERNAME\n- Timezone: Asia/Shanghai"
      },
      {} as never
    )

    expect(result).toEqual({
      path: "USER.md",
      sectionTitle: "Identity",
      bytesWritten: Buffer.byteLength("- Name: USERNAME\n- Timezone: Asia/Shanghai", "utf8"),
      createdFile: true,
      createdSection: false
    })

    const userContent = await readFile(join(appSupportDir, "workspace", "USER.md"), "utf8")
    expect(userContent).toContain("# USER.md - About Your Human")
    expect(userContent).toContain(
      [
        "## Identity",
        "",
        "- **Name:**",
        "- **What to call them:**",
        "- **Pronouns:** _(optional)_",
        "- **Timezone:**",
        "- **Notes:**",
        "",
        "- Name: USERNAME",
        "- Timezone: Asia/Shanghai"
      ].join("\n")
    )
    expect(userContent).toContain("## Preferences")
    expect(userContent).toContain("## Context")
  })

  it("creates a new H2 section at the end when appendWorkspaceSection targets a missing section", async () => {
    const execute = appendWorkspaceSectionTool().execute as AppendWorkspaceSectionExecute

    const result = (await execute(
      {
        path: "SOUL.md",
        sectionTitle: "Interests",
        content: "- Enjoys turning vague ideas into concrete plans."
      },
      {} as never
    )) as {
      createdFile: boolean
      createdSection: boolean
      sectionTitle: string
    }

    expect(result.createdFile).toBe(true)
    expect(result.createdSection).toBe(true)
    expect(result.sectionTitle).toBe("Interests")

    const soulContent = await readFile(join(appSupportDir, "workspace", "SOUL.md"), "utf8")
    expect(soulContent).toContain("## Core Truths")
    expect(soulContent).toContain("## Continuity")
    expect(
      soulContent
        .trimEnd()
        .endsWith("## Interests\n\n- Enjoys turning vague ideas into concrete plans.")
    ).toBe(true)
  })

  it("appends into an existing section without replacing prior content", async () => {
    const execute = appendWorkspaceSectionTool().execute as AppendWorkspaceSectionExecute

    await seedWorkspaceFile(
      appSupportDir,
      "MEMORY.md",
      [
        "# MEMORY.md - Long-Term Memory",
        "",
        "This file is curated long-term memory. Write here what should survive across sessions.",
        "",
        "## Preferences",
        "",
        "- Reply concisely",
        "",
        "## Decisions",
        "",
        "- Use pnpm",
        "",
        "## Constraints",
        "",
        "- Avoid destructive commands",
        "",
        "## Open Loops",
        "",
        "- Follow up on release notes",
        ""
      ].join("\n")
    )

    await execute(
      {
        path: "MEMORY.md",
        sectionTitle: "Decisions",
        content: "- Keep memory edits structured."
      },
      {} as never
    )

    const memoryContent = await readFile(join(appSupportDir, "workspace", "MEMORY.md"), "utf8")
    expect(memoryContent).toContain("## Decisions\n\n- Use pnpm\n\n- Keep memory edits structured.")
  })

  it("replaces only the targeted existing section", async () => {
    const execute = replaceWorkspaceSectionTool().execute as ReplaceWorkspaceSectionExecute

    await seedWorkspaceFile(
      appSupportDir,
      "IDENTITY.md",
      [
        "# IDENTITY.md - Who Am I?",
        "",
        "_Fill this in during your first conversation. Make it yours._",
        "",
        "This isn't just metadata. It's the start of figuring out who you are.",
        "",
        "## Name",
        "",
        "Mind Flayer",
        "",
        "## Creature",
        "",
        "Assistant",
        "",
        "## Vibe",
        "",
        "Warm",
        "",
        "## Emoji",
        "",
        ":-)",
        ""
      ].join("\n")
    )

    const result = await execute(
      {
        path: "IDENTITY.md",
        sectionTitle: "Vibe",
        content: "Sharp, warm, and pragmatic."
      },
      {} as never
    )

    expect(result).toEqual({
      path: "IDENTITY.md",
      sectionTitle: "Vibe",
      bytesWritten: Buffer.byteLength("Sharp, warm, and pragmatic.", "utf8"),
      createdFile: false,
      createdSection: false
    })

    const identityContent = await readFile(join(appSupportDir, "workspace", "IDENTITY.md"), "utf8")
    expect(identityContent).toContain("## Vibe\n\nSharp, warm, and pragmatic.")
    expect(identityContent).toContain("## Name\n\nMind Flayer")
    expect(identityContent).toContain("## Emoji\n\n:-)")
  })

  it("rejects replaceWorkspaceSection when the section does not exist", async () => {
    const execute = replaceWorkspaceSectionTool().execute as ReplaceWorkspaceSectionExecute

    await seedWorkspaceFile(
      appSupportDir,
      "USER.md",
      [
        "# USER.md - About Your Human",
        "",
        "_Learn about the person you're helping. Keep stable metadata easy to scan, and update this as you go._",
        "",
        "## Identity",
        "",
        "- **Name:**",
        "- **What to call them:**",
        "- **Pronouns:** _(optional)_",
        "- **Timezone:**",
        "- **Notes:**",
        "",
        "- Name: USERNAME",
        "",
        "## Preferences",
        "",
        "- Preferred language: Chinese",
        "",
        "## Context",
        "",
        "- Working on Mind Flayer",
        ""
      ].join("\n")
    )

    await expect(
      execute(
        {
          path: "USER.md",
          sectionTitle: "Projects",
          content: "- Mind Flayer"
        },
        {} as never
      )
    ).rejects.toThrow("does not exist")
  })

  it("rejects duplicate H2 sections to keep parsing stable", async () => {
    const execute = appendWorkspaceSectionTool().execute as AppendWorkspaceSectionExecute

    await seedWorkspaceFile(
      appSupportDir,
      "MEMORY.md",
      [
        "# MEMORY.md - Long-Term Memory",
        "",
        "This file is curated long-term memory. Write here what should survive across sessions.",
        "",
        "## Preferences",
        "",
        "- Reply concisely",
        "",
        "## Decisions",
        "",
        "- Use pnpm",
        "",
        "## Decisions",
        "",
        "- Duplicate",
        "",
        "## Constraints",
        "",
        "- Avoid destructive commands",
        "",
        "## Open Loops",
        "",
        "- Follow up on release notes",
        ""
      ].join("\n")
    )

    await expect(
      execute(
        {
          path: "MEMORY.md",
          sectionTitle: "Decisions",
          content: "- Another note"
        },
        {} as never
      )
    ).rejects.toThrow("duplicate section")
  })

  it("does not treat H3 headings as section boundaries", async () => {
    const execute = appendWorkspaceSectionTool().execute as AppendWorkspaceSectionExecute

    await seedWorkspaceFile(
      appSupportDir,
      "MEMORY.md",
      [
        "# MEMORY.md - Long-Term Memory",
        "",
        "This file is curated long-term memory. Write here what should survive across sessions.",
        "",
        "## Preferences",
        "",
        "- Reply concisely",
        "",
        "## Decisions",
        "",
        "- Use pnpm",
        "",
        "### Rationale",
        "",
        "- Shared tooling matters.",
        "",
        "## Constraints",
        "",
        "- Avoid destructive commands",
        "",
        "## Open Loops",
        "",
        "- Follow up on release notes",
        ""
      ].join("\n")
    )

    await execute(
      {
        path: "MEMORY.md",
        sectionTitle: "Decisions",
        content: "- Prefer explicit plans."
      },
      {} as never
    )

    const memoryContent = await readFile(join(appSupportDir, "workspace", "MEMORY.md"), "utf8")
    expect(memoryContent).toContain(
      [
        "## Decisions",
        "",
        "- Use pnpm",
        "",
        "### Rationale",
        "",
        "- Shared tooling matters.",
        "",
        "- Prefer explicit plans."
      ].join("\n")
    )
  })

  it("rejects section updates for AGENTS.md, BOOTSTRAP.md, and daily memory files", async () => {
    const appendExecute = appendWorkspaceSectionTool().execute as AppendWorkspaceSectionExecute
    const replaceExecute = replaceWorkspaceSectionTool().execute as ReplaceWorkspaceSectionExecute

    await expect(
      appendExecute(
        {
          path: "AGENTS.md" as "USER.md",
          sectionTitle: "Rules",
          content: "- Do not modify"
        },
        {} as never
      )
    ).rejects.toThrow("Workspace section updates are not allowed")

    await expect(
      replaceExecute(
        {
          path: "MEMORY.md",
          sectionTitle: "Entries",
          content: "- no"
        },
        {} as never
      )
    ).rejects.toThrow("does not exist")

    await expect(
      appendExecute(
        {
          path: "memory/2026-03-27.md" as "USER.md",
          sectionTitle: "Entries",
          content: "- no"
        },
        {} as never
      )
    ).rejects.toThrow("Workspace section updates are not allowed")

    await expect(
      replaceExecute(
        {
          path: "BOOTSTRAP.md" as "MEMORY.md",
          sectionTitle: "Anything",
          content: "- no"
        },
        {} as never
      )
    ).rejects.toThrow("Workspace section updates are not allowed")
  })

  it("creates and appends to daily memory files without rewriting prior content", async () => {
    const execute = appendDailyMemoryTool().execute as AppendDailyMemoryExecute

    const firstResult = await execute(
      {
        path: "memory/2026-03-27.md",
        content: "- 10:15 Fact: First note"
      },
      {} as never
    )
    expect(firstResult).toEqual({
      path: "memory/2026-03-27.md",
      bytesWritten: Buffer.byteLength("- 10:15 Fact: First note", "utf8"),
      createdFile: true
    })

    const firstContent = await readFile(
      join(appSupportDir, "workspace", "memory", "2026-03-27.md"),
      "utf8"
    )
    expect(firstContent).toBe("# 2026-03-27\n\n- 10:15 Fact: First note\n")

    await execute(
      {
        path: "memory/2026-03-27.md",
        content: "- 11:05 Follow-up: Second note"
      },
      {} as never
    )

    const secondContent = await readFile(
      join(appSupportDir, "workspace", "memory", "2026-03-27.md"),
      "utf8"
    )
    expect(secondContent.startsWith(firstContent)).toBe(true)
    expect(secondContent).toBe(
      "# 2026-03-27\n\n- 10:15 Fact: First note\n\n- 11:05 Follow-up: Second note\n"
    )
  })

  it("rejects appendDailyMemory for non-daily paths", async () => {
    const execute = appendDailyMemoryTool().execute as AppendDailyMemoryExecute

    await expect(
      execute(
        {
          path: "MEMORY.md",
          content: "- nope"
        } as never,
        {} as never
      )
    ).rejects.toThrow("Daily memory updates are not allowed")
  })

  it("deletes BOOTSTRAP.md and marks setup complete", async () => {
    const execute = deleteWorkspaceFileTool().execute as DeleteWorkspaceFileExecute

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

    const result = await execute(
      {
        path: "BOOTSTRAP.md"
      },
      {} as never
    )

    expect(result).toEqual({
      path: "BOOTSTRAP.md",
      deleted: true
    })

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

  it("rejects deleteWorkspaceFile for any path other than BOOTSTRAP.md", async () => {
    const execute = deleteWorkspaceFileTool().execute as DeleteWorkspaceFileExecute

    await expect(
      execute(
        {
          path: "AGENTS.md"
        } as never,
        {} as never
      )
    ).rejects.toThrow("Workspace file deletion is not allowed")
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

  it("rejects reads from the removed legacy memory.md path", async () => {
    const execute = memoryGetTool().execute as MemoryGetExecute

    await expect(
      execute(
        {
          path: "memory.md"
        },
        {} as never
      )
    ).rejects.toThrow("Memory access is not allowed")
  })

  it("rejects reads from non-daily files under memory/", async () => {
    const execute = memoryGetTool().execute as MemoryGetExecute

    await expect(
      execute(
        {
          path: "memory/notes.md"
        },
        {} as never
      )
    ).rejects.toThrow("Memory access is not allowed")
  })
})
