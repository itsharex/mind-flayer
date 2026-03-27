/**
 * Sandbox manager for bash execution session sandboxes.
 * Creates and manages isolated directories per chat session.
 */

import { randomUUID } from "node:crypto"
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs"
import { access, lstat, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { getLegacySandboxRoot, getSandboxRoot } from "../../workspace"

const SAFE_CHAT_ID_REGEX = /^[a-zA-Z0-9_-]+$/
const PERSISTENT_SANDBOX_SEPARATOR = "__"
const transientSandboxPaths = new Set<string>()

const README_CONTENT = `# Mind Flayer Bash Sandbox

This is a persistent sandbox directory created by Mind Flayer for command execution.

- Commands execute with this directory as the working directory (cwd)
- Files created without explicit paths will appear here
- The sandbox is isolated per chat session
- You can access real file system paths via explicit paths in command arguments

Example:
  - "ls" lists files in this sandbox
  - "ls ~/Desktop" lists files on your real Desktop
  - "touch test.txt" creates a file in this sandbox
  - "cat ~/Documents/file.txt" reads from your real Documents folder

Created: ${new Date().toISOString()}
`

function createTemporaryChatId(): string {
  const randomSuffix = randomUUID().replaceAll("-", "").slice(0, 8)
  return `temp-${Date.now()}-${randomSuffix}`
}

function formatTimestampPrefix(date = new Date()): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  const second = String(date.getSeconds()).padStart(2, "0")
  return `${year}${month}${day}-${hour}${minute}${second}`
}

function buildTimestampedSandboxName(chatId: string): string {
  return `${formatTimestampPrefix()}${PERSISTENT_SANDBOX_SEPARATOR}${chatId}`
}

function extractChatIdFromTimestampedSandboxName(sandboxName: string): string | null {
  const separatorIndex = sandboxName.indexOf(PERSISTENT_SANDBOX_SEPARATOR)
  if (separatorIndex < 0) {
    return null
  }

  return sandboxName.slice(separatorIndex + PERSISTENT_SANDBOX_SEPARATOR.length)
}

function assertSandboxPathWithinBase(baseDir: string, sandboxPath: string, chatId: string): void {
  if (sandboxPath === baseDir || sandboxPath.startsWith(`${baseDir}${sep}`)) {
    return
  }

  throw new Error(`Invalid sandbox path for chatId '${chatId}'`)
}

function resolveSandboxPath(baseDir: string, chatId: string): string {
  const sandboxPath = resolve(baseDir, chatId)
  assertSandboxPathWithinBase(baseDir, sandboxPath, chatId)
  return sandboxPath
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function ensurePrimaryBaseDirExists(): Promise<void> {
  await mkdir(getSandboxRoot(), { recursive: true })
}

async function findTimestampedSandboxPaths(baseDir: string, chatId: string): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .filter(entry => extractChatIdFromTimestampedSandboxName(entry.name) === chatId)
      .map(entry => resolveSandboxPath(baseDir, entry.name))
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }
}

function findTimestampedSandboxPathsSync(baseDir: string, chatId: string): string[] {
  if (!existsSync(baseDir)) {
    return []
  }

  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .filter(entry => extractChatIdFromTimestampedSandboxName(entry.name) === chatId)
      .map(entry => resolveSandboxPath(baseDir, entry.name))
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }
}

async function validateReusableSandboxPath(
  baseDir: string,
  sandboxPath: string,
  chatId: string
): Promise<string | null> {
  try {
    const sandboxEntry = await lstat(sandboxPath)
    if (!sandboxEntry.isDirectory() || sandboxEntry.isSymbolicLink()) {
      return null
    }

    const [realBaseDir, realSandboxPath] = await Promise.all([
      realpath(baseDir),
      realpath(sandboxPath)
    ])
    assertSandboxPathWithinBase(realBaseDir, realSandboxPath, chatId)
    return realSandboxPath
  } catch {
    return null
  }
}

function validateReusableSandboxPathSync(
  baseDir: string,
  sandboxPath: string,
  chatId: string
): string | null {
  try {
    const sandboxEntry = lstatSync(sandboxPath)
    if (!sandboxEntry.isDirectory() || sandboxEntry.isSymbolicLink()) {
      return null
    }

    const realBaseDir = realpathSync(baseDir)
    const realSandboxPath = realpathSync(sandboxPath)
    assertSandboxPathWithinBase(realBaseDir, realSandboxPath, chatId)
    return realSandboxPath
  } catch {
    return null
  }
}

async function findExistingPersistentSandboxPath(chatId: string): Promise<string | null> {
  const baseDirectories = [getSandboxRoot(), getLegacySandboxRoot()]

  for (const baseDir of baseDirectories) {
    const legacySandboxPath = resolveSandboxPath(baseDir, chatId)
    const reusableLegacySandboxPath = await validateReusableSandboxPath(
      baseDir,
      legacySandboxPath,
      chatId
    )
    if (reusableLegacySandboxPath) {
      return reusableLegacySandboxPath
    }

    const timestampedPaths = await findTimestampedSandboxPaths(baseDir, chatId)
    if (timestampedPaths.length > 0) {
      return timestampedPaths[0] ?? null
    }
  }

  return null
}

async function listSandboxPathsForChat(chatId: string): Promise<string[]> {
  const sandboxPaths = new Set<string>()
  const baseDirectories = [getSandboxRoot(), getLegacySandboxRoot()]

  for (const baseDir of baseDirectories) {
    const legacySandboxPath = resolveSandboxPath(baseDir, chatId)
    if (await pathExists(legacySandboxPath)) {
      sandboxPaths.add(legacySandboxPath)
    }

    const timestampedPaths = await findTimestampedSandboxPaths(baseDir, chatId)
    for (const sandboxPath of timestampedPaths) {
      sandboxPaths.add(sandboxPath)
    }
  }

  return [...sandboxPaths]
}

/**
 * Ensures a chat-specific sandbox exists and returns its path.
 * @param chatId - Unique identifier for the chat session
 * @returns Absolute path to the sandbox directory
 */
export async function ensureChatSandbox(chatId: string): Promise<string> {
  const isTransient = !chatId
  const effectiveChatId = chatId || createTemporaryChatId()

  if (!SAFE_CHAT_ID_REGEX.test(effectiveChatId)) {
    throw new Error(`Invalid chatId '${effectiveChatId}'`)
  }

  try {
    await ensurePrimaryBaseDirExists()
    const sandboxPath = isTransient
      ? resolveSandboxPath(getSandboxRoot(), effectiveChatId)
      : ((await findExistingPersistentSandboxPath(effectiveChatId)) ??
        resolveSandboxPath(getSandboxRoot(), buildTimestampedSandboxName(effectiveChatId)))
    await mkdir(sandboxPath, { recursive: true })

    const readmePath = join(sandboxPath, "README.md")
    await writeFile(readmePath, README_CONTENT, "utf-8")

    if (isTransient) {
      transientSandboxPaths.add(sandboxPath)
    }

    return sandboxPath
  } catch (error) {
    throw new Error(
      `Failed to create sandbox for chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Cleans up a chat sandbox by deleting it recursively.
 * @param chatId - Unique identifier for the chat session
 */
export async function cleanupSandbox(chatId: string): Promise<void> {
  if (!chatId || !SAFE_CHAT_ID_REGEX.test(chatId)) {
    console.warn(`[BashExec] Refusing to cleanup sandbox with invalid chatId '${chatId}'`)
    return
  }

  let sandboxPaths: string[]
  try {
    sandboxPaths = await listSandboxPathsForChat(chatId)
  } catch (error) {
    console.warn(
      `[BashExec] Refusing to cleanup sandbox for chat '${chatId}': ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return
  }

  for (const sandboxPath of sandboxPaths) {
    try {
      await rm(sandboxPath, { recursive: true, force: true })
      transientSandboxPaths.delete(sandboxPath)
    } catch (error) {
      console.error(
        `[BashExec] Failed to cleanup sandbox ${chatId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
}

/**
 * Cleans up transient sandboxes created without an explicit chatId.
 * This is best-effort and only affects transient directories created by the current process.
 */
export async function cleanupTransientSandboxes(): Promise<void> {
  const sandboxPaths = [...transientSandboxPaths]
  if (sandboxPaths.length === 0) {
    return
  }

  let primaryBaseDir: string | null = null
  try {
    primaryBaseDir = getSandboxRoot()
  } catch (error) {
    console.warn(
      `[BashExec] Failed to resolve base sandbox directory during transient cleanup: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  for (const sandboxPath of sandboxPaths) {
    try {
      if (primaryBaseDir && !sandboxPath.startsWith(`${primaryBaseDir}${sep}`)) {
        console.warn(`[BashExec] Skipping transient cleanup outside base dir: ${sandboxPath}`)
        continue
      }

      await rm(sandboxPath, { recursive: true, force: true })
    } catch (error) {
      console.error(
        `[BashExec] Failed to cleanup transient sandbox ${sandboxPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      transientSandboxPaths.delete(sandboxPath)
    }
  }
}

/**
 * Gets the path to a chat sandbox without creating it.
 * @param chatId - Unique identifier for the chat session
 * @returns Absolute path to the sandbox directory
 */
export function getSandboxPath(chatId: string): string {
  if (!SAFE_CHAT_ID_REGEX.test(chatId)) {
    throw new Error(`Invalid chatId '${chatId}'`)
  }

  for (const baseDir of [getSandboxRoot(), getLegacySandboxRoot()]) {
    const legacySandboxPath = resolveSandboxPath(baseDir, chatId)
    const reusableLegacySandboxPath = existsSync(legacySandboxPath)
      ? validateReusableSandboxPathSync(baseDir, legacySandboxPath, chatId)
      : null
    if (reusableLegacySandboxPath) {
      return reusableLegacySandboxPath
    }

    const timestampedPaths = findTimestampedSandboxPathsSync(baseDir, chatId)
    if (timestampedPaths.length > 0) {
      return timestampedPaths[0] ?? legacySandboxPath
    }
  }

  return resolveSandboxPath(getSandboxRoot(), chatId)
}
