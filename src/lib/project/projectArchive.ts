import type { FontData } from '@/store'
import { normalizeGlyphToLayers } from '@/store/glyphLayer'
import type {
  ProjectRoundTripFormat,
  ProjectSourceFormat,
} from '@/lib/project/projectFormats'

// With layers-as-truth all glyph content lives in GlyphData.layers, so there is
// no hot↔layers reconciliation to do. This module now only holds the project
// metadata captured at load and normalises legacy glyphs into the layer shape.

interface ProjectArchiveState {
  projectMetadata: Record<string, unknown> | null
  projectSourceFormat: ProjectSourceFormat | null
  projectRoundTripFormat: ProjectRoundTripFormat | null
}

const archiveState: ProjectArchiveState = {
  projectMetadata: null,
  projectSourceFormat: null,
  projectRoundTripFormat: null,
}

export const clearProjectArchive = () => {
  archiveState.projectMetadata = null
  archiveState.projectSourceFormat = null
  archiveState.projectRoundTripFormat = null
}

export const ingestProjectData = (
  fontData: FontData,
  projectMetadata: Record<string, unknown> | null = null,
  projectSourceFormat: ProjectSourceFormat | null = null,
  projectRoundTripFormat: ProjectRoundTripFormat | null = null
): FontData => {
  archiveState.projectMetadata = projectMetadata
  archiveState.projectSourceFormat = projectSourceFormat
  archiveState.projectRoundTripFormat = projectRoundTripFormat

  return {
    ...fontData,
    glyphs: Object.fromEntries(
      Object.entries(fontData.glyphs).map(([glyphId, glyph]) => [
        glyphId,
        normalizeGlyphToLayers(glyph),
      ])
    ),
  }
}

export const getProjectArchiveMetadata = () => archiveState.projectMetadata

export const getProjectArchiveSourceFormat = () =>
  archiveState.projectSourceFormat

export const getProjectArchiveRoundTripFormat = () =>
  archiveState.projectRoundTripFormat

export const getProjectArchiveFirstMasterId = (): string | null => {
  const fontMasters = archiveState.projectMetadata?.fontMasters
  if (!Array.isArray(fontMasters) || fontMasters.length === 0) {
    return null
  }

  const firstMaster = fontMasters[0]
  if (
    !firstMaster ||
    typeof firstMaster !== 'object' ||
    !('id' in firstMaster)
  ) {
    return null
  }

  return (firstMaster as Record<string, unknown>).id as string | null
}
