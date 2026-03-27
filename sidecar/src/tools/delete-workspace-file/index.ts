import { tool } from "ai"
import { z } from "zod"
import { deleteWorkspaceFile } from "../../workspace"
import type { ITool } from "../base-tool"

const deleteWorkspaceFileInputSchema = z.object({
  path: z.literal("BOOTSTRAP.md").describe("The only deletable workspace file: BOOTSTRAP.md")
})

export class DeleteWorkspaceFileTool implements ITool {
  readonly name = "deleteWorkspaceFile"

  createInstance(): ReturnType<typeof deleteWorkspaceFileTool> {
    return deleteWorkspaceFileTool()
  }
}

export const deleteWorkspaceFileTool = () =>
  tool({
    description: `Delete BOOTSTRAP.md from the workspace.

Rules:
- Only BOOTSTRAP.md may be deleted
- Deleting BOOTSTRAP.md marks onboarding as completed
- AGENTS.md and all other workspace files are immutable through this tool`,

    inputSchema: deleteWorkspaceFileInputSchema,

    inputExamples: [
      {
        input: {
          path: "BOOTSTRAP.md"
        }
      }
    ],

    execute: async input => {
      try {
        return await deleteWorkspaceFile(input)
      } catch (error) {
        throw new Error(
          `Failed to delete workspace file: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  })
