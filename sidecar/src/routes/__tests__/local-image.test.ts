import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { handleLocalImage } from "../local-image"

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
])

describe("handleLocalImage", () => {
  let app: Hono
  let tempDir = ""
  let imagePath = ""
  let nonImagePath = ""

  beforeEach(async () => {
    app = new Hono()
    app.get("/api/local-image", handleLocalImage)

    tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-local-image-test-"))
    imagePath = join(tempDir, "photo.png")
    nonImagePath = join(tempDir, "note.txt")

    await writeFile(imagePath, PNG_BYTES)
    await writeFile(nonImagePath, "not an image")
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("returns image bytes and content type for a valid image file", async () => {
    const res = await app.request(`/api/local-image?path=${encodeURIComponent(imagePath)}`)

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("image/png")

    const body = new Uint8Array(await res.arrayBuffer())
    expect(body).toEqual(PNG_BYTES)
  })

  it("supports file:// URL query input", async () => {
    const fileUrl = `file://${imagePath}`
    const res = await app.request(`/api/local-image?path=${encodeURIComponent(fileUrl)}`)

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("image/png")
  })

  it("returns 400 for missing or invalid path query", async () => {
    const missingPathRes = await app.request("/api/local-image")
    const relativePathRes = await app.request(
      `/api/local-image?path=${encodeURIComponent("./photo.png")}`
    )

    expect(missingPathRes.status).toBe(400)
    expect(relativePathRes.status).toBe(400)
  })

  it("returns 404 when file does not exist", async () => {
    const missingImagePath = join(tempDir, "missing.png")
    const res = await app.request(`/api/local-image?path=${encodeURIComponent(missingImagePath)}`)

    expect(res.status).toBe(404)
  })

  it("returns 400 for non-image files", async () => {
    const res = await app.request(`/api/local-image?path=${encodeURIComponent(nonImagePath)}`)

    expect(res.status).toBe(400)
  })
})
