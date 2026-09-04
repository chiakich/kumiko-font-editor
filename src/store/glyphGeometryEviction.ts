import { isGlyphGeometryLoaded } from '@/domain/glyphGeometryState'
import type { GlyphData } from '@/domain'

export const DEFAULT_MAX_RESIDENT_GLYPH_GEOMETRY = 800

interface EvictGlyphGeometryInput {
  glyphs: Record<string, GlyphData>
  accessByGlyphId: Record<string, number>
  dirtyGlyphIds?: string[]
  localDirtyGlyphIds?: string[]
  deletedGlyphIds?: string[]
  localDeletedGlyphIds?: string[]
  editorGlyphIds?: string[]
  selectedGlyphId?: string | null
  keepGlyphIds?: string[]
  maxLoadedGlyphs?: number
}

export const evictGlyphGeometry = ({
  glyphs,
  accessByGlyphId,
  dirtyGlyphIds = [],
  localDirtyGlyphIds = [],
  deletedGlyphIds = [],
  localDeletedGlyphIds = [],
  editorGlyphIds = [],
  selectedGlyphId = null,
  keepGlyphIds = [],
  maxLoadedGlyphs = DEFAULT_MAX_RESIDENT_GLYPH_GEOMETRY,
}: EvictGlyphGeometryInput) => {
  if (maxLoadedGlyphs < 1) {
    return []
  }

  const protectedGlyphIds = new Set([
    ...dirtyGlyphIds,
    ...localDirtyGlyphIds,
    ...deletedGlyphIds,
    ...localDeletedGlyphIds,
    ...editorGlyphIds,
    ...keepGlyphIds,
  ])
  if (selectedGlyphId) {
    protectedGlyphIds.add(selectedGlyphId)
  }

  const loadedGlyphs = Object.values(glyphs).filter(isGlyphGeometryLoaded)
  const overflow = loadedGlyphs.length - maxLoadedGlyphs
  if (overflow <= 0) {
    return []
  }

  const evictionCandidates = loadedGlyphs
    .filter((glyph) => !protectedGlyphIds.has(glyph.id))
    .sort((left, right) => {
      const accessDelta =
        (accessByGlyphId[left.id] ?? 0) - (accessByGlyphId[right.id] ?? 0)
      return accessDelta || left.id.localeCompare(right.id)
    })
    .slice(0, overflow)

  for (const glyph of evictionCandidates) {
    delete glyph.layers
    glyph.activeLayerId = null
    delete accessByGlyphId[glyph.id]
  }

  return evictionCandidates.map((glyph) => glyph.id)
}
