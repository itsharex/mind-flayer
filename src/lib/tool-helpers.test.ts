import type { ToolUIPart } from "ai"
import { describe, expect, it } from "vitest"
import { getToolCallMeta } from "@/lib/tool-helpers"

const toolConstants = {
  names: {},
  states: {},
  webSearch: {
    searching: "Searching...",
    searchedResults: (count: number) => `Searched ${count} results`,
    approvalText: (objective: string) => objective
  },
  read: {
    input: (filePath: string) => filePath,
    inputWithOffset: (filePath: string, offset: number) => `${filePath} (offset ${offset})`,
    complete: "Read complete",
    chunk: (nextOffset: number) => `Read chunk, next offset ${nextOffset}`,
    fileDescription: (filePath: string) => filePath,
    fileDescriptionWithOffset: (filePath: string, offset: number) =>
      `${filePath} (offset ${offset})`,
    emptyFile: "[empty file]",
    nextOffset: (nextOffset: number) => `Next offset: ${nextOffset}`
  },
  bashExecution: {
    exitCode: (code: number) => `Exit ${code}`
  },
  skillRead: {
    badge: "Skill",
    loaded: (skillName: string) => `Loaded skill ${skillName}`,
    chunk: (skillName: string, nextOffset: number) =>
      `Loaded part of skill ${skillName}, next offset ${nextOffset}`,
    fileKind: () => ""
  }
} as never

describe("getToolInputMeta", () => {
  it("shows a workspace-relative path for writeWorkspaceFile", () => {
    const part = {
      type: "tool-writeWorkspaceFile",
      toolCallId: "tool-1",
      state: "output-available",
      input: {
        path: "/Users/didi/Library/Application Support/Mind Flayer/workspace/USER.md",
        operation: "write"
      },
      output: {
        path: "USER.md",
        absolutePath: "/Users/didi/Library/Application Support/Mind Flayer/workspace/USER.md",
        operation: "write",
        bytesWritten: 12
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("USER.md")
  })

  it("shows the query for memorySearch", () => {
    const part = {
      type: "tool-memorySearch",
      toolCallId: "tool-2",
      state: "output-available",
      input: {
        query: "preferred language"
      },
      output: {
        query: "preferred language"
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("preferred language")
  })

  it("shows a workspace-relative path for memoryGet", () => {
    const part = {
      type: "tool-memoryGet",
      toolCallId: "tool-3",
      state: "output-available",
      input: {
        path: "file:///Users/didi/Library/Application%20Support/Mind%20Flayer/workspace/memory/2026-03-26.md"
      },
      output: {
        path: "memory/2026-03-26.md",
        absolutePath:
          "/Users/didi/Library/Application Support/Mind Flayer/workspace/memory/2026-03-26.md",
        exists: true,
        content: "User prefers concise replies.",
        startLine: 1,
        endLine: 1
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("memory/2026-03-26.md")
  })
})
