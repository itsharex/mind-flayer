import { tool } from "ai"
import { z } from "zod"
import { writeWorkspaceTextFile } from "../../workspace"
import type { ITool } from "../base-tool"

const writeWorkspaceFileInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe("Workspace-relative path such as AGENTS.md or memory/2026-03-26.md"),
    operation: z
      .enum(["write", "append", "delete"])
      .describe("Whether to overwrite, append to, or delete the target file"),
    content: z
      .string()
      .optional()
      .describe("Required for write and append operations; ignored for delete")
  })
  .superRefine((value, ctx) => {
    if (
      (value.operation === "write" || value.operation === "append") &&
      value.content === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "content is required for write and append operations",
        path: ["content"]
      })
    }
  })

export class WriteWorkspaceFileTool implements ITool {
  readonly name = "writeWorkspaceFile"

  createInstance(): ReturnType<typeof writeWorkspaceFileTool> {
    return writeWorkspaceFileTool()
  }
}

export const writeWorkspaceFileTool = () =>
  tool({
    description: `Write or delete approved files inside the global agent workspace.

Allowed targets:
- Root prompt files: AGENTS.md, SOUL.md, IDENTITY.md, USER.md, BOOTSTRAP.md, MEMORY.md, memory.md
- Daily memory files under memory/**/*.md

Use this to update prompt files, persist memory, or delete BOOTSTRAP.md after onboarding is complete.
Do not use this for sandboxes, skills, channels, or arbitrary file system paths.`,

    inputSchema: writeWorkspaceFileInputSchema,

    inputExamples: [
      {
        input: {
          path: "USER.md",
          operation: "append",
          content: "\n- Preferred language: Chinese\n"
        }
      },
      {
        input: {
          path: "memory/2026-03-26.md",
          operation: "write",
          content: "# 2026-03-26\n\n- User prefers concise replies.\n"
        }
      },
      {
        input: {
          path: "BOOTSTRAP.md",
          operation: "delete"
        }
      }
    ],

    execute: async input => {
      try {
        const { absolutePath: _absolutePath, ...result } = await writeWorkspaceTextFile(input)
        return result
      } catch (error) {
        throw new Error(
          `Failed to update workspace file: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  })
