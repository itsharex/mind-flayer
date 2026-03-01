import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { transformTelegramImageMessage } from "../telegram-image-message"

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
])

describe("transformTelegramImageMessage", () => {
  let tempDir = ""
  let imagePath = ""
  let secondImagePath = ""
  let nonImagePath = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-image-test-"))
    imagePath = join(tempDir, "shot.png")
    secondImagePath = join(tempDir, "shot-2.png")
    nonImagePath = join(tempDir, "note.txt")

    await writeFile(imagePath, PNG_BYTES)
    await writeFile(secondImagePath, PNG_BYTES)
    await writeFile(nonImagePath, "not an image")
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("transforms file:// local image markdown into sanitized text and upload payload", async () => {
    const fileUrl = `file://${imagePath}`
    const result = await transformTelegramImageMessage(`Done.\n![screenshot](${fileUrl})`)

    expect(result.sanitizedText).toBe("Done.\n[image: screenshot]")
    expect(result.uploads).toHaveLength(1)
    expect(result.uploads[0]?.filename).toBe("shot.png")
    expect(result.uploads[0]?.mimeType).toBe("image/png")
    expect(result.uploads[0]?.caption).toBe("screenshot")
    expect(result.warnings).toEqual([])
  })

  it("transforms absolute local image path markdown into upload payload", async () => {
    const result = await transformTelegramImageMessage(`![local shot](${imagePath})`)

    expect(result.sanitizedText).toBe("[image: local shot]")
    expect(result.uploads).toHaveLength(1)
    expect(result.uploads[0]?.filename).toBe("shot.png")
  })

  it("supports sidecar local-image proxy URLs", async () => {
    const proxyUrl = `http://localhost:21420/api/local-image?path=${encodeURIComponent(imagePath)}`
    const result = await transformTelegramImageMessage(`See this:\n![proxy](${proxyUrl})`)

    expect(result.sanitizedText).toBe("See this:\n[image: proxy]")
    expect(result.uploads).toHaveLength(1)
    expect(result.uploads[0]?.filename).toBe("shot.png")
  })

  it("handles multiple local images in one message", async () => {
    const content = [
      "First:",
      `![one](${imagePath})`,
      "Second:",
      `![two](file://${secondImagePath})`
    ].join("\n")

    const result = await transformTelegramImageMessage(content)

    expect(result.sanitizedText).toBe("First:\n[image: one]\nSecond:\n[image: two]")
    expect(result.uploads).toHaveLength(2)
    expect(result.uploads.map(item => item.filename)).toEqual(["shot.png", "shot-2.png"])
  })

  it("skips non-image local files and records warning", async () => {
    const result = await transformTelegramImageMessage(`![text-file](${nonImagePath})`)

    expect(result.sanitizedText).toBe("[image: text-file]")
    expect(result.uploads).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("unsupported image extension")
  })

  it("skips missing local files and records warning", async () => {
    const missingPath = join(tempDir, "missing.png")
    const result = await transformTelegramImageMessage(`![missing](${missingPath})`)

    expect(result.sanitizedText).toBe("[image: missing]")
    expect(result.uploads).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("Skipping local image")
  })

  it("keeps network image markdown unchanged", async () => {
    const content = "Remote image: ![remote](https://example.com/a.png)"
    const result = await transformTelegramImageMessage(content)

    expect(result.sanitizedText).toBe(content)
    expect(result.uploads).toHaveLength(0)
    expect(result.warnings).toEqual([])
  })
})
