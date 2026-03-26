import { tool } from "ai"
import { z } from "zod"
import { getMemoryFile } from "../../workspace"
import type { ITool } from "../base-tool"

export class MemoryGetTool implements ITool {
  readonly name = "memoryGet"

  createInstance(): ReturnType<typeof memoryGetTool> {
    return memoryGetTool()
  }
}

export const memoryGetTool = () =>
  tool({
    description: `Read a memory file from the global agent workspace.

Allowed targets:
- MEMORY.md
- memory.md
- Files under memory/**/*.md

If the file does not exist, this tool returns empty content instead of throwing.`,

    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe("Workspace-relative memory path such as MEMORY.md or memory/2026-03-26.md"),
      startLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Optional 1-based start line for a partial read"),
      endLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Optional 1-based end line for a partial read")
    }),

    inputExamples: [
      {
        input: {
          path: "MEMORY.md"
        }
      },
      {
        input: {
          path: "memory/2026-03-26.md",
          startLine: 1,
          endLine: 20
        }
      }
    ],

    execute: async ({ path, startLine, endLine }) => {
      try {
        return await getMemoryFile(path, { startLine, endLine })
      } catch (error) {
        throw new Error(
          `Failed to read memory file: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  })
