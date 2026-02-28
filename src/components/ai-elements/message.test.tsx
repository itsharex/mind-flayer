import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MessageResponse } from "@/components/ai-elements/message"

describe("MessageResponse local image rendering", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders local image with sidecar proxy URL", async () => {
    const localPath = "/Users/didi/Desktop/a.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${localPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    expect(image?.getAttribute("src")).toBe(
      `http://localhost:21420/api/local-image?path=${encodeURIComponent(localPath)}`
    )
  })

  it("renders file URL image with sidecar proxy URL", async () => {
    const fileUrlPath = "file:///Users/didi/Desktop/a.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${fileUrlPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    expect(image?.getAttribute("src")).toBe(
      `http://localhost:21420/api/local-image?path=${encodeURIComponent(fileUrlPath)}`
    )
  })

  it("falls back to text link when image loading fails", async () => {
    const localPath = "/Users/didi/Desktop/missing.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${localPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()

    await act(async () => {
      image?.dispatchEvent(new Event("error"))
    })

    expect(container.querySelector("img")).toBeNull()

    const fallbackLink = container.querySelector("a")
    expect(fallbackLink).not.toBeNull()
    expect(fallbackLink?.textContent).toBe(localPath)
    expect(fallbackLink?.getAttribute("href")).toBe(
      `http://localhost:21420/api/local-image?path=${encodeURIComponent(localPath)}`
    )
  })
})
