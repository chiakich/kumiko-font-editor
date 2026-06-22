import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import { getGlyphLayer } from 'src/store/glyphLayer'
import type { GlyphData, GlyphLayerData } from 'src/store/types'

export interface OverviewGlyphPreviewSnapshot {
  cacheKey: string
  glyphs: Record<string, GlyphData>
  isReady: boolean
}

const MAX_COMPONENT_DEPTH = 8

const layerIdentityKeys = new WeakMap<GlyphLayerData, number>()
let nextLayerIdentityKey = 1

const getLayerIdentityKey = (layer: GlyphLayerData) => {
  let key = layerIdentityKeys.get(layer)
  if (!key) {
    key = nextLayerIdentityKey
    nextLayerIdentityKey += 1
    layerIdentityKeys.set(layer, key)
  }
  return key
}

export const createOverviewGlyphPreviewSnapshot = (
  glyphId: string,
  glyphMap: Record<string, GlyphData>,
  layerId: string | null,
  glyphEditTimes: GlyphEditTimes
): OverviewGlyphPreviewSnapshot | null => {
  const rootGlyph = glyphMap[glyphId]
  if (!rootGlyph) {
    return null
  }

  const glyphs: Record<string, GlyphData> = {}
  const keyParts: string[] = []
  let isReady = true

  const visit = (
    currentGlyphId: string,
    currentLayerId: string | null,
    depth: number,
    visited: Set<string>
  ) => {
    if (depth > MAX_COMPONENT_DEPTH || visited.has(currentGlyphId)) {
      return
    }

    const glyph = glyphMap[currentGlyphId]
    if (!glyph) {
      keyParts.push(`${currentGlyphId}:missing-glyph`)
      isReady = false
      return
    }

    const nextVisited = new Set(visited)
    nextVisited.add(currentGlyphId)
    glyphs[currentGlyphId] = glyph

    const layer = getGlyphLayer(glyph, currentLayerId)
    if (!layer) {
      keyParts.push(`${currentGlyphId}:${currentLayerId ?? ''}:missing-layer`)
      isReady = false
      return
    }

    keyParts.push(
      [
        currentGlyphId,
        currentLayerId ?? '',
        layer.id,
        getLayerIdentityKey(layer),
        glyphEditTimes[currentGlyphId] ?? 0,
      ].join(':')
    )

    for (const componentRef of layer.componentRefs) {
      visit(componentRef.glyphId, null, depth + 1, nextVisited)
    }
  }

  visit(glyphId, layerId, 0, new Set())

  return {
    cacheKey: keyParts.join('|'),
    glyphs,
    isReady,
  }
}
