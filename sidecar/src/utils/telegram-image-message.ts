import { readFile, stat } from "node:fs/promises"
import { basename, extname, normalize } from "node:path"

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/
const NETWORK_OR_DATA_PROTOCOL_REGEX = /^(https?:|data:|blob:)/i
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g
const MAX_PROXY_PATH_RESOLVE_DEPTH = 3

const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"])

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml"
}

export interface TelegramImageUpload {
  data: Buffer
  filename: string
  mimeType: string
  caption: string
}

export interface TelegramImageTransformResult {
  sanitizedText: string
  uploads: TelegramImageUpload[]
  warnings: string[]
}

function isAbsolutePath(path: string): boolean {
  if (path.startsWith("//")) {
    return false
  }

  return path.startsWith("/") || WINDOWS_ABSOLUTE_PATH_REGEX.test(path)
}

function decodeFileUrlPath(fileUrlPath: string): string | null {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(fileUrlPath)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== "file:") {
    return null
  }

  if (parsedUrl.hostname && parsedUrl.hostname !== "localhost") {
    return null
  }

  let decodedPath = parsedUrl.pathname
  try {
    decodedPath = decodeURIComponent(decodedPath)
  } catch {
    // Keep parsed pathname when decode fails.
  }

  if (
    process.platform === "win32" &&
    decodedPath.startsWith("/") &&
    WINDOWS_ABSOLUTE_PATH_REGEX.test(decodedPath.slice(1))
  ) {
    decodedPath = decodedPath.slice(1)
  }

  if (!isAbsolutePath(decodedPath)) {
    return null
  }

  return normalize(decodedPath)
}

function unwrapMarkdownImageTarget(rawTarget: string): string {
  let next = rawTarget.trim()

  if (next.startsWith("<") && next.endsWith(">")) {
    next = next.slice(1, -1).trim()
  }

  const titleSeparator = next.search(/\s+"/)
  if (titleSeparator >= 0) {
    next = next.slice(0, titleSeparator)
  }

  return next
}

function extractProxyPath(source: string): string | null {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(source)
  } catch {
    return null
  }

  if (!parsedUrl.pathname.endsWith("/api/local-image")) {
    return null
  }

  const path = parsedUrl.searchParams.get("path")?.trim()
  return path || null
}

function resolveLocalImagePath(source: string, depth = 0): string | null {
  if (depth > MAX_PROXY_PATH_RESOLVE_DEPTH) {
    return null
  }

  const trimmedSource = source.trim()
  if (!trimmedSource) {
    return null
  }

  const proxyPath = extractProxyPath(trimmedSource)
  if (proxyPath) {
    return resolveLocalImagePath(proxyPath, depth + 1)
  }

  if (NETWORK_OR_DATA_PROTOCOL_REGEX.test(trimmedSource)) {
    return null
  }

  if (trimmedSource.toLowerCase().startsWith("file://")) {
    return decodeFileUrlPath(trimmedSource)
  }

  if (!isAbsolutePath(trimmedSource)) {
    return null
  }

  return normalize(trimmedSource)
}

function buildPlaceholder(altText: string, filePath: string): string {
  const label = altText.trim() || basename(filePath)
  return `[image: ${label}]`
}

function normalizeSanitizedText(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function resolveMimeType(filePath: string): string | null {
  const extension = extname(filePath).toLowerCase()
  return MIME_TYPE_BY_EXTENSION[extension] ?? null
}

export async function transformTelegramImageMessage(
  text: string
): Promise<TelegramImageTransformResult> {
  const warnings: string[] = []
  const uploads: TelegramImageUpload[] = []
  let cursor = 0
  let output = ""
  let localImageFound = false

  const matches = text.matchAll(MARKDOWN_IMAGE_REGEX)
  for (const match of matches) {
    const fullMatch = match[0]
    const altText = match[1] ?? ""
    const rawTarget = match[2] ?? ""
    const matchIndex = match.index ?? 0

    output += text.slice(cursor, matchIndex)
    cursor = matchIndex + fullMatch.length

    const imageSource = unwrapMarkdownImageTarget(rawTarget)
    const localPath = resolveLocalImagePath(imageSource)
    if (!localPath) {
      output += fullMatch
      continue
    }

    localImageFound = true
    const placeholder = buildPlaceholder(altText, localPath)
    output += placeholder

    const mimeType = resolveMimeType(localPath)
    if (!mimeType || !ALLOWED_IMAGE_EXTENSIONS.has(extname(localPath).toLowerCase())) {
      warnings.push(`Skipping local image '${localPath}': unsupported image extension.`)
      continue
    }

    try {
      const fileStats = await stat(localPath)
      if (!fileStats.isFile()) {
        warnings.push(`Skipping local image '${localPath}': path is not a file.`)
        continue
      }

      const data = await readFile(localPath)
      uploads.push({
        data,
        filename: basename(localPath),
        mimeType,
        caption: altText.trim() || basename(localPath)
      })
    } catch (error) {
      warnings.push(
        `Skipping local image '${localPath}': ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (cursor < text.length) {
    output += text.slice(cursor)
  }

  if (!localImageFound) {
    return {
      sanitizedText: text.trim(),
      uploads,
      warnings
    }
  }

  const sanitizedText = normalizeSanitizedText(output)
  return {
    sanitizedText: sanitizedText || "Image attached.",
    uploads,
    warnings
  }
}
