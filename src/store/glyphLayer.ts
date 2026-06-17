import {
  getArchivedGlyphLayer,
  getHotGlyphLayerSnapshot,
  getGlyphLayerSnapshot,
} from 'src/lib/project/projectArchive'
import { listGlyphLayers } from 'src/store/glyphLayerOps'
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

  // Live backup layers are the store source of truth (see glyphLayerOps).
  if (requestedLayerId && glyph.layers?.[requestedLayerId]) {
    return glyph.layers[requestedLayerId]
  }

  const archivedLayer = getArchivedGlyphLayer(glyph.id, requestedLayerId)
  if (archivedLayer) {
    return archivedLayer
  }

  return getGlyphLayerSnapshot(glyph, requestedLayerId)
}

// Resolve the glyph's layer for the font-wide active master. null activeMasterId
// means "no master selected" → the glyph's own active (hot) master layer. A
// non-null id with no matching master layer returns null (sparse: this glyph has
// no layer for that master). Multi-master storage lands in M1; today every glyph
// has a single master so a match falls back through to the hot content.
export const getActiveLayer = (
  glyph: GlyphData | undefined,
  activeMasterId: string | null | undefined
) => {
  if (!glyph) {
    return null
  }
  if (!activeMasterId) {
    return getGlyphLayer(glyph, null)
  }
  const master = listGlyphLayers(glyph).find(
    (layer) =>
      layer.type === 'master' && layer.associatedMasterId === activeMasterId
  )
  return master ?? null
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
