import { readFile, stat } from "node:fs/promises"
import { basename, extname, normalize } from "node:path"

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/
const NETWORK_OR_DATA_PROTOCOL_REGEX = /^(https?:|data:|blob:)/i
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g
const MAX_PROXY_PATH_RESOLVE_DEPTH = 3

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"])
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"])
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"])

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
  ".md": "text/markdown"
}

export type TelegramMediaKind = "photo" | "video" | "audio" | "document"

export interface TelegramMediaUpload {
  kind: TelegramMediaKind
  data: Buffer
  filename: string
  mimeType: string
  caption: string
}

export interface TelegramMediaTransformResult {
  sanitizedText: string
  uploads: TelegramMediaUpload[]
  warnings: string[]
}

interface MarkdownMatch {
  fullMatch: string
  altText: string
  rawTarget: string
  start: number
  end: number
  type: "image" | "link"
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

function unwrapMarkdownTarget(rawTarget: string): string {
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

function resolveLocalPath(source: string, depth = 0): string | null {
  if (depth > MAX_PROXY_PATH_RESOLVE_DEPTH) {
    return null
  }

  const trimmedSource = source.trim()
  if (!trimmedSource) {
    return null
  }

  const proxyPath = extractProxyPath(trimmedSource)
  if (proxyPath) {
    return resolveLocalPath(proxyPath, depth + 1)
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

function buildPlaceholder(type: "image" | "file", label: string, filePath: string): string {
  const safeLabel = label.trim() || basename(filePath)
  return type === "image" ? `[image: ${safeLabel}]` : `[file: ${safeLabel}]`
}

function normalizeSanitizedText(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function resolveMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  return MIME_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream"
}

function resolveKind(filePath: string): TelegramMediaKind {
  const extension = extname(filePath).toLowerCase()

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "photo"
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video"
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio"
  }

  return "document"
}

function collectMarkdownMatches(text: string): MarkdownMatch[] {
  const matches: MarkdownMatch[] = []

  for (const match of text.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const fullMatch = match[0]
    const altText = match[1] ?? ""
    const rawTarget = match[2] ?? ""
    const start = match.index ?? 0

    matches.push({
      fullMatch,
      altText,
      rawTarget,
      start,
      end: start + fullMatch.length,
      type: "image"
    })
  }

  for (const match of text.matchAll(MARKDOWN_LINK_REGEX)) {
    const fullMatch = match[0]
    const altText = match[1] ?? ""
    const rawTarget = match[2] ?? ""
    const start = match.index ?? 0

    // Skip if this link is part of an image syntax (prefixed by !)
    if (start > 0 && text[start - 1] === "!") {
      continue
    }

    matches.push({
      fullMatch,
      altText,
      rawTarget,
      start,
      end: start + fullMatch.length,
      type: "link"
    })
  }

  matches.sort((a, b) => a.start - b.start)
  return matches
}

export async function transformTelegramMediaMessage(
  text: string
): Promise<TelegramMediaTransformResult> {
  const warnings: string[] = []
  const uploads: TelegramMediaUpload[] = []
  let cursor = 0
  let output = ""
  let localMediaFound = false

  const matches = collectMarkdownMatches(text)
  for (const match of matches) {
    if (match.start < cursor) {
      continue
    }

    output += text.slice(cursor, match.start)
    cursor = match.end

    const source = unwrapMarkdownTarget(match.rawTarget)
    const localPath = resolveLocalPath(source)
    if (!localPath) {
      output += match.fullMatch
      continue
    }

    localMediaFound = true
    output += buildPlaceholder(match.type === "image" ? "image" : "file", match.altText, localPath)

    try {
      const fileStats = await stat(localPath)
      if (!fileStats.isFile()) {
        warnings.push(`Skipping local media '${localPath}': path is not a file.`)
        continue
      }

      const data = await readFile(localPath)
      uploads.push({
        kind: resolveKind(localPath),
        data,
        filename: basename(localPath),
        mimeType: resolveMimeType(localPath),
        caption: match.altText.trim() || basename(localPath)
      })
    } catch (error) {
      warnings.push(
        `Skipping local media '${localPath}': ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (cursor < text.length) {
    output += text.slice(cursor)
  }

  if (!localMediaFound) {
    return {
      sanitizedText: text.trim(),
      uploads,
      warnings
    }
  }

  const sanitizedText = normalizeSanitizedText(output)
  return {
    sanitizedText: sanitizedText || "Media attached.",
    uploads,
    warnings
  }
}
