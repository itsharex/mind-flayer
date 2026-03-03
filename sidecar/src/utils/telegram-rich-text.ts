const UNORDERED_LIST_ITEM_REGEX = /^(\s*)[-*+]\s+/
const FENCED_CODE_BLOCK_REGEX = /```[^\n`]*\n?([\s\S]*?)```/g
const INLINE_CODE_REGEX = /`([^`\n]+)`/g
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g
const STRONG_ASTERISK_REGEX = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g
const STRONG_UNDERSCORE_REGEX = /__(?=\S)(.+?)(?<=\S)__/g
const EMPHASIS_ASTERISK_REGEX = /(^|[^*])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g
const EMPHASIS_UNDERSCORE_REGEX = /(^|[^_])_(?=\S)(.+?)(?<=\S)_(?!_)/g
const MARKDOWN_LINK_TITLE_SEPARATOR_REGEX = /\s+"/
const HTTP_URL_REGEX = /^https?:\/\//i

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
}

function normalizeFenceCode(code: string): string {
  return code.replace(/^\n/, "").replace(/\n$/, "")
}

function replaceUnorderedListMarker(line: string): string {
  return line.replace(UNORDERED_LIST_ITEM_REGEX, "$1• ")
}

function unwrapMarkdownLinkTarget(rawTarget: string): string {
  let next = rawTarget.trim()

  if (next.startsWith("<") && next.endsWith(">")) {
    next = next.slice(1, -1).trim()
  }

  const titleSeparator = next.search(MARKDOWN_LINK_TITLE_SEPARATOR_REGEX)
  if (titleSeparator >= 0) {
    next = next.slice(0, titleSeparator)
  }

  return next
}

export function toTelegramHtml(markdown: string): string {
  if (!markdown) {
    return ""
  }

  const normalizedText = markdown.replace(/\r\n/g, "\n")
  const listNormalizedText = normalizedText
    .split("\n")
    .map(line => replaceUnorderedListMarker(line))
    .join("\n")

  const placeholders = new Map<string, string>()
  let placeholderIndex = 0
  const createPlaceholder = (content: string) => {
    const key = `@@TGPH${placeholderIndex}@@`
    placeholderIndex += 1
    placeholders.set(key, content)
    return key
  }

  const withCodeBlocks = listNormalizedText.replace(FENCED_CODE_BLOCK_REGEX, (_match, code) => {
    const escapedCode = escapeHtml(normalizeFenceCode(String(code ?? "")))
    return createPlaceholder(`<pre><code>${escapedCode}</code></pre>`)
  })

  const withInlineCode = withCodeBlocks.replace(INLINE_CODE_REGEX, (_match, inlineCode) => {
    return createPlaceholder(`<code>${escapeHtml(String(inlineCode ?? ""))}</code>`)
  })

  const escapedText = escapeHtml(withInlineCode)
  const withStrong = escapedText
    .replace(STRONG_ASTERISK_REGEX, "<b>$1</b>")
    .replace(STRONG_UNDERSCORE_REGEX, "<b>$1</b>")

  const withEmphasis = withStrong
    .replace(EMPHASIS_ASTERISK_REGEX, "$1<i>$2</i>")
    .replace(EMPHASIS_UNDERSCORE_REGEX, "$1<i>$2</i>")

  const withLinks = withEmphasis.replace(LINK_REGEX, (match, label, rawTarget) => {
    const target = unescapeHtml(unwrapMarkdownLinkTarget(String(rawTarget ?? "")))
    if (!HTTP_URL_REGEX.test(target)) {
      return match
    }

    return `<a href="${escapeHtmlAttribute(target)}">${label}</a>`
  })

  let restored = withLinks
  for (const [placeholder, content] of placeholders.entries()) {
    restored = restored.replaceAll(placeholder, content)
  }

  return restored
}
