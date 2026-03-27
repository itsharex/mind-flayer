import { describe, expect, it } from "vitest"
import { normalizeLocalImageMarkdown, resolveLocalImageUrl } from "@/lib/local-image-url"

const SIDECAR_ORIGIN = "http://localhost:21420"

describe("resolveLocalImageUrl", () => {
  it("keeps http and https URLs unchanged", () => {
    expect(resolveLocalImageUrl("https://example.com/a.png", SIDECAR_ORIGIN)).toBe(
      "https://example.com/a.png"
    )
    expect(resolveLocalImageUrl("http://example.com/a.png", SIDECAR_ORIGIN)).toBe(
      "http://example.com/a.png"
    )
  })

  it("rewrites file URLs to sidecar local image API", () => {
    const source = "file:///Users/USERNAME/Desktop/a.png"
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN)).toBe(
      `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent(source)}`
    )
  })

  it("rewrites absolute paths to sidecar local image API", () => {
    const source = "/Users/USERNAME/Desktop/a.png"
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN)).toBe(
      `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent(source)}`
    )
  })

  it("does not rewrite non-image local paths", () => {
    const source = "/Users/USERNAME/Desktop/a.txt"
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN)).toBe(source)
  })

  it("appends cache bust key for rewritten local image URLs", () => {
    const source = "/Users/USERNAME/Desktop/a.png"
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN, { cacheBustKey: "render-1" })).toBe(
      `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent(source)}&_ts=render-1`
    )
  })

  it("appends cache bust key for existing local image proxy URLs", () => {
    const source = `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent("/Users/USERNAME/Desktop/a.png")}`
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN, { cacheBustKey: "render-2" })).toBe(
      `${source}&_ts=render-2`
    )
  })
})

describe("normalizeLocalImageMarkdown", () => {
  it("encodes whitespace in file URL image destinations", () => {
    expect(
      normalizeLocalImageMarkdown(
        "![local](file:///Users/USERNAME/Library/Application Support/Mind Flayer/shot.png)"
      )
    ).toBe("![local](file:///Users/USERNAME/Library/Application%20Support/Mind%20Flayer/shot.png)")
  })

  it("encodes whitespace in absolute local image destinations", () => {
    expect(
      normalizeLocalImageMarkdown("![local](/Users/USERNAME/Desktop/blog shots/soonwang me.png)")
    ).toBe("![local](/Users/USERNAME/Desktop/blog%20shots/soonwang%20me.png)")
  })

  it("keeps non-local or already valid markdown unchanged", () => {
    expect(normalizeLocalImageMarkdown("![remote](https://example.com/a b.png)")).toBe(
      "![remote](https://example.com/a b.png)"
    )
    expect(normalizeLocalImageMarkdown("![local](file:///Users/USERNAME/Desktop/shot.png)")).toBe(
      "![local](file:///Users/USERNAME/Desktop/shot.png)"
    )
  })
})
