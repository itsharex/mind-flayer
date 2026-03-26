import { constants as fsConstants } from "node:fs"
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { dirname, extname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"
const WORKSPACE_DIR_NAME = "workspace"
const SANDBOXES_DIR_NAME = "sandboxes"
const LEGACY_SANDBOXES_DIR_NAME = "workspaces"
const WORKSPACE_STATE_RELATIVE_PATH = "state.json"
const BOOTSTRAP_FILE_NAME = "BOOTSTRAP.md"
const MEMORY_FILE_NAME = "MEMORY.md"
const LEGACY_MEMORY_FILE_NAME = "memory.md"
const MEMORY_DIRECTORY_NAME = "memory"
const WORKSPACE_STATE_VERSION = 1
const WORKSPACE_FILE_CHAR_LIMIT = 20_000
const WORKSPACE_TOTAL_CHAR_LIMIT = 80_000
const TRUNCATION_MARKER = "\n\n[Truncated to fit prompt budget]"

const WRITABLE_ROOT_FILE_NAMES = new Set([
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  BOOTSTRAP_FILE_NAME,
  MEMORY_FILE_NAME,
  LEGACY_MEMORY_FILE_NAME
])

export interface WorkspaceState {
  version: number
  bootstrapSeededAt: number | null
  setupCompletedAt: number | null
}

export interface WorkspaceStatus {
  workspaceDir: string
  needsBootstrap: boolean
  setupCompletedAt: number | null
}

export interface WorkspacePromptFile {
  path: string
  absolutePath: string
  content: string
  truncated: boolean
}

export interface WorkspacePromptContext extends WorkspaceStatus {
  files: WorkspacePromptFile[]
}

export interface MemorySearchResult {
  path: string
  startLine: number
  endLine: number
  snippet: string
  score: number
}

function getAppSupportDir(): string {
  const appSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
  if (!appSupportDir) {
    throw new Error(`Environment variable '${APP_SUPPORT_DIR_ENV_KEY}' is required`)
  }

  return resolve(appSupportDir)
}

export function getAgentWorkspaceRoot(): string {
  return resolve(getAppSupportDir(), WORKSPACE_DIR_NAME)
}

export function getSandboxRoot(): string {
  return resolve(getAppSupportDir(), SANDBOXES_DIR_NAME)
}

export function getLegacySandboxRoot(): string {
  return resolve(getAppSupportDir(), LEGACY_SANDBOXES_DIR_NAME)
}

function getWorkspaceStatePath(): string {
  return resolve(getAgentWorkspaceRoot(), WORKSPACE_STATE_RELATIVE_PATH)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function normalizeIncomingPath(filePath: string): string {
  const trimmedPath = filePath.trim()
  if (!trimmedPath) {
    throw new Error("Path is required")
  }

  if (trimmedPath.startsWith("file://")) {
    return resolve(fileURLToPath(trimmedPath))
  }

  return resolve(trimmedPath)
}

function toWorkspaceRelativePath(candidatePath: string, workspaceRoot: string): string {
  const relativePath = relative(workspaceRoot, candidatePath)

  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Path '${candidatePath}' is outside the agent workspace`)
  }

  return relativePath.replaceAll("\\", "/")
}

async function assertNoSymlinkSegments(path: string, workspaceRoot: string): Promise<void> {
  const relativePath = relative(workspaceRoot, path)
  const pathSegments = relativePath.split(/[/\\]+/).filter(Boolean)
  let currentPath = workspaceRoot

  for (const segment of pathSegments) {
    currentPath = resolve(currentPath, segment)

    try {
      const entry = await lstat(currentPath)
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlink paths are not allowed: '${currentPath}'`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue
      }
      throw error
    }
  }
}

function assertAllowedWorkspaceWritePath(relativePath: string): void {
  if (WRITABLE_ROOT_FILE_NAMES.has(relativePath)) {
    return
  }

  if (relativePath.startsWith(`${MEMORY_DIRECTORY_NAME}/`) && extname(relativePath) === ".md") {
    return
  }

  throw new Error(`Workspace writes are not allowed for '${relativePath}'`)
}

function assertAllowedMemoryPath(relativePath: string): void {
  if (relativePath === MEMORY_FILE_NAME || relativePath === LEGACY_MEMORY_FILE_NAME) {
    return
  }

  if (relativePath.startsWith(`${MEMORY_DIRECTORY_NAME}/`) && extname(relativePath) === ".md") {
    return
  }

  throw new Error(`Memory access is not allowed for '${relativePath}'`)
}

async function resolveWorkspacePath(
  filePath: string,
  options: {
    mode: "write" | "memory"
  }
): Promise<{ absolutePath: string; relativePath: string; workspaceRoot: string }> {
  const workspaceRoot = getAgentWorkspaceRoot()
  await mkdir(workspaceRoot, { recursive: true })
  const realWorkspaceRoot = await realpath(workspaceRoot)
  const candidatePath =
    isAbsolute(filePath.trim()) || filePath.trim().startsWith("file://")
      ? normalizeIncomingPath(filePath)
      : resolve(realWorkspaceRoot, filePath.trim())
  const relativePath = toWorkspaceRelativePath(candidatePath, realWorkspaceRoot)

  if (options.mode === "write") {
    assertAllowedWorkspaceWritePath(relativePath)
  } else {
    assertAllowedMemoryPath(relativePath)
  }

  await assertNoSymlinkSegments(candidatePath, realWorkspaceRoot)

  return {
    absolutePath: candidatePath,
    relativePath,
    workspaceRoot: realWorkspaceRoot
  }
}

export async function getWorkspaceState(): Promise<WorkspaceState> {
  const statePath = getWorkspaceStatePath()
  if (!(await pathExists(statePath))) {
    return {
      version: WORKSPACE_STATE_VERSION,
      bootstrapSeededAt: null,
      setupCompletedAt: null
    }
  }

  try {
    const rawState = await readFile(statePath, "utf8")
    const parsedState = JSON.parse(rawState) as Partial<WorkspaceState>

    return {
      version:
        typeof parsedState.version === "number" ? parsedState.version : WORKSPACE_STATE_VERSION,
      bootstrapSeededAt:
        typeof parsedState.bootstrapSeededAt === "number" ? parsedState.bootstrapSeededAt : null,
      setupCompletedAt:
        typeof parsedState.setupCompletedAt === "number" ? parsedState.setupCompletedAt : null
    }
  } catch (error) {
    console.warn(
      `[Workspace] Failed to read workspace state '${statePath}', using defaults: ${
        error instanceof Error ? error.message : String(error)
      }`
    )

    return {
      version: WORKSPACE_STATE_VERSION,
      bootstrapSeededAt: null,
      setupCompletedAt: null
    }
  }
}

async function writeWorkspaceState(state: WorkspaceState): Promise<void> {
  const statePath = getWorkspaceStatePath()
  await mkdir(getAgentWorkspaceRoot(), { recursive: true })
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8")
}

export async function markBootstrapCompleted(): Promise<void> {
  const state = await getWorkspaceState()
  await writeWorkspaceState({
    ...state,
    version: WORKSPACE_STATE_VERSION,
    setupCompletedAt: Date.now()
  })
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) {
    return null
  }

  const entryInfo = await lstat(filePath)
  if (entryInfo.isSymbolicLink()) {
    return null
  }

  const fileStats = await stat(filePath)
  if (!fileStats.isFile()) {
    return null
  }

  return readFile(filePath, "utf8")
}

async function resolveExactWorkspaceFileName(
  workspaceRoot: string,
  candidateFileNames: readonly string[]
): Promise<string | null> {
  if (!(await pathExists(workspaceRoot))) {
    return null
  }

  const entries = await readdir(workspaceRoot, { withFileTypes: true })
  for (const candidateFileName of candidateFileNames) {
    const matchedEntry = entries.find(
      entry => entry.isFile() && entry.name === candidateFileName && !entry.isSymbolicLink()
    )
    if (matchedEntry) {
      return matchedEntry.name
    }
  }

  return null
}

function truncateWorkspaceContent(
  content: string,
  limit: number
): {
  content: string
  truncated: boolean
} {
  if (content.length <= limit) {
    return {
      content,
      truncated: false
    }
  }

  if (limit <= TRUNCATION_MARKER.length) {
    return {
      content: TRUNCATION_MARKER.slice(0, limit),
      truncated: true
    }
  }

  return {
    content: `${content.slice(0, limit - TRUNCATION_MARKER.length).trimEnd()}${TRUNCATION_MARKER}`,
    truncated: true
  }
}

async function resolveLongTermMemoryFileName(workspaceRoot: string): Promise<string | null> {
  return resolveExactWorkspaceFileName(workspaceRoot, [MEMORY_FILE_NAME, LEGACY_MEMORY_FILE_NAME])
}

export async function getWorkspaceStatus(): Promise<WorkspaceStatus> {
  const workspaceDir = getAgentWorkspaceRoot()
  const bootstrapPath = resolve(workspaceDir, BOOTSTRAP_FILE_NAME)
  const [state, bootstrapContent] = await Promise.all([
    getWorkspaceState(),
    readTextFileIfExists(bootstrapPath)
  ])

  return {
    workspaceDir,
    needsBootstrap: bootstrapContent !== null,
    setupCompletedAt: state.setupCompletedAt
  }
}

export async function loadWorkspacePromptContext(): Promise<WorkspacePromptContext> {
  const workspaceDir = getAgentWorkspaceRoot()
  const status = await getWorkspaceStatus()
  const longTermMemoryFileName = await resolveLongTermMemoryFileName(workspaceDir)
  const candidateFiles = [
    "AGENTS.md",
    "SOUL.md",
    "IDENTITY.md",
    "USER.md",
    status.needsBootstrap ? BOOTSTRAP_FILE_NAME : null,
    longTermMemoryFileName
  ].filter((value): value is string => Boolean(value))

  let remainingBudget = WORKSPACE_TOTAL_CHAR_LIMIT
  const files: WorkspacePromptFile[] = []

  for (const relativeFilePath of candidateFiles) {
    if (remainingBudget <= 0) {
      break
    }

    const absolutePath = resolve(workspaceDir, relativeFilePath)
    const rawContent = await readTextFileIfExists(absolutePath)
    if (rawContent === null) {
      continue
    }

    const fileBudget = Math.min(WORKSPACE_FILE_CHAR_LIMIT, remainingBudget)
    const truncatedContent = truncateWorkspaceContent(rawContent, fileBudget)
    const injectedContent = truncatedContent.content || "(empty file)"

    files.push({
      path: relativeFilePath,
      absolutePath,
      content: injectedContent,
      truncated: truncatedContent.truncated
    })

    remainingBudget -= injectedContent.length
  }

  return {
    ...status,
    files
  }
}

async function listMemoryFiles(): Promise<
  Array<{ relativePath: string; absolutePath: string; modifiedAt: number }>
> {
  const workspaceRoot = getAgentWorkspaceRoot()
  const files: Array<{ relativePath: string; absolutePath: string; modifiedAt: number }> = []
  const longTermMemoryFileName = await resolveLongTermMemoryFileName(workspaceRoot)

  if (longTermMemoryFileName) {
    const absolutePath = resolve(workspaceRoot, longTermMemoryFileName)
    const fileStats = await stat(absolutePath)
    files.push({
      relativePath: longTermMemoryFileName,
      absolutePath,
      modifiedAt: fileStats.mtimeMs
    })
  }

  const memoryRoot = resolve(workspaceRoot, MEMORY_DIRECTORY_NAME)
  if (!(await pathExists(memoryRoot))) {
    return files
  }

  const pendingDirectories = [memoryRoot]
  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop()
    if (!currentDirectory) {
      continue
    }

    const entries = await readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = resolve(currentDirectory, entry.name)

      if (entry.isDirectory()) {
        pendingDirectories.push(absolutePath)
        continue
      }

      if (!entry.isFile() || extname(entry.name) !== ".md") {
        continue
      }

      const fileStats = await stat(absolutePath)
      files.push({
        relativePath: toWorkspaceRelativePath(absolutePath, workspaceRoot),
        absolutePath,
        modifiedAt: fileStats.mtimeMs
      })
    }
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return files
}

function tokenizeText(value: string): string[] {
  const normalized = value.toLowerCase().trim()
  if (!normalized) {
    return []
  }

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" })
    return Array.from(segmenter.segment(normalized))
      .map(segment => segment.segment.trim())
      .filter(segment => Boolean(segment) && /[\p{L}\p{N}]/u.test(segment))
  }

  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function scoreSnippet(
  query: string,
  queryTokens: string[],
  windowText: string,
  centerText: string
): number {
  const normalizedWindowText = windowText.toLowerCase()
  const normalizedCenterText = centerText.toLowerCase()
  let score = 0

  if (query && normalizedWindowText.includes(query)) {
    score += 120
  }

  if (query && normalizedCenterText.includes(query)) {
    score += 160
  }

  if (queryTokens.length === 0) {
    return score
  }

  const windowTokens = new Set(tokenizeText(normalizedWindowText))
  const centerTokens = new Set(tokenizeText(normalizedCenterText))

  for (const token of queryTokens) {
    if (centerTokens.has(token)) {
      score += 24
      continue
    }

    if (windowTokens.has(token)) {
      score += 12
    }
  }

  return score
}

export async function searchMemory(query: string, maxResults = 5): Promise<MemorySearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return []
  }

  const queryTokens = tokenizeText(normalizedQuery)
  const memoryFiles = await listMemoryFiles()
  const candidates: Array<MemorySearchResult & { modifiedAt: number }> = []

  for (const memoryFile of memoryFiles) {
    const rawContent = await readTextFileIfExists(memoryFile.absolutePath)
    if (rawContent === null) {
      continue
    }

    const lines = rawContent.split(/\r?\n/)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const startLine = Math.max(1, lineIndex)
      const endLine = Math.min(lines.length, lineIndex + 3)
      const windowLines = lines.slice(startLine - 1, endLine)
      const centerText = lines[lineIndex] ?? ""
      const snippet = windowLines.join("\n").trim()
      const score = scoreSnippet(normalizedQuery, queryTokens, snippet, centerText)

      if (score <= 0) {
        continue
      }

      candidates.push({
        path: memoryFile.relativePath,
        startLine,
        endLine,
        snippet,
        score,
        modifiedAt: memoryFile.modifiedAt
      })
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return right.modifiedAt - left.modifiedAt
  })

  return candidates
    .slice(0, Math.max(1, Math.min(maxResults, 20)))
    .map(({ modifiedAt, ...result }) => result)
}

export async function getMemoryFile(
  filePath: string,
  options?: {
    startLine?: number
    endLine?: number
  }
): Promise<{
  path: string
  absolutePath: string
  exists: boolean
  content: string
  startLine: number | null
  endLine: number | null
}> {
  const { absolutePath, relativePath } = await resolveWorkspacePath(filePath, { mode: "memory" })
  const rawContent = await readTextFileIfExists(absolutePath)

  if (rawContent === null) {
    return {
      path: relativePath,
      absolutePath,
      exists: false,
      content: "",
      startLine: null,
      endLine: null
    }
  }

  if (options?.startLine === undefined && options?.endLine === undefined) {
    return {
      path: relativePath,
      absolutePath,
      exists: true,
      content: rawContent,
      startLine: 1,
      endLine: rawContent ? rawContent.split(/\r?\n/).length : 1
    }
  }

  const lines = rawContent.split(/\r?\n/)
  const startLine = Math.max(1, options?.startLine ?? 1)
  const endLine = Math.max(startLine, options?.endLine ?? startLine)

  return {
    path: relativePath,
    absolutePath,
    exists: true,
    content: lines.slice(startLine - 1, endLine).join("\n"),
    startLine,
    endLine: Math.min(endLine, lines.length)
  }
}

export async function writeWorkspaceTextFile(input: {
  path: string
  operation: "write" | "append" | "delete"
  content?: string
}): Promise<{
  path: string
  absolutePath: string
  operation: "write" | "append" | "delete"
  bytesWritten: number
}> {
  const { absolutePath, relativePath, workspaceRoot } = await resolveWorkspacePath(input.path, {
    mode: "write"
  })
  const parentDirectory = dirname(absolutePath)
  await mkdir(parentDirectory, { recursive: true })
  await assertNoSymlinkSegments(absolutePath, workspaceRoot)

  if (input.operation === "delete") {
    const exists = await pathExists(absolutePath)
    if (exists) {
      const entry = await lstat(absolutePath)
      if (entry.isDirectory()) {
        throw new Error(`Workspace path '${relativePath}' is a directory`)
      }
      await rm(absolutePath, { force: true })
    }

    if (relativePath === BOOTSTRAP_FILE_NAME) {
      await markBootstrapCompleted()
    }

    return {
      path: relativePath,
      absolutePath,
      operation: input.operation,
      bytesWritten: 0
    }
  }

  if (typeof input.content !== "string") {
    throw new Error(`Content is required for ${input.operation}`)
  }

  const existingEntry = (await pathExists(absolutePath)) ? await lstat(absolutePath) : null
  if (existingEntry?.isDirectory()) {
    throw new Error(`Workspace path '${relativePath}' is a directory`)
  }

  if (input.operation === "write") {
    await writeFile(absolutePath, input.content, "utf8")
  } else {
    const existingContent = (await readTextFileIfExists(absolutePath)) ?? ""
    await writeFile(absolutePath, `${existingContent}${input.content}`, "utf8")
  }

  return {
    path: relativePath,
    absolutePath,
    operation: input.operation,
    bytesWritten: Buffer.byteLength(input.content, "utf8")
  }
}
