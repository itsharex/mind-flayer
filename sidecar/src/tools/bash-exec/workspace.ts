/**
 * Workspace manager for bash execution session workspaces.
 * Creates and manages isolated directories per chat session.
 */

import { randomUUID } from "node:crypto"
import { existsSync, readdirSync } from "node:fs"
import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"
const WORKSPACES_DIR_NAME = "workspaces"
const SAFE_CHAT_ID_REGEX = /^[a-zA-Z0-9_-]+$/
const PERSISTENT_WORKSPACE_SEPARATOR = "__"
const transientWorkspacePaths = new Set<string>()

const README_CONTENT = `# Mind Flayer Bash Workspace

This is a persistent session workspace directory created by Mind Flayer for command execution.

- Commands execute with this directory as the working directory (cwd)
- Files created without explicit paths will appear here
- Workspace is isolated per chat session
- You can access real file system paths via explicit paths in command arguments

Example:
  - "ls" lists files in this workspace
  - "ls ~/Desktop" lists files on your real Desktop
  - "touch test.txt" creates file in this workspace
  - "cat ~/Documents/file.txt" reads from real Documents folder

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

function buildTimestampedWorkspaceName(chatId: string): string {
  return `${formatTimestampPrefix()}${PERSISTENT_WORKSPACE_SEPARATOR}${chatId}`
}

function extractChatIdFromTimestampedWorkspaceName(workspaceName: string): string | null {
  const separatorIndex = workspaceName.indexOf(PERSISTENT_WORKSPACE_SEPARATOR)
  if (separatorIndex < 0) {
    return null
  }
  return workspaceName.slice(separatorIndex + PERSISTENT_WORKSPACE_SEPARATOR.length)
}

function getBaseDir(): string {
  const appSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
  if (!appSupportDir) {
    throw new Error(`Environment variable '${APP_SUPPORT_DIR_ENV_KEY}' is required`)
  }
  return resolve(appSupportDir, WORKSPACES_DIR_NAME)
}

function assertWorkspacePathWithinBase(
  baseDir: string,
  workspacePath: string,
  chatId: string
): void {
  if (workspacePath === baseDir || workspacePath.startsWith(`${baseDir}${sep}`)) {
    return
  }
  throw new Error(`Invalid workspace path for chatId '${chatId}'`)
}

async function ensureBaseDirExists(baseDir: string): Promise<void> {
  await mkdir(baseDir, { recursive: true })
}

function resolveWorkspacePath(baseDir: string, chatId: string): string {
  const workspacePath = resolve(baseDir, chatId)
  assertWorkspacePathWithinBase(baseDir, workspacePath, chatId)
  return workspacePath
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findTimestampedWorkspacePaths(baseDir: string, chatId: string): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .filter(entry => extractChatIdFromTimestampedWorkspaceName(entry.name) === chatId)
      .map(entry => resolveWorkspacePath(baseDir, entry.name))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function findTimestampedWorkspacePathsSync(baseDir: string, chatId: string): string[] {
  if (!existsSync(baseDir)) {
    return []
  }

  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .filter(entry => extractChatIdFromTimestampedWorkspaceName(entry.name) === chatId)
      .map(entry => resolveWorkspacePath(baseDir, entry.name))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

async function resolvePersistentWorkspacePath(baseDir: string, chatId: string): Promise<string> {
  const legacyWorkspacePath = resolveWorkspacePath(baseDir, chatId)
  if (await pathExists(legacyWorkspacePath)) {
    return legacyWorkspacePath
  }

  const timestampedPaths = await findTimestampedWorkspacePaths(baseDir, chatId)
  if (timestampedPaths.length > 0) {
    return timestampedPaths[0]
  }

  const timestampedWorkspaceName = buildTimestampedWorkspaceName(chatId)
  return resolveWorkspacePath(baseDir, timestampedWorkspaceName)
}

async function listWorkspacePathsForChat(baseDir: string, chatId: string): Promise<string[]> {
  const workspacePaths = new Set<string>()
  const legacyWorkspacePath = resolveWorkspacePath(baseDir, chatId)

  if (await pathExists(legacyWorkspacePath)) {
    workspacePaths.add(legacyWorkspacePath)
  }

  const timestampedPaths = await findTimestampedWorkspacePaths(baseDir, chatId)
  for (const path of timestampedPaths) {
    workspacePaths.add(path)
  }

  return [...workspacePaths]
}

/**
 * Ensures a chat-specific workspace exists and returns its path.
 * @param chatId - Unique identifier for the chat session
 * @returns Absolute path to the workspace directory
 */
export async function ensureChatWorkspace(chatId: string): Promise<string> {
  const isTransient = !chatId
  const effectiveChatId = chatId || createTemporaryChatId()

  if (!SAFE_CHAT_ID_REGEX.test(effectiveChatId)) {
    throw new Error(`Invalid chatId '${effectiveChatId}'`)
  }

  const baseDir = getBaseDir()

  try {
    await ensureBaseDirExists(baseDir)
    const workspacePath = isTransient
      ? resolveWorkspacePath(baseDir, effectiveChatId)
      : await resolvePersistentWorkspacePath(baseDir, effectiveChatId)
    await mkdir(workspacePath, { recursive: true })

    const readmePath = join(workspacePath, "README.md")
    await writeFile(readmePath, README_CONTENT, "utf-8")

    if (isTransient) {
      transientWorkspacePaths.add(workspacePath)
    }

    return workspacePath
  } catch (error) {
    throw new Error(
      `Failed to create workspace for chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Cleans up a chat workspace by deleting it recursively.
 * @param chatId - Unique identifier for the chat session
 */
export async function cleanupWorkspace(chatId: string): Promise<void> {
  if (!chatId || !SAFE_CHAT_ID_REGEX.test(chatId)) {
    console.warn(`[BashExec] Refusing to cleanup workspace with invalid chatId '${chatId}'`)
    return
  }

  let workspacePaths: string[]
  try {
    const baseDir = getBaseDir()
    workspacePaths = await listWorkspacePathsForChat(baseDir, chatId)
  } catch (error) {
    console.warn(
      `[BashExec] Refusing to cleanup workspace for chat '${chatId}': ${error instanceof Error ? error.message : String(error)}`
    )
    return
  }

  for (const workspacePath of workspacePaths) {
    try {
      await rm(workspacePath, { recursive: true, force: true })
      transientWorkspacePaths.delete(workspacePath)
    } catch (error) {
      // Log error but don't throw - cleanup is best-effort
      console.error(
        `[BashExec] Failed to cleanup workspace ${chatId}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

/**
 * Cleans up transient workspaces created without an explicit chatId.
 * This is best-effort and only affects transient directories created by current process.
 */
export async function cleanupTransientWorkspaces(): Promise<void> {
  const workspaces = [...transientWorkspacePaths]
  if (workspaces.length === 0) {
    return
  }

  let baseDir: string | null = null
  try {
    baseDir = getBaseDir()
  } catch (error) {
    console.warn(
      `[BashExec] Failed to resolve base workspace directory during transient cleanup: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  for (const workspacePath of workspaces) {
    try {
      if (baseDir && !workspacePath.startsWith(`${baseDir}${sep}`)) {
        console.warn(`[BashExec] Skipping transient cleanup outside base dir: ${workspacePath}`)
        continue
      }
      await rm(workspacePath, { recursive: true, force: true })
    } catch (error) {
      console.error(
        `[BashExec] Failed to cleanup transient workspace ${workspacePath}: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      transientWorkspacePaths.delete(workspacePath)
    }
  }
}

/**
 * Gets the path to a chat workspace without creating it.
 * @param chatId - Unique identifier for the chat session
 * @returns Absolute path to the workspace directory
 */
export function getWorkspacePath(chatId: string): string {
  if (!SAFE_CHAT_ID_REGEX.test(chatId)) {
    throw new Error(`Invalid chatId '${chatId}'`)
  }

  const baseDir = getBaseDir()
  const legacyWorkspacePath = resolveWorkspacePath(baseDir, chatId)
  if (existsSync(legacyWorkspacePath)) {
    return legacyWorkspacePath
  }

  const timestampedPaths = findTimestampedWorkspacePathsSync(baseDir, chatId)
  if (timestampedPaths.length > 0) {
    return timestampedPaths[0]
  }

  // Fallback path when the workspace has not been created yet.
  return legacyWorkspacePath
}
