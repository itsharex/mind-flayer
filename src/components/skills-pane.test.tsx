import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { SkillsPane, splitSkillsBySource } from "@/components/skills-pane"
import { SidebarProvider } from "@/components/ui/sidebar"
import i18n from "@/lib/i18n"

const { deleteSkillMock, getSkillDetailMock, listSkillsMock } = vi.hoisted(() => ({
  listSkillsMock: vi.fn(),
  getSkillDetailMock: vi.fn(),
  deleteSkillMock: vi.fn()
}))

vi.mock("@/lib/sidecar-client", () => ({
  listSkills: (...args: unknown[]) => listSkillsMock(...args),
  getSkillDetail: (...args: unknown[]) => getSkillDetailMock(...args),
  deleteSkill: (...args: unknown[]) => deleteSkillMock(...args)
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn()
}))

vi.mock("@/hooks/use-local-shortcut", () => ({
  useLocalShortcut: vi.fn()
}))

describe("SkillsPane", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousMatchMedia: typeof window.matchMedia | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    previousMatchMedia = window.matchMedia
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      }))
    })
  })

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    listSkillsMock.mockResolvedValue([
      {
        id: "bundled:reader",
        name: "Bundled Reader",
        description: "Built-in reader skill",
        iconUrl: "http://localhost:4321/api/local-image?path=%2Ftmp%2Ficons%2Freader.svg",
        source: "bundled",
        canUninstall: false,
        location: "~/skills/builtin/reader/SKILL.md",
        filePath: "/tmp/skills/builtin/reader/SKILL.md"
      },
      {
        id: "user:writer",
        name: "User Writer",
        description: "User installed writer skill",
        iconUrl: null,
        source: "user",
        canUninstall: true,
        location: "~/skills/user/writer/SKILL.md",
        filePath: "/tmp/skills/user/writer/SKILL.md"
      }
    ])
    getSkillDetailMock.mockResolvedValue({
      id: "bundled:reader",
      name: "Bundled Reader",
      description: "Built-in reader skill",
      iconUrl: "http://localhost:4321/api/local-image?path=%2Ftmp%2Ficons%2Freader.svg",
      source: "bundled",
      canUninstall: false,
      location: "~/skills/builtin/reader/SKILL.md",
      filePath: "/tmp/skills/builtin/reader/SKILL.md",
      bodyMarkdown: "# Reader\n\nDetailed content"
    })
    deleteSkillMock.mockResolvedValue(undefined)
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: previousMatchMedia
    })
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await act(async () => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ""
  })

  it("renders built-in and user skill sections, toggles switches, and opens detail", async () => {
    const setDisabledSkillIds = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarProvider>
            <SkillsPane disabledSkillIds={[]} setDisabledSkillIds={setDisabledSkillIds} />
          </SidebarProvider>
        </I18nextProvider>
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Built-in")
    expect(container.textContent).toContain("User-installed")
    expect(container.textContent).toContain("Bundled Reader")
    expect(container.textContent).toContain("User Writer")
    expect(
      container.querySelector(
        'img[src="http://localhost:4321/api/local-image?path=%2Ftmp%2Ficons%2Freader.svg"]'
      )
    ).not.toBeNull()
    expect(container.querySelector("[data-skill-icon-fallback]")).not.toBeNull()

    const switches = Array.from(container.querySelectorAll('[role="switch"]'))
    expect(switches).toHaveLength(2)

    await act(async () => {
      ;(switches[0] as HTMLButtonElement).click()
    })

    expect(setDisabledSkillIds).toHaveBeenCalledWith(["bundled:reader"])

    const card = container.querySelector(
      'button[aria-label="Open details for Bundled Reader"]'
    ) as HTMLButtonElement | null

    expect(card).not.toBeNull()

    await act(async () => {
      card?.click()
      await Promise.resolve()
    })

    expect(getSkillDetailMock).toHaveBeenCalledWith("bundled:reader")
    expect(document.body.textContent).toContain("Detailed content")

    const uninstallMenuTrigger = container.querySelector(
      'button[aria-label="More actions for User Writer"]'
    ) as HTMLButtonElement | null

    expect(uninstallMenuTrigger).not.toBeNull()

    await act(async () => {
      uninstallMenuTrigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("Uninstall")
  })

  it("sorts bundled and user skills by skill name", () => {
    const { bundledSkills, userSkills } = splitSkillsBySource([
      {
        id: "bundled:zeta",
        name: "Zeta Skill",
        description: "zeta",
        iconUrl: null,
        source: "bundled",
        canUninstall: false,
        location: "",
        filePath: ""
      },
      {
        id: "user:beta",
        name: "beta skill",
        description: "beta",
        iconUrl: null,
        source: "user",
        canUninstall: true,
        location: "",
        filePath: ""
      },
      {
        id: "bundled:alpha",
        name: "Alpha Skill",
        description: "alpha",
        iconUrl: null,
        source: "bundled",
        canUninstall: false,
        location: "",
        filePath: ""
      },
      {
        id: "user:gamma",
        name: "Gamma Skill",
        description: "gamma",
        iconUrl: null,
        source: "user",
        canUninstall: true,
        location: "",
        filePath: ""
      }
    ])

    expect(bundledSkills.map(skill => skill.name)).toEqual(["Alpha Skill", "Zeta Skill"])
    expect(userSkills.map(skill => skill.name)).toEqual(["beta skill", "Gamma Skill"])
  })

  it("shows a disabled badge in detail when the selected skill is disabled", async () => {
    const setDisabledSkillIds = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarProvider>
            <SkillsPane
              disabledSkillIds={["bundled:reader"]}
              setDisabledSkillIds={setDisabledSkillIds}
            />
          </SidebarProvider>
        </I18nextProvider>
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    const card = container.querySelector(
      'button[aria-label="Open details for Bundled Reader"]'
    ) as HTMLButtonElement | null

    await act(async () => {
      card?.click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("Disabled")
  })

  it("refreshes after uninstall even when disabled skill cleanup fails", async () => {
    const setDisabledSkillIds = vi.fn().mockRejectedValue(new Error("settings write failed"))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    listSkillsMock.mockReset()
    listSkillsMock
      .mockResolvedValueOnce([
        {
          id: "bundled:reader",
          name: "Bundled Reader",
          description: "Built-in reader skill",
          iconUrl: "http://localhost:4321/api/local-image?path=%2Ftmp%2Ficons%2Freader.svg",
          source: "bundled",
          canUninstall: false,
          location: "~/skills/builtin/reader/SKILL.md",
          filePath: "/tmp/skills/builtin/reader/SKILL.md"
        },
        {
          id: "user:writer",
          name: "User Writer",
          description: "User installed writer skill",
          iconUrl: null,
          source: "user",
          canUninstall: true,
          location: "~/skills/user/writer/SKILL.md",
          filePath: "/tmp/skills/user/writer/SKILL.md"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "bundled:reader",
          name: "Bundled Reader",
          description: "Built-in reader skill",
          iconUrl: "http://localhost:4321/api/local-image?path=%2Ftmp%2Ficons%2Freader.svg",
          source: "bundled",
          canUninstall: false,
          location: "~/skills/builtin/reader/SKILL.md",
          filePath: "/tmp/skills/builtin/reader/SKILL.md"
        }
      ])

    try {
      await act(async () => {
        root.render(
          <I18nextProvider i18n={i18n}>
            <SidebarProvider>
              <SkillsPane
                disabledSkillIds={["user:writer"]}
                setDisabledSkillIds={setDisabledSkillIds}
              />
            </SidebarProvider>
          </I18nextProvider>
        )
      })

      await act(async () => {
        await Promise.resolve()
      })

      const uninstallMenuTrigger = container.querySelector(
        'button[aria-label="More actions for User Writer"]'
      ) as HTMLButtonElement | null

      await act(async () => {
        uninstallMenuTrigger?.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        )
        await Promise.resolve()
      })

      const uninstallMenuItem = Array.from(
        document.body.querySelectorAll('[role="menuitem"]')
      ).find(element => element.textContent?.includes("Uninstall"))

      await act(async () => {
        ;(uninstallMenuItem as HTMLElement | undefined)?.click()
        await Promise.resolve()
      })

      const confirmUninstallButton = Array.from(document.body.querySelectorAll("button")).find(
        button => button.textContent?.trim() === "Uninstall"
      ) as HTMLButtonElement | undefined

      await act(async () => {
        confirmUninstallButton?.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(deleteSkillMock).toHaveBeenCalledWith("user:writer")
      expect(setDisabledSkillIds).toHaveBeenCalledWith([])
      expect(listSkillsMock).toHaveBeenCalledTimes(2)
      expect(document.body.textContent).not.toContain("Remove User Writer from this device?")
    } finally {
      warnSpy.mockRestore()
    }
  })
})
