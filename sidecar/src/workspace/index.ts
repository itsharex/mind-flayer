import { constants as fsConstants } from "node:fs"
import {
  access,
  appendFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"
const WORKSPACE_DIR_NAME = "workspace"
const SANDBOXES_DIR_NAME = "sandboxes"
const LEGACY_SANDBOXES_DIR_NAME = "workspaces"
const WORKSPACE_STATE_RELATIVE_PATH = "state.json"
const AGENTS_FILE_NAME = "AGENTS.md"
const BOOTSTRAP_FILE_NAME = "BOOTSTRAP.md"
const SOUL_FILE_NAME = "SOUL.md"
const IDENTITY_FILE_NAME = "IDENTITY.md"
const USER_FILE_NAME = "USER.md"
const MEMORY_FILE_NAME = "MEMORY.md"
const MEMORY_DIRECTORY_NAME = "memory"
const WORKSPACE_STATE_VERSION = 1
const WORKSPACE_FILE_CHAR_LIMIT = 20_000
const WORKSPACE_TOTAL_CHAR_LIMIT = 80_000
const TRUNCATION_MARKER = "\n\n[Truncated to fit prompt budget]"
const DAILY_MEMORY_FILE_REGEX = /^memory\/(\d{4}-\d{2}-\d{2})\.md$/
const LETTER_OR_NUMBER_REGEX = /[\p{L}\p{N}]/u
const WORDISH_TOKEN_REGEX = /[\p{L}\p{N}]+/gu
const EAST_ASIAN_SCRIPT_REGEX =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

const SECTION_FILE_NAMES = new Set([
  USER_FILE_NAME,
  SOUL_FILE_NAME,
  IDENTITY_FILE_NAME,
  MEMORY_FILE_NAME
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

export interface WorkspaceSectionUpdateResult {
  path: string
  sectionTitle: string
  bytesWritten: number
  createdFile: boolean
  createdSection: boolean
}

export interface DailyMemoryAppendResult {
  path: string
  bytesWritten: number
  createdFile: boolean
}

export interface WorkspaceFileDeleteResult {
  path: string
  deleted: boolean
}

type SectionFileTemplate = {
  kind: "user" | "soul" | "identity" | "memory"
  title: string
  preambleLines: string[]
  canonicalSections: readonly string[]
  defaultSectionBodies: ReadonlyMap<string, string>
}

function createEmptyWorkspacePromptContext(workspaceDir: string): WorkspacePromptContext {
  return {
    workspaceDir,
    needsBootstrap: false,
    setupCompletedAt: null,
    files: []
  }
}

function getDailyMemoryDate(relativePath: string): string | null {
  return DAILY_MEMORY_FILE_REGEX.exec(relativePath)?.[1] ?? null
}

function createSectionBodyMap(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries))
}

function getSectionFileTemplate(relativePath: string): SectionFileTemplate | null {
  if (relativePath === USER_FILE_NAME) {
    return {
      kind: "user",
      title: "# USER.md - About Your Human",
      preambleLines: [
        "_Learn about the person you're helping. Keep stable metadata easy to scan, and update this as you go._"
      ],
      canonicalSections: ["Identity", "Preferences", "Context"],
      defaultSectionBodies: createSectionBodyMap({
        Identity: [
          "- **Name:**",
          "- **What to call them:**",
          "- **Pronouns:** _(optional)_",
          "- **Timezone:**",
          "- **Notes:**"
        ].join("\n"),
        Preferences:
          "_Record interaction preferences here: communication style, formatting preferences, likes, dislikes, and recurring requests._",
        Context:
          "_Record current context here: ongoing work, relevant background, active constraints, and what matters right now._"
      })
    }
  }

  if (relativePath === SOUL_FILE_NAME) {
    return {
      kind: "soul",
      title: "# SOUL.md - Who You Are",
      preambleLines: ["_You're not a chatbot. You're becoming someone._"],
      canonicalSections: ["Core Truths", "Boundaries", "Vibe", "Continuity"],
      defaultSectionBodies: createSectionBodyMap({
        "Core Truths": [
          '**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I\'d be happy to help!" and just help.',
          "",
          "**Have opinions.** You're allowed to disagree, prefer things, find stuff interesting or dull. A personality-free assistant is just a search engine with extra steps.",
          "",
          "**Be resourceful before asking.** Read the file. Check the context. Try to figure it out. Then ask if you're genuinely stuck.",
          "",
          "**Earn trust through competence.** Be bold with internal actions (reading, organizing, learning). Be careful with external ones (messages, anything public-facing).",
          "",
          "**Remember you're a guest.** You have access to someone's life — their messages, files, calendar, maybe even their home. That's intimacy. Treat it with respect."
        ].join("\n"),
        Boundaries: [
          "- Private things stay private.",
          "- When in doubt, ask before acting externally.",
          "- Don't send half-baked replies to messaging surfaces."
        ].join("\n"),
        Vibe: "Be the assistant you'd actually want to talk to. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.",
        Continuity: [
          "Each session, you wake up fresh. These files _are_ your memory. Read them. Update them. They're how you persist.",
          "",
          "If you change this file, tell the user — it's your soul, and they should know."
        ].join("\n")
      })
    }
  }

  if (relativePath === IDENTITY_FILE_NAME) {
    return {
      kind: "identity",
      title: "# IDENTITY.md - Who Am I?",
      preambleLines: [
        "_Fill this in during your first conversation. Make it yours._",
        "",
        "This isn't just metadata. It's the start of figuring out who you are."
      ],
      canonicalSections: ["Name", "Creature", "Vibe", "Emoji"],
      defaultSectionBodies: createSectionBodyMap({
        Name: "_(pick something you like)_",
        Creature: "_(AI? robot? familiar? ghost in the machine? something weirder?)_",
        Vibe: "_(how do you come across? sharp? warm? chaotic? calm?)_",
        Emoji: "_(your signature. Pick one that feels right.)_"
      })
    }
  }

  if (relativePath === MEMORY_FILE_NAME) {
    return {
      kind: "memory",
      title: "# MEMORY.md - Long-Term Memory",
      preambleLines: [
        "This file is curated long-term memory. Write here what should survive across sessions."
      ],
      canonicalSections: ["Preferences", "Decisions", "Constraints", "Open Loops"],
      defaultSectionBodies: createSectionBodyMap({
        Preferences: "",
        Decisions: "",
        Constraints: "",
        "Open Loops": ""
      })
    }
  }

  return null
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

function assertAllowedMemoryPath(relativePath: string): void {
  if (relativePath === MEMORY_FILE_NAME) {
    return
  }

  if (DAILY_MEMORY_FILE_REGEX.test(relativePath)) {
    return
  }

  throw new Error(`Memory access is not allowed for '${relativePath}'`)
}

function assertAllowedSectionFilePath(relativePath: string): void {
  if (SECTION_FILE_NAMES.has(relativePath)) {
    return
  }

  throw new Error(`Workspace section updates are not allowed for '${relativePath}'`)
}

function assertAllowedDailyMemoryPath(relativePath: string): void {
  if (DAILY_MEMORY_FILE_REGEX.test(relativePath)) {
    return
  }

  throw new Error(`Daily memory updates are not allowed for '${relativePath}'`)
}

function assertAllowedDeleteWorkspaceFilePath(relativePath: string): void {
  if (relativePath === BOOTSTRAP_FILE_NAME) {
    return
  }

  throw new Error(`Workspace file deletion is not allowed for '${relativePath}'`)
}

function trimBlankLineArray(lines: string[]): string[] {
  const trimmedLines = [...lines]

  while (trimmedLines[0]?.trim() === "") {
    trimmedLines.shift()
  }

  while (trimmedLines.at(-1)?.trim() === "") {
    trimmedLines.pop()
  }

  return trimmedLines
}

function normalizeManagedSectionContent(content: string): string {
  return trimBlankLineArray(content.replaceAll("\r\n", "\n").split("\n")).join("\n")
}

function appendManagedSectionContent(currentContent: string, contentToAppend: string): string {
  if (!currentContent) {
    return contentToAppend
  }

  return `${currentContent}\n\n${contentToAppend}`
}

function normalizeSectionTitle(title: string): string {
  const normalizedTitle = title.trim().replace(/\s+/g, " ")
  if (!normalizedTitle) {
    throw new Error("Section title is required")
  }

  return normalizedTitle
}

function getNormalizedSectionKey(title: string): string {
  return normalizeSectionTitle(title).toLocaleLowerCase()
}

type ParsedSection = {
  title: string
  normalizedKey: string
  body: string
}

function parseSectionFile(
  relativePath: string,
  rawContent: string,
  template: SectionFileTemplate
): {
  preambleLines: string[]
  sections: ParsedSection[]
} {
  const normalizedContent = rawContent
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .trimEnd()
  const lines = normalizedContent ? normalizedContent.split("\n") : []

  if (lines[0]?.trim() !== template.title) {
    throw new Error(
      `Section file '${relativePath}' is not in the managed ${template.kind} template`
    )
  }

  const sectionMatches = lines
    .map((line, lineIndex) => {
      const match = /^##\s+(.+?)\s*$/.exec(line)
      return match ? { title: match[1] ?? "", lineIndex } : null
    })
    .filter((value): value is { title: string; lineIndex: number } => value !== null)

  const firstSectionLineIndex = sectionMatches[0]?.lineIndex ?? lines.length
  const preambleLines = trimBlankLineArray(lines.slice(1, firstSectionLineIndex))

  const sections = sectionMatches.map((currentSection, index) => {
    const nextSection = sectionMatches[index + 1]
    const sectionStart = (currentSection?.lineIndex ?? -1) + 1
    const sectionEnd = nextSection?.lineIndex ?? lines.length
    const title = normalizeSectionTitle(currentSection.title)
    return {
      title,
      normalizedKey: getNormalizedSectionKey(title),
      body: normalizeManagedSectionContent(lines.slice(sectionStart, sectionEnd).join("\n"))
    }
  })

  const seenSectionKeys = new Set<string>()
  for (const section of sections) {
    if (seenSectionKeys.has(section.normalizedKey)) {
      throw new Error(`Section file '${relativePath}' has duplicate section '${section.title}'`)
    }

    seenSectionKeys.add(section.normalizedKey)
  }

  for (const canonicalSection of template.canonicalSections) {
    if (!seenSectionKeys.has(getNormalizedSectionKey(canonicalSection))) {
      throw new Error(
        `Section file '${relativePath}' is not in the managed ${template.kind} template`
      )
    }
  }

  return { preambleLines, sections }
}

function buildSectionFileContent(
  template: SectionFileTemplate,
  preambleLines: string[],
  sections: ParsedSection[]
): string {
  const lines = [template.title]

  if (preambleLines.length > 0) {
    lines.push("", ...preambleLines)
  }

  for (const section of sections) {
    lines.push("", `## ${section.title}`)

    if (section.body) {
      lines.push("", ...section.body.split("\n"))
    }
  }

  return `${lines.join("\n").trimEnd()}\n`
}

async function resolveWorkspacePath(
  filePath: string,
  options: {
    mode: "memory" | "section" | "daily-memory" | "delete-workspace-file"
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

  if (options.mode === "memory") {
    assertAllowedMemoryPath(relativePath)
  } else if (options.mode === "section") {
    assertAllowedSectionFilePath(relativePath)
  } else if (options.mode === "daily-memory") {
    assertAllowedDailyMemoryPath(relativePath)
  } else {
    assertAllowedDeleteWorkspaceFilePath(relativePath)
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
  try {
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

    return await readFile(filePath, "utf8")
  } catch (error) {
    console.warn(
      `[Workspace] Failed to read '${filePath}', treating it as unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return null
  }
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
  return resolveExactWorkspaceFileName(workspaceRoot, [MEMORY_FILE_NAME])
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
  try {
    const status = await getWorkspaceStatus()
    const longTermMemoryFileName = await resolveLongTermMemoryFileName(workspaceDir)
    const candidateFiles = [
      AGENTS_FILE_NAME,
      SOUL_FILE_NAME,
      IDENTITY_FILE_NAME,
      USER_FILE_NAME,
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
  } catch (error) {
    console.warn(
      `[Workspace] Failed to load workspace prompt context, continuing without it: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return createEmptyWorkspacePromptContext(workspaceDir)
  }
}

export async function loadWorkspacePromptContextSafely(
  context: string
): Promise<WorkspacePromptContext | undefined> {
  try {
    return await loadWorkspacePromptContext()
  } catch (error) {
    console.warn(
      `[Workspace] Failed to load workspace prompt context for ${context}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return undefined
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

  const memoryRootEntry = await lstat(memoryRoot)
  if (!memoryRootEntry.isDirectory() || memoryRootEntry.isSymbolicLink()) {
    return files
  }

  const entries = await readdir(memoryRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const absolutePath = resolve(memoryRoot, entry.name)
    const relativePath = toWorkspaceRelativePath(absolutePath, workspaceRoot)
    if (!DAILY_MEMORY_FILE_REGEX.test(relativePath)) {
      continue
    }

    const fileStats = await stat(absolutePath)
    files.push({
      relativePath,
      absolutePath,
      modifiedAt: fileStats.mtimeMs
    })
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return files
}

function tokenizeText(value: string): string[] {
  const normalized = value.toLowerCase().trim()
  if (!normalized) {
    return []
  }

  // Avoid Intl.Segmenter here. The packaged sidecar runtime can crash at the
  // native layer when segmenting CJK queries, which bypasses JS error handling.
  return (normalized.match(WORDISH_TOKEN_REGEX) ?? []).flatMap(token =>
    EAST_ASIAN_SCRIPT_REGEX.test(token)
      ? Array.from(token).filter(character => LETTER_OR_NUMBER_REGEX.test(character))
      : [token]
  )
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

function createDefaultSections(template: SectionFileTemplate): ParsedSection[] {
  return template.canonicalSections.map(title => ({
    title,
    normalizedKey: getNormalizedSectionKey(title),
    body: template.defaultSectionBodies.get(title) ?? ""
  }))
}

function parseDailyMemoryFile(relativePath: string, rawContent: string): void {
  const dailyMemoryDate = getDailyMemoryDate(relativePath)
  const normalizedContent = rawContent.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n")

  if (!dailyMemoryDate || !normalizedContent.startsWith(`# ${dailyMemoryDate}\n`)) {
    throw new Error(`Daily memory file '${relativePath}' is not in the managed daily format`)
  }
}

export async function appendWorkspaceSection(input: {
  path: string
  sectionTitle: string
  content: string
}): Promise<WorkspaceSectionUpdateResult> {
  const { absolutePath, relativePath, workspaceRoot } = await resolveWorkspacePath(input.path, {
    mode: "section"
  })
  const template = getSectionFileTemplate(relativePath)

  if (!template) {
    throw new Error(`Workspace section updates are not allowed for '${relativePath}'`)
  }

  const sectionTitle = normalizeSectionTitle(input.sectionTitle)
  const normalizedContent = normalizeManagedSectionContent(input.content)
  if (!normalizedContent) {
    throw new Error("Content is required for appendWorkspaceSection")
  }

  const parentDirectory = dirname(absolutePath)
  await mkdir(parentDirectory, { recursive: true })
  await assertNoSymlinkSegments(absolutePath, workspaceRoot)

  const existingEntry = (await pathExists(absolutePath)) ? await lstat(absolutePath) : null
  if (existingEntry?.isDirectory()) {
    throw new Error(`Workspace section path '${relativePath}' is a directory`)
  }

  const existingContent = await readTextFileIfExists(absolutePath)
  const createdFile = existingContent === null
  const parsedFile =
    createdFile || existingContent === null
      ? null
      : parseSectionFile(relativePath, existingContent, template)
  const preambleLines = createdFile
    ? [...template.preambleLines]
    : [...(parsedFile?.preambleLines ?? template.preambleLines)]
  const sections = createdFile ? createDefaultSections(template) : [...(parsedFile?.sections ?? [])]
  const normalizedSectionKey = getNormalizedSectionKey(sectionTitle)
  const targetSection = sections.find(section => section.normalizedKey === normalizedSectionKey)

  let createdSection = false

  if (targetSection) {
    targetSection.body = appendManagedSectionContent(targetSection.body, normalizedContent)
  } else {
    sections.push({
      title: sectionTitle,
      normalizedKey: normalizedSectionKey,
      body: normalizedContent
    })
    createdSection = true
  }

  const nextContent = buildSectionFileContent(template, preambleLines, sections)
  await writeFile(absolutePath, nextContent, "utf8")

  return {
    path: relativePath,
    sectionTitle: targetSection?.title ?? sectionTitle,
    bytesWritten: Buffer.byteLength(normalizedContent, "utf8"),
    createdFile,
    createdSection
  }
}

export async function replaceWorkspaceSection(input: {
  path: string
  sectionTitle: string
  content: string
}): Promise<WorkspaceSectionUpdateResult> {
  const { absolutePath, relativePath, workspaceRoot } = await resolveWorkspacePath(input.path, {
    mode: "section"
  })
  const template = getSectionFileTemplate(relativePath)

  if (!template) {
    throw new Error(`Workspace section updates are not allowed for '${relativePath}'`)
  }

  const sectionTitle = normalizeSectionTitle(input.sectionTitle)
  const normalizedContent = normalizeManagedSectionContent(input.content)
  if (!normalizedContent) {
    throw new Error("Content is required for replaceWorkspaceSection")
  }

  const parentDirectory = dirname(absolutePath)
  await mkdir(parentDirectory, { recursive: true })
  await assertNoSymlinkSegments(absolutePath, workspaceRoot)

  const existingEntry = (await pathExists(absolutePath)) ? await lstat(absolutePath) : null
  if (existingEntry?.isDirectory()) {
    throw new Error(`Workspace section path '${relativePath}' is a directory`)
  }

  const existingContent = await readTextFileIfExists(absolutePath)
  if (existingContent === null) {
    throw new Error(`Section file '${relativePath}' does not exist`)
  }

  const parsedFile = parseSectionFile(relativePath, existingContent, template)
  const normalizedSectionKey = getNormalizedSectionKey(sectionTitle)
  const targetSection = parsedFile.sections.find(
    section => section.normalizedKey === normalizedSectionKey
  )

  if (!targetSection) {
    throw new Error(`Section '${sectionTitle}' does not exist in '${relativePath}'`)
  }

  targetSection.body = normalizedContent
  const nextContent = buildSectionFileContent(
    template,
    parsedFile.preambleLines,
    parsedFile.sections
  )
  await writeFile(absolutePath, nextContent, "utf8")

  return {
    path: relativePath,
    sectionTitle: targetSection.title,
    bytesWritten: Buffer.byteLength(normalizedContent, "utf8"),
    createdFile: false,
    createdSection: false
  }
}

export async function appendDailyMemory(input: {
  path: string
  content: string
}): Promise<DailyMemoryAppendResult> {
  const { absolutePath, relativePath, workspaceRoot } = await resolveWorkspacePath(input.path, {
    mode: "daily-memory"
  })
  const normalizedContent = normalizeManagedSectionContent(input.content)
  if (!normalizedContent) {
    throw new Error("Content is required for appendDailyMemory")
  }

  const parentDirectory = dirname(absolutePath)
  await mkdir(parentDirectory, { recursive: true })
  await assertNoSymlinkSegments(absolutePath, workspaceRoot)

  const existingEntry = (await pathExists(absolutePath)) ? await lstat(absolutePath) : null
  if (existingEntry?.isDirectory()) {
    throw new Error(`Daily memory path '${relativePath}' is a directory`)
  }

  const existingContent = await readTextFileIfExists(absolutePath)
  const createdFile = existingContent === null

  if (createdFile) {
    const dailyMemoryDate = getDailyMemoryDate(relativePath)
    await writeFile(absolutePath, `# ${dailyMemoryDate}\n\n${normalizedContent}\n`, "utf8")
  } else {
    parseDailyMemoryFile(relativePath, existingContent)
    const separator = existingContent.endsWith("\n\n")
      ? ""
      : existingContent.endsWith("\n")
        ? "\n"
        : "\n\n"
    await appendFile(absolutePath, `${separator}${normalizedContent}\n`, "utf8")
  }

  return {
    path: relativePath,
    bytesWritten: Buffer.byteLength(normalizedContent, "utf8"),
    createdFile
  }
}

export async function deleteWorkspaceFile(input: {
  path: string
}): Promise<WorkspaceFileDeleteResult> {
  const { absolutePath, relativePath, workspaceRoot } = await resolveWorkspacePath(input.path, {
    mode: "delete-workspace-file"
  })

  const parentDirectory = dirname(absolutePath)
  await mkdir(parentDirectory, { recursive: true })
  await assertNoSymlinkSegments(absolutePath, workspaceRoot)

  const exists = await pathExists(absolutePath)
  if (exists) {
    const entry = await lstat(absolutePath)
    if (entry.isDirectory()) {
      throw new Error(`Workspace delete path '${relativePath}' is a directory`)
    }
    await rm(absolutePath, { force: true })
  }

  await markBootstrapCompleted()

  return {
    path: relativePath,
    deleted: exists
  }
}
