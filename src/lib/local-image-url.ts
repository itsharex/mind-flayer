const LOCAL_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"])

const NETWORK_OR_DATA_PROTOCOL_REGEX = /^(https?:|data:|blob:)/i
const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/

function stripSearchAndHash(value: string): string {
  return value.split("#", 1)[0]?.split("?", 1)[0] ?? value
}

function decodeFileUrlPath(source: string): string | null {
  try {
    const fileUrl = new URL(source)
    if (fileUrl.protocol !== "file:") {
      return null
    }
    return decodeURIComponent(fileUrl.pathname)
  } catch {
    return null
  }
}

function isAbsolutePath(source: string): boolean {
  if (source.startsWith("//")) {
    return false
  }
  return source.startsWith("/") || WINDOWS_ABSOLUTE_PATH_REGEX.test(source)
}

function normalizeLocalPathCandidate(source: string): string | null {
  const trimmedSource = source.trim()
  if (!trimmedSource || NETWORK_OR_DATA_PROTOCOL_REGEX.test(trimmedSource)) {
    return null
  }

  if (trimmedSource.toLowerCase().startsWith("file://")) {
    return decodeFileUrlPath(trimmedSource)
  }

  if (isAbsolutePath(trimmedSource)) {
    return trimmedSource
  }

  return null
}

export function hasSupportedLocalImageExtension(source: string): boolean {
  const normalizedPath = normalizeLocalPathCandidate(source)
  if (!normalizedPath) {
    return false
  }

  const cleanPath = stripSearchAndHash(normalizedPath)
  const extensionMatch = cleanPath.match(/\.([a-z0-9]+)$/i)
  if (!extensionMatch) {
    return false
  }

  return LOCAL_IMAGE_EXTENSIONS.has(extensionMatch[1].toLowerCase())
}

export function isLocalImagePath(source: string): boolean {
  return normalizeLocalPathCandidate(source) !== null
}

function trimTrailingSlashes(origin: string): string {
  return origin.replace(/\/+$/, "")
}

export function resolveLocalImageUrl(source: string, localImageProxyOrigin?: string): string {
  const trimmedSource = source.trim()
  if (!trimmedSource || NETWORK_OR_DATA_PROTOCOL_REGEX.test(trimmedSource)) {
    return trimmedSource
  }

  if (!localImageProxyOrigin) {
    return trimmedSource
  }

  if (!isLocalImagePath(trimmedSource) || !hasSupportedLocalImageExtension(trimmedSource)) {
    return trimmedSource
  }

  const proxyOrigin = trimTrailingSlashes(localImageProxyOrigin)
  return `${proxyOrigin}/api/local-image?path=${encodeURIComponent(trimmedSource)}`
}

export function getOriginalLocalImagePathFromProxyUrl(source: string): string | null {
  try {
    const parsedUrl = new URL(source)
    if (!parsedUrl.pathname.endsWith("/api/local-image")) {
      return null
    }

    const localPath = parsedUrl.searchParams.get("path")
    return localPath?.trim() ? localPath : null
  } catch {
    return null
  }
}
