/**
 * Base interface for tool plugins.
 * Each tool plugin must implement this interface.
 */
export interface ITool {
  /**
   * Unique identifier for the tool (e.g., "webSearch")
   */
  readonly name: string

  /**
   * Create a tool instance with the given configuration.
   *
   * @param apiKey - Tool-specific configuration token such as an API key or session identifier
   * @param source - Command source: "channel" or "desktop"
   * @returns AI SDK tool instance created by tool() function
   */
  createInstance(apiKey: string, source?: string): unknown
}
