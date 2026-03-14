import type { Context } from "hono"
import {
  discoverSkills,
  getSkillById,
  getSkillDetailById,
  parseSkillId,
  type SkillCatalogDetail,
  type SkillCatalogEntry,
  uninstallUserSkill
} from "../skills/catalog"
import {
  BadRequestError,
  ForbiddenError,
  mapErrorToResponse,
  NotFoundError
} from "../utils/http-errors"

function toLocalImageUrl(c: Context, imagePath: string | null): string | null {
  if (!imagePath) {
    return null
  }

  const localImageUrl = new URL("/api/local-image", c.req.url)
  localImageUrl.searchParams.set("path", imagePath)
  return localImageUrl.toString()
}

function serializeSkill(c: Context, skill: SkillCatalogEntry) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    iconUrl: toLocalImageUrl(c, skill.iconPath),
    source: skill.source,
    canUninstall: skill.canUninstall,
    location: skill.location,
    filePath: skill.filePath
  }
}

function serializeSkillDetail(c: Context, skill: SkillCatalogDetail) {
  return {
    ...serializeSkill(c, skill),
    bodyMarkdown: skill.bodyMarkdown
  }
}

export async function handleListSkills(c: Context) {
  try {
    const skills = await discoverSkills()

    return c.json({
      success: true,
      skills: skills.map(skill => serializeSkill(c, skill))
    })
  } catch (error) {
    console.error("[sidecar] List skills error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export async function handleGetSkillDetail(c: Context) {
  try {
    const skillId = c.req.param("skillId")?.trim()
    if (!skillId) {
      throw new BadRequestError("Skill id is required")
    }

    const skill = await getSkillDetailById(skillId)
    if (!skill) {
      throw new NotFoundError(`Skill '${skillId}' was not found`)
    }

    return c.json({
      success: true,
      skill: serializeSkillDetail(c, skill)
    })
  } catch (error) {
    console.error("[sidecar] Get skill detail error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export async function handleDeleteSkill(c: Context) {
  try {
    const skillId = c.req.param("skillId")?.trim()
    if (!skillId) {
      throw new BadRequestError("Skill id is required")
    }

    const parsedSkillId = parseSkillId(skillId)
    if (!parsedSkillId) {
      throw new BadRequestError(`Invalid skill id '${skillId}'`)
    }

    if (parsedSkillId.source !== "user") {
      throw new ForbiddenError("Built-in skills cannot be uninstalled")
    }

    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new NotFoundError(`Skill '${skillId}' was not found`)
    }

    await uninstallUserSkill(skill)

    return c.json({
      success: true
    })
  } catch (error) {
    console.error("[sidecar] Delete skill error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
