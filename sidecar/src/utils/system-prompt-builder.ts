/**
 * System prompt builder for AI agent.
 * Centralizes system context generation for easy extension.
 */

/**
 * Build role context for the AI agent.
 *
 * @returns Role context string
 */
function buildRoleContext(): string {
  return "You are Mind Flayer, a local desktop AI agent."
}

/**
 * Build response format rules.
 *
 * @returns Response format rules string
 */
function buildResponseFormatRules(): string {
  return [
    "Response format rules:",
    "- When sharing a local image file (such as a screenshot), always embed it using Markdown image syntax.",
    "- Use an absolute file URI in the image URL: ![screenshot](file:///absolute/path/to/image.png).",
    "- Do not reply with only a plain file path for images."
  ].join("\n")
}

/**
 * Build system context including environment and time info.
 *
 * @returns System context string
 */
function buildSystemContext(): string {
  const platform = process.platform
  const osName =
    platform === "darwin"
      ? "macOS"
      : platform === "win32"
        ? "Windows"
        : platform === "linux"
          ? "Linux"
          : "Unknown"

  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"

  // Only date, no time component for better KV cache hit rate
  const localDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now)

  // Calculate UTC offset (e.g., UTC+8, UTC-5)
  const offsetMinutes = -now.getTimezoneOffset()
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
  const offsetMins = Math.abs(offsetMinutes) % 60
  const offsetSign = offsetMinutes >= 0 ? "+" : "-"
  const utcOffset = `UTC${offsetSign}${offsetHours}${offsetMins > 0 ? `:${offsetMins.toString().padStart(2, "0")}` : ""}`

  return [
    "System context:",
    `- os: ${osName}`,
    `- platform: ${platform}`,
    `- current_date: ${localDate}`,
    `- time_zone: ${tz} (${utcOffset})`
  ].join("\n")
}

/**
 * Build complete system prompt for the AI agent.
 * Combines all context sections for optimal performance and extensibility.
 *
 * @returns Complete system prompt
 */
export function buildSystemPrompt(): string {
  return [buildRoleContext(), buildResponseFormatRules(), buildSystemContext()].join("\n")
}
