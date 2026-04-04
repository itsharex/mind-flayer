import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { inspect } from "node:util"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"
const LOG_DIR_NAME = "logs"
const SIDECAR_LOG_FILE_NAME = "sidecar.log"
const SIDECAR_PREVIOUS_LOG_FILE_NAME = "sidecar.previous.log"
const MAX_LOG_FILE_SIZE_BYTES = 5 * 1024 * 1024

let loggerInitialized = false

type ConsoleMethodName = "debug" | "info" | "log" | "warn" | "error"

const LOW_FREQUENCY_LOG_PREFIXES = [
  "[sidecar] File logging initialized at",
  "[sidecar] Global HTTP proxy enabled:",
  "Sidecar running on http://localhost:",
  "API endpoint: http://localhost:",
  "Shutting down gracefully...",
  "Server closed, port released",
  "Sidecar process exiting..."
] as const

function serializeLogArgs(args: unknown[]): string {
  return args
    .map(arg => {
      if (typeof arg === "string") {
        return arg
      }

      return inspect(arg, {
        depth: 8,
        breakLength: Infinity,
        compact: false,
        colors: false
      })
    })
    .join(" ")
}

function resolveSidecarLogFilePath(): string | null {
  const appSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]?.trim()
  if (!appSupportDir) {
    return null
  }

  return resolve(appSupportDir, LOG_DIR_NAME, SIDECAR_LOG_FILE_NAME)
}

function rotateLogFileIfNeeded(logFilePath: string): void {
  if (!existsSync(logFilePath)) {
    return
  }

  const stats = statSync(logFilePath)
  if (stats.size < MAX_LOG_FILE_SIZE_BYTES) {
    return
  }

  const previousLogFilePath = resolve(dirname(logFilePath), SIDECAR_PREVIOUS_LOG_FILE_NAME)
  rmSync(previousLogFilePath, { force: true })
  renameSync(logFilePath, previousLogFilePath)
}

function appendLogLine(logFilePath: string, line: string, originalError: Console["error"]): void {
  try {
    appendFileSync(logFilePath, `${line}\n`, "utf8")
  } catch (error) {
    originalError("[sidecar] Failed to write log file:", error)
  }
}

function shouldPersistLog(level: Uppercase<ConsoleMethodName>, message: string): boolean {
  if (level === "ERROR" || level === "WARN") {
    return true
  }

  if (level === "DEBUG") {
    return false
  }

  return LOW_FREQUENCY_LOG_PREFIXES.some(prefix => message.startsWith(prefix))
}

export function initializeSidecarFileLogger(): void {
  if (loggerInitialized) {
    return
  }

  loggerInitialized = true

  const originalConsoleMethods: Record<ConsoleMethodName, Console[ConsoleMethodName]> = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  }

  const logFilePath = resolveSidecarLogFilePath()
  if (!logFilePath) {
    originalConsoleMethods.warn(
      `[sidecar] File logging disabled because ${APP_SUPPORT_DIR_ENV_KEY} is missing`
    )
    return
  }

  try {
    mkdirSync(dirname(logFilePath), { recursive: true })
    rotateLogFileIfNeeded(logFilePath)
  } catch (error) {
    originalConsoleMethods.error("[sidecar] Failed to initialize file logger:", error)
    return
  }

  const writeLog = (level: Uppercase<ConsoleMethodName>, args: unknown[]) => {
    const timestamp = new Date().toISOString()
    const message = serializeLogArgs(args)
    if (!shouldPersistLog(level, message)) {
      return
    }
    appendLogLine(logFilePath, `[${timestamp}] [${level}] ${message}`, originalConsoleMethods.error)
  }

  const patchConsoleMethod = (methodName: ConsoleMethodName) => {
    const originalMethod = originalConsoleMethods[methodName]
    const level = methodName.toUpperCase() as Uppercase<ConsoleMethodName>

    console[methodName] = (...args: unknown[]) => {
      originalMethod(...args)
      writeLog(level, args)
    }
  }

  patchConsoleMethod("debug")
  patchConsoleMethod("info")
  patchConsoleMethod("log")
  patchConsoleMethod("warn")
  patchConsoleMethod("error")

  process.on("uncaughtExceptionMonitor", error => {
    writeLog("ERROR", ["[sidecar] Uncaught exception", error])
  })

  process.on("unhandledRejection", reason => {
    writeLog("ERROR", ["[sidecar] Unhandled rejection", reason])
  })

  writeLog("INFO", [`[sidecar] File logging initialized at ${logFilePath}`])
}

export function getSidecarLogFilePath(): string | null {
  return resolveSidecarLogFilePath()
}
