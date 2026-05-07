import type { FontData, GlyphData, GlyphLayerData } from 'src/store'
import type {
  ProjectRoundTripFormat,
  ProjectSourceFormat,
} from 'src/lib/projectFormats'

interface GlyphLayerArchiveEntry {
  layerOrder: string[]
  layers: Record<string, GlyphLayerData>
}

interface ProjectArchiveState {
  glyphLayers: Record<string, GlyphLayerArchiveEntry>
  projectMetadata: Record<string, unknown> | null
  projectSourceFormat: ProjectSourceFormat | null
  projectRoundTripFormat: ProjectRoundTripFormat | null
}

const archiveState: ProjectArchiveState = {
  glyphLayers: {},
  projectMetadata: null,
  projectSourceFormat: null,
  projectRoundTripFormat: null,
}

const getGlyphTopLevelLayer = (
  glyph: GlyphData,
  layerId: string | null = null
): GlyphLayerData => ({
  id: layerId ?? 'default',
  name: layerId ?? 'default',
  associatedMasterId: layerId,
  paths: glyph.paths,
  components: glyph.components,
  componentRefs: glyph.componentRefs,
  anchors: glyph.anchors ?? [],
  guidelines: glyph.guidelines ?? [],
  metrics: glyph.metrics,
})

export const getHotGlyphLayerSnapshot = (
  glyph: GlyphData,
  layerId: string | null | undefined
): GlyphLayerData =>
  getGlyphTopLevelLayer(glyph, layerId ?? glyph.activeLayerId ?? 'default')

export const clearProjectArchive = () => {
  archiveState.glyphLayers = {}
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
  archiveState.glyphLayers = {}
  archiveState.projectMetadata = projectMetadata
  archiveState.projectSourceFormat = projectSourceFormat
  archiveState.projectRoundTripFormat = projectRoundTripFormat

  const hotGlyphs = Object.fromEntries(
    Object.entries(fontData.glyphs).map(([glyphId, glyph]) => {
      if (glyph.layers && glyph.layerOrder?.length) {
        archiveState.glyphLayers[glyphId] = {
          layerOrder: [...glyph.layerOrder],
          layers: glyph.layers,
        }
      }

      const { layers, layerOrder, ...hotGlyph } = glyph
      void layers
      void layerOrder
      return [glyphId, hotGlyph]
    })
  )

  return {
    ...fontData,
    glyphs: hotGlyphs,
  }
}

export const getArchivedGlyphLayer = (
  glyphId: string,
  layerId: string | null | undefined
): GlyphLayerData | null => {
  const glyphArchive = archiveState.glyphLayers[glyphId]
  if (!glyphArchive) {
    return null
  }

  if (layerId && glyphArchive.layers[layerId]) {
    return glyphArchive.layers[layerId]
  }

  const fallbackLayerId = glyphArchive.layerOrder[0]
  return fallbackLayerId ? (glyphArchive.layers[fallbackLayerId] ?? null) : null
}

export const getArchivedGlyphLayerEntries = (
  glyphId: string
): GlyphLayerData[] => {
  const glyphArchive = archiveState.glyphLayers[glyphId]
  if (!glyphArchive) {
    return []
  }

  return glyphArchive.layerOrder
    .map((layerId) => glyphArchive.layers[layerId])
    .filter((layer): layer is GlyphLayerData => Boolean(layer))
}

export const getArchivedGlyphLayerOrder = (glyphId: string): string[] =>
  archiveState.glyphLayers[glyphId]?.layerOrder ?? []

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

export const hydrateProjectFontData = (fontData: FontData): FontData => ({
  ...fontData,
  glyphs: Object.fromEntries(
    Object.entries(fontData.glyphs).map(([glyphId, glyph]) => {
      const glyphArchive = archiveState.glyphLayers[glyphId]
      if (!glyphArchive) {
        return [glyphId, glyph]
      }

      const activeLayerId =
        glyph.activeLayerId ?? glyphArchive.layerOrder[0] ?? null
      const layers = { ...glyphArchive.layers }
      if (activeLayerId) {
        layers[activeLayerId] = getGlyphTopLevelLayer(glyph, activeLayerId)
      }

      return [
        glyphId,
        {
          ...glyph,
          layers,
          layerOrder: glyphArchive.layerOrder,
        },
      ]
    })
  ),
})

export const overlayHotFontData = (
  persistedFontData: FontData,
  hotFontData: FontData
): FontData => ({
  ...persistedFontData,
  glyphs: Object.fromEntries(
    Object.entries(persistedFontData.glyphs).map(
      ([glyphId, persistedGlyph]) => {
        const hotGlyph = hotFontData.glyphs[glyphId]
        if (!hotGlyph) {
          return [glyphId, persistedGlyph]
        }

        const activeLayerId =
          hotGlyph.activeLayerId ??
          persistedGlyph.activeLayerId ??
          persistedGlyph.layerOrder?.[0] ??
          null
        const layers = { ...(persistedGlyph.layers ?? {}) }

        if (activeLayerId) {
          layers[activeLayerId] = getHotGlyphLayerSnapshot(
            hotGlyph,
            activeLayerId
          )
        }

        return [
          glyphId,
          {
            ...persistedGlyph,
            ...hotGlyph,
            layers,
            layerOrder: persistedGlyph.layerOrder,
          },
        ]
      }
    )
  ),
})

export const getGlyphLayerSnapshot = (
  glyph: GlyphData,
  layerId: string | null | undefined
): GlyphLayerData => {
  return (
    getHotGlyphLayerSnapshot(glyph, layerId) ??
    getArchivedGlyphLayer(glyph.id, layerId)
  )
}
