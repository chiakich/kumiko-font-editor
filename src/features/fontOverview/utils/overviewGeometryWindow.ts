import type { GlyphData } from 'src/store'
import {
  getGlyphComponentGlyphIds,
  isGlyphGeometryLoaded,
} from 'src/lib/glyph/glyphGeometryState'

export const OVERVIEW_GEOMETRY_PRELOAD_MARGIN = 48
export const OVERVIEW_MAX_RESIDENT_GLYPH_GEOMETRY = 480
const OVERVIEW_GEOMETRY_CLOSURE_MAX_DEPTH = 8

export const collectOverviewGeometryGlyphIds = (
  glyphs: GlyphData[],
  range: { startIndex: number; endIndex: number },
  margin = OVERVIEW_GEOMETRY_PRELOAD_MARGIN
) => {
  if (glyphs.length === 0 || range.endIndex < range.startIndex) {
    return []
  }

  const startIndex = Math.max(0, range.startIndex - margin)
  const endIndex = Math.min(glyphs.length - 1, range.endIndex + margin)
  return glyphs.slice(startIndex, endIndex + 1).map((glyph) => glyph.id)
}

export const collectUnloadedOverviewGeometryGlyphIds = (
  glyphIds: string[],
  glyphMap: Record<string, GlyphData>,
  maxDepth = OVERVIEW_GEOMETRY_CLOSURE_MAX_DEPTH
) => {
  const unloadedGlyphIds = new Set<string>()
  const visitedGlyphIds = new Set<string>()

  const visit = (glyphId: string, depth: number) => {
    if (depth > maxDepth || visitedGlyphIds.has(glyphId)) {
      return
    }
    visitedGlyphIds.add(glyphId)

    const glyph = glyphMap[glyphId]
    if (!glyph) {
      return
    }
    if (!isGlyphGeometryLoaded(glyph)) {
      unloadedGlyphIds.add(glyphId)
    }

    for (const componentGlyphId of getGlyphComponentGlyphIds(glyph)) {
      visit(componentGlyphId, depth + 1)
    }
  }

  for (const glyphId of glyphIds) {
    visit(glyphId, 0)
  }

  return [...unloadedGlyphIds]
}
