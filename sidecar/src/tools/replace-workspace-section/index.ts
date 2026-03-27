import { tool } from "ai"
import { z } from "zod"
import { replaceWorkspaceSection } from "../../workspace"
import type { ITool } from "../base-tool"

const SECTION_FILE_PATHS = ["USER.md", "SOUL.md", "IDENTITY.md", "MEMORY.md"] as const

const replaceWorkspaceSectionInputSchema = z.object({
  path: z
    .enum(SECTION_FILE_PATHS)
    .describe("Target workspace section file: USER.md, SOUL.md, IDENTITY.md, or MEMORY.md"),
  sectionTitle: z.string().min(1).describe("Existing H2 section title to replace"),
  content: z.string().min(1).describe("Markdown content that replaces the section body")
})

export class ReplaceWorkspaceSectionTool implements ITool {
  readonly name = "replaceWorkspaceSection"

  createInstance(): ReturnType<typeof replaceWorkspaceSectionTool> {
    return replaceWorkspaceSectionTool()
  }
}

export const replaceWorkspaceSectionTool = () =>
  tool({
    description: `Replace the body of an existing workspace section.

Allowed targets:
- USER.md
- SOUL.md
- IDENTITY.md
- MEMORY.md

Rules:
- Only H2 headings (##) are treated as sections
- The target section must already exist
- This is the low-frequency consolidation tool; prefer appendWorkspaceSection for new facts
- Daily memory files and BOOTSTRAP.md are not allowed`,

    inputSchema: replaceWorkspaceSectionInputSchema,

    inputExamples: [
      {
        input: {
          path: "IDENTITY.md",
          sectionTitle: "Name",
          content: "Mind Flayer"
        }
      }
    ],

    execute: async input => {
      try {
        return await replaceWorkspaceSection(input)
      } catch (error) {
        throw new Error(
          `Failed to replace workspace section: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  })
