import { tool } from "ai"
import { z } from "zod"
import { searchMemory } from "../../workspace"
import type { ITool } from "../base-tool"

export class MemorySearchTool implements ITool {
  readonly name = "memorySearch"

  createInstance(): ReturnType<typeof memorySearchTool> {
    return memorySearchTool()
  }
}

export const memorySearchTool = () =>
  tool({
    description: `Search the global agent memory files with simple text matching.

Searches:
- MEMORY.md
- Daily notes under memory/YYYY-MM-DD.md (append-only chronological logs)

Use this when you need to recall past context without loading all memory files into the prompt.`,

    inputSchema: z.object({
      query: z.string().min(1).describe("What to look for in memory"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Maximum number of memory snippets to return")
    }),

    inputExamples: [
      {
        input: {
          query: "timezone preferred language",
          maxResults: 5
        }
      }
    ],

    execute: async ({ query, maxResults }) => {
      try {
        const results = await searchMemory(query, maxResults)
        return {
          query,
          totalResults: results.length,
          results
        }
      } catch (error) {
        throw new Error(
          `Failed to search memory: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  })
