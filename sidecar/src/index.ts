import { initializeSidecarFileLogger } from "./utils/file-logger"

initializeSidecarFileLogger()

void import("./server")
  .then(({ normalizeErrorMessage, startSidecar }) =>
    startSidecar().catch(error => {
      const message = normalizeErrorMessage(error instanceof Error ? error.message : String(error))
      console.error(`[sidecar] STARTUP_ERROR message=${message}`)
      if (error instanceof Error && error.stack) {
        console.error(error.stack)
      }
      process.exit(1)
    })
  )
  .catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[sidecar] BOOTSTRAP_ERROR message=${message}`)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  })
