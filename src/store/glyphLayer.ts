import {
  getArchivedGlyphLayer,
  getHotGlyphLayerSnapshot,
  getGlyphLayerSnapshot,
} from 'src/lib/projectArchive'
import type { GlyphData } from 'src/store/types'

export const getGlyphLayer = (
  glyph: GlyphData | undefined,
  layerId: string | null | undefined
) => {
  if (!glyph) {
    return null
  }

  const requestedLayerId = layerId ?? glyph.activeLayerId ?? null
  if (
    glyph.activeLayerId &&
    (glyph.activeLayerId === requestedLayerId || requestedLayerId === null)
  ) {
    return getHotGlyphLayerSnapshot(glyph, glyph.activeLayerId)
  }

  const archivedLayer = getArchivedGlyphLayer(glyph.id, requestedLayerId)
  if (archivedLayer) {
    return archivedLayer
  }

  return getGlyphLayerSnapshot(glyph, requestedLayerId)
}

export const syncGlyphTopLevelFromLayer = (
  glyph: GlyphData | undefined,
  layerId: string | null | undefined
) => {
  const layer = getGlyphLayer(glyph, layerId)
  if (!glyph || !layer) {
    return
  }

  glyph.paths = layer.paths
  glyph.components = layer.components
  glyph.componentRefs = layer.componentRefs
  glyph.anchors = layer.anchors
  glyph.guidelines = layer.guidelines
  glyph.metrics = layer.metrics
  glyph.activeLayerId = layer.id
}
