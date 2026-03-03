import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { transformTelegramMediaMessage } from "../telegram-media-message"

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
])

const MP4_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32
])

const MP3_BYTES = Uint8Array.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x15])

describe("transformTelegramMediaMessage", () => {
  let tempDir = ""
  let imagePath = ""
  let videoPath = ""
  let audioPath = ""
  let docPath = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-media-test-"))
    imagePath = join(tempDir, "shot.png")
    videoPath = join(tempDir, "clip.mp4")
    audioPath = join(tempDir, "voice.mp3")
    docPath = join(tempDir, "note.txt")

    await writeFile(imagePath, PNG_BYTES)
    await writeFile(videoPath, MP4_BYTES)
    await writeFile(audioPath, MP3_BYTES)
    await writeFile(docPath, "hello")
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("transforms image markdown and returns photo upload", async () => {
    const result = await transformTelegramMediaMessage(`Done.\n![screenshot](${imagePath})`)

    expect(result.sanitizedText).toBe("Done.\n[image: screenshot]")
    expect(result.uploads).toHaveLength(1)
    expect(result.uploads[0]?.kind).toBe("photo")
    expect(result.uploads[0]?.filename).toBe("shot.png")
    expect(result.warnings).toEqual([])
  })

  it("routes video, audio and document by extension", async () => {
    const content = [
      `See video: [clip](${videoPath})`,
      `Hear this: [voice](${audioPath})`,
      `Doc: [note](${docPath})`
    ].join("\n")

    const result = await transformTelegramMediaMessage(content)

    expect(result.sanitizedText).toContain("[file: clip]")
    expect(result.sanitizedText).toContain("[file: voice]")
    expect(result.sanitizedText).toContain("[file: note]")
    expect(result.uploads.map(upload => upload.kind)).toEqual(["video", "audio", "document"])
  })

  it("supports file:// input", async () => {
    const fileUrl = `file://${imagePath}`
    const result = await transformTelegramMediaMessage(`![shot](${fileUrl})`)

    expect(result.sanitizedText).toBe("[image: shot]")
    expect(result.uploads).toHaveLength(1)
    expect(result.uploads[0]?.kind).toBe("photo")
  })

  it("keeps remote markdown unchanged", async () => {
    const content = "Remote: ![x](https://example.com/x.png)"
    const result = await transformTelegramMediaMessage(content)

    expect(result.sanitizedText).toBe(content)
    expect(result.uploads).toHaveLength(0)
    expect(result.warnings).toEqual([])
  })
})
