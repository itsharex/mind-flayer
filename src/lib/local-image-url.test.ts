import { describe, expect, it } from "vitest"
import { resolveLocalImageUrl } from "@/lib/local-image-url"

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
    const source = "file:///Users/didi/Desktop/a.png"
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN)).toBe(
      `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent(source)}`
    )
  })

  it("rewrites absolute paths to sidecar local image API", () => {
    const source = "/Users/didi/Desktop/a.png"
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN)).toBe(
      `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent(source)}`
    )
  })

  it("does not rewrite non-image local paths", () => {
    const source = "/Users/didi/Desktop/a.txt"
    expect(resolveLocalImageUrl(source, SIDECAR_ORIGIN)).toBe(source)
  })
})
