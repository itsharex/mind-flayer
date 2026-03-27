import { tool } from "ai"
import { z } from "zod"
import { appendDailyMemory } from "../../workspace"
import type { ITool } from "../base-tool"

const DAILY_MEMORY_PATH_PATTERN = /^memory\/\d{4}-\d{2}-\d{2}\.md$/

const appendDailyMemoryInputSchema = z.object({
  path: z
    .string()
    .regex(DAILY_MEMORY_PATH_PATTERN, "path must match memory/YYYY-MM-DD.md")
    .describe("Daily memory file path such as memory/2026-03-27.md"),
  content: z.string().min(1).describe("Markdown content to append at the end of the daily log")
})

export class AppendDailyMemoryTool implements ITool {
  readonly name = "appendDailyMemory"

  createInstance(): ReturnType<typeof appendDailyMemoryTool> {
    return appendDailyMemoryTool()
  }
}

export const appendDailyMemoryTool = () =>
  tool({
    description: `Append a new entry to the end of a daily memory log.

Allowed targets:
- Daily memory files under memory/YYYY-MM-DD.md

Rules:
- Append-only: never rewrite or delete previous daily entries
- If the file does not exist yet, create it first
- Use this for same-day facts, decisions, and follow-ups in chronological order`,

    inputSchema: appendDailyMemoryInputSchema,

    inputExamples: [
      {
        input: {
          path: "memory/2026-03-27.md",
          content: "- 10:15 Decision: Keep daily memory append-only."
        }
      }
    ],

    execute: async input => {
      try {
        return await appendDailyMemory(input)
      } catch (error) {
        throw new Error(
          `Failed to append daily memory: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  })
