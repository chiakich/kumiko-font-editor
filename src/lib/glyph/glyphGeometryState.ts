import type { GlyphData } from 'src/store'

const LEGACY_GEOMETRY_KEYS = [
  'paths',
  'componentRefs',
  'anchors',
  'guidelines',
  'metrics',
] as const

export const hasLegacyGlyphGeometry = (glyph: GlyphData) => {
  const record = glyph as unknown as Record<string, unknown>
  return LEGACY_GEOMETRY_KEYS.some((key) => record[key] !== undefined)
}

export const isGlyphGeometryLoaded = (glyph: GlyphData | null | undefined) =>
  Boolean(glyph?.layers && Object.keys(glyph.layers).length > 0)

export const getGlyphComponentGlyphIds = (glyph: GlyphData) => {
  if (glyph.componentGlyphIds) {
    return glyph.componentGlyphIds
  }

  const ids = new Set<string>()
  for (const layer of Object.values(glyph.layers ?? {})) {
    for (const componentRef of layer.componentRefs ?? []) {
      ids.add(componentRef.glyphId)
    }
    for (const componentRef of layer.background?.componentRefs ?? []) {
      ids.add(componentRef.glyphId)
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right))
}
