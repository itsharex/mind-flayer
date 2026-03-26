import { BashExecutionTool, bashExecutionTool } from "./bash-exec"
import { MemoryGetTool, memoryGetTool } from "./memory-get"
import { MemorySearchTool, memorySearchTool } from "./memory-search"
import { ReadTool, readTool } from "./read"
import { ToolRegistry } from "./registry"
import { WebSearchTool, webSearchTool } from "./web-search"
import { WriteWorkspaceFileTool, writeWorkspaceFileTool } from "./write-workspace-file"

/**
 * Global tool registry instance.
 * All built-in tools are automatically registered on import.
 */
export const toolRegistry = new ToolRegistry()

// Register built-in tools
toolRegistry.register(new WebSearchTool())
toolRegistry.register(new BashExecutionTool())
toolRegistry.register(new ReadTool())
toolRegistry.register(new WriteWorkspaceFileTool())
toolRegistry.register(new MemorySearchTool())
toolRegistry.register(new MemoryGetTool())

export type { ITool } from "./base-tool"
// Export types and classes for external use
export { ToolRegistry } from "./registry"

// Keep exporting tool factories for backward compatibility during refactoring
export {
  bashExecutionTool,
  memoryGetTool,
  memorySearchTool,
  readTool,
  webSearchTool,
  writeWorkspaceFileTool
}

// Type for all available tools (used by AI SDK)
export type AllTools = {
  webSearch?: ReturnType<typeof webSearchTool>
  bashExecution?: ReturnType<typeof bashExecutionTool>
  read?: ReturnType<typeof readTool>
  writeWorkspaceFile?: ReturnType<typeof writeWorkspaceFileTool>
  memorySearch?: ReturnType<typeof memorySearchTool>
  memoryGet?: ReturnType<typeof memoryGetTool>
}
