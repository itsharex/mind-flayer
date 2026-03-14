import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Hono } from "hono"
import { afterEach, describe, expect, it } from "vitest"
import { handleDeleteSkill, handleGetSkillDetail, handleListSkills } from "../skills"

async function writeSkill(
  appSupportDir: string,
  sourceDir: "builtin" | "user",
  relativeDir: string,
  content: string
) {
  const skillDir = join(appSupportDir, "skills", sourceDir, relativeDir)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, "SKILL.md"), content, "utf8")
}

async function writeSkillAsset(
  appSupportDir: string,
  sourceDir: "builtin" | "user",
  relativePath: string,
  content: string
) {
  const assetPath = join(appSupportDir, "skills", sourceDir, relativePath)
  await mkdir(dirname(assetPath), { recursive: true })
  await writeFile(assetPath, content, "utf8")
}

describe("skills routes", () => {
  const tempDirs: string[] = []
  const originalAppSupportDir = process.env.MINDFLAYER_APP_SUPPORT_DIR

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0

    if (originalAppSupportDir === undefined) {
      delete process.env.MINDFLAYER_APP_SUPPORT_DIR
    } else {
      process.env.MINDFLAYER_APP_SUPPORT_DIR = originalAppSupportDir
    }
  })

  it("lists source-aware skills", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-route-list-"))
    tempDirs.push(appSupportDir)
    process.env.MINDFLAYER_APP_SUPPORT_DIR = appSupportDir

    await writeSkill(
      appSupportDir,
      "builtin",
      "skill-smoke-test",
      `---
name: skill-smoke-test
description: smoke description
metadata:
  icon: assets/icon.svg
---

Smoke
`
    )
    await writeSkillAsset(
      appSupportDir,
      "builtin",
      "skill-smoke-test/assets/icon.svg",
      '<svg xmlns="http://www.w3.org/2000/svg" />'
    )

    const app = new Hono()
    app.get("/api/skills", handleListSkills)

    const res = await app.request("/api/skills")
    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      skills: Array<{
        id: string
        source: string
        canUninstall: boolean
        iconUrl: string | null
      }>
    }

    expect(payload.success).toBe(true)
    expect(payload.skills).toHaveLength(1)
    expect(payload.skills[0]).toMatchObject({
      id: "bundled:skill-smoke-test",
      source: "bundled",
      canUninstall: false,
      iconUrl: `http://localhost/api/local-image?path=${encodeURIComponent(join(appSupportDir, "skills", "builtin", "skill-smoke-test", "assets", "icon.svg"))}`
    })
  })

  it("returns detail markdown without frontmatter", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-route-detail-"))
    tempDirs.push(appSupportDir)
    process.env.MINDFLAYER_APP_SUPPORT_DIR = appSupportDir

    await writeSkill(
      appSupportDir,
      "builtin",
      "detail-skill",
      `---
name: detail-skill
description: detail description
metadata:
  icon: assets/icon.svg
---

# Detail

Body
`
    )
    await writeSkillAsset(
      appSupportDir,
      "builtin",
      "detail-skill/assets/icon.svg",
      '<svg xmlns="http://www.w3.org/2000/svg" />'
    )

    const app = new Hono()
    app.get("/api/skills/:skillId", handleGetSkillDetail)

    const res = await app.request("/api/skills/bundled%3Adetail-skill")
    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      skill: { id: string; bodyMarkdown: string; iconUrl: string | null }
    }

    expect(payload.success).toBe(true)
    expect(payload.skill.id).toBe("bundled:detail-skill")
    expect(payload.skill.bodyMarkdown).toBe("# Detail\n\nBody")
    expect(payload.skill.iconUrl).toBe(
      `http://localhost/api/local-image?path=${encodeURIComponent(join(appSupportDir, "skills", "builtin", "detail-skill", "assets", "icon.svg"))}`
    )
  })

  it("returns 404 when the skill detail is missing", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-route-missing-"))
    tempDirs.push(appSupportDir)
    process.env.MINDFLAYER_APP_SUPPORT_DIR = appSupportDir

    const app = new Hono()
    app.get("/api/skills/:skillId", handleGetSkillDetail)

    const res = await app.request("/api/skills/user%3Amissing-skill")
    expect(res.status).toBe(404)
  })

  it("deletes a user-installed skill", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-route-delete-"))
    tempDirs.push(appSupportDir)
    process.env.MINDFLAYER_APP_SUPPORT_DIR = appSupportDir

    await writeSkill(
      appSupportDir,
      "user",
      "custom-skill",
      `---
name: custom-skill
description: custom description
---

Custom
`
    )

    const app = new Hono()
    app.delete("/api/skills/:skillId", handleDeleteSkill)

    const res = await app.request("/api/skills/user%3Acustom-skill", {
      method: "DELETE"
    })
    expect(res.status).toBe(200)

    await expect(stat(join(appSupportDir, "skills", "user", "custom-skill"))).rejects.toBeDefined()
  })

  it("rejects deleting a built-in skill", async () => {
    const app = new Hono()
    app.delete("/api/skills/:skillId", handleDeleteSkill)

    const res = await app.request("/api/skills/bundled%3Askill-smoke-test", {
      method: "DELETE"
    })
    expect(res.status).toBe(403)
  })
})
