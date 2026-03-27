import { tool } from "ai"
import { z } from "zod"
import { appendWorkspaceSection } from "../../workspace"
import type { ITool } from "../base-tool"

const SECTION_FILE_PATHS = ["USER.md", "SOUL.md", "IDENTITY.md", "MEMORY.md"] as const

const appendWorkspaceSectionInputSchema = z.object({
  path: z
    .enum(SECTION_FILE_PATHS)
    .describe("Target workspace section file: USER.md, SOUL.md, IDENTITY.md, or MEMORY.md"),
  sectionTitle: z
    .string()
    .min(1)
    .describe("Target H2 section title. If it does not exist yet, a new ## section is created."),
  content: z.string().min(1).describe("Markdown content to append into the target section")
})

export class AppendWorkspaceSectionTool implements ITool {
  readonly name = "appendWorkspaceSection"

  createInstance(): ReturnType<typeof appendWorkspaceSectionTool> {
    return appendWorkspaceSectionTool()
  }
}

export const appendWorkspaceSectionTool = () =>
  tool({
    description: `Append content to a workspace section file.

Allowed targets:
- USER.md
- SOUL.md
- IDENTITY.md
- MEMORY.md

Rules:
- Only H2 headings (##) are treated as sections
- If the section already exists, append to it
- If the section does not exist, create a new ## section at the end
- If the file does not exist, create it from the bundled template first
- USER.md starts with: Identity, Preferences, Context
- USER.md Identity starts with explicit slots for Name, What to call them, Pronouns, Timezone, and Notes
- For the first structured fill of USER.md Identity, prefer replaceWorkspaceSection; use appendWorkspaceSection for later additions
- SOUL.md starts with: Core Truths, Boundaries, Vibe, Continuity
- IDENTITY.md starts with: Name, Creature, Vibe, Emoji
- MEMORY.md starts with: Preferences, Decisions, Constraints, Open Loops`,

    inputSchema: appendWorkspaceSectionInputSchema,

    inputExamples: [
      {
        input: {
          path: "MEMORY.md",
          sectionTitle: "Decisions",
          content: "- Prefer concise technical summaries."
        }
      },
      {
        input: {
          path: "SOUL.md",
          sectionTitle: "Interests",
          content: "- Enjoys turning vague ideas into concrete plans."
        }
      }
    ],

    execute: async input => {
      try {
        return await appendWorkspaceSection(input)
      } catch (error) {
        throw new Error(
          `Failed to append workspace section: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  })
