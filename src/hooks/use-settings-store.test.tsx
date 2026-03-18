import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { useSettingWithLoaded } from "@/hooks/use-settings-store"

const storeGetMock = vi.hoisted(() => vi.fn())
const storeSetMock = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: storeGetMock,
    set: storeSetMock
  }))
}))

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => undefined),
  listen: vi.fn(async () => () => undefined)
}))

function SettingProbe() {
  const [value, , isLoaded] = useSettingWithLoaded("telegramAllowedUserIds")

  return (
    <div>
      <span data-slot="loaded">{String(isLoaded)}</span>
      <span data-slot="value">{value.join(",")}</span>
    </div>
  )
}

describe("useSettingWithLoaded", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let resolveStoredValue: ((value: string[]) => void) | null

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    resolveStoredValue = null

    storeGetMock.mockImplementation(
      () =>
        new Promise<string[]>(resolve => {
          resolveStoredValue = resolve
        })
    )
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await act(async () => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ""
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  it("stays unloaded until the persisted setting has been restored", async () => {
    await act(async () => {
      root.render(<SettingProbe />)
    })

    expect(container.querySelector('[data-slot="loaded"]')?.textContent).toBe("false")
    expect(container.querySelector('[data-slot="value"]')?.textContent).toBe("")

    await act(async () => {
      resolveStoredValue?.(["1001", "1002"])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-slot="loaded"]')?.textContent).toBe("true")
    expect(container.querySelector('[data-slot="value"]')?.textContent).toBe("1001,1002")
  })
})
