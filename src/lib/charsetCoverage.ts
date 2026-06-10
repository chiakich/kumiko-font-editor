import type { GlyphData } from 'src/store'

export interface CharsetCoverageInput {
  id: string
  label: string
  group: string
  section: string
  glyphNames: string[]
}

export interface CharsetCoverage {
  packageId: string
  label: string
  group: string
  section: string
  total: number
  drawnCount: number
  emptyGlyphNames: string[]
  missingGlyphNames: string[]
  drawnRatio: number
}

const isGlyphDrawn = (glyph: GlyphData) =>
  glyph.paths.length > 0 || glyph.componentRefs.length > 0

const addLookupKeys = (keys: string[], glyphName: string) => {
  keys.push(glyphName.toLowerCase())

  const uniMatch = glyphName.match(/^uni([0-9a-fA-F]{4,6})$/)
  if (uniMatch?.[1]) {
    keys.push(uniMatch[1].toUpperCase())
  }

  const uMatch = glyphName.match(/^u([0-9a-fA-F]{5,6})$/)
  if (uMatch?.[1]) {
    keys.push(uMatch[1].toUpperCase())
  }
}

// Same key scheme as glyphLookup, but keeping the glyph reference so
// coverage can distinguish "drawn" from "exists but still empty".
export const buildGlyphLookupMap = (glyphMap: Record<string, GlyphData>) => {
  const lookup = new Map<string, GlyphData>()
  for (const glyph of Object.values(glyphMap)) {
    const keys: string[] = []
    addLookupKeys(keys, glyph.id)
    addLookupKeys(keys, glyph.name)
    if (glyph.unicode) {
      const unicode = glyph.unicode.toUpperCase()
      keys.push(unicode)
      keys.push(`uni${unicode}`.toLowerCase())
    }
    for (const key of keys) {
      if (!lookup.has(key)) {
        lookup.set(key, glyph)
      }
    }
  }
  return lookup
}

export const findGlyphByPackageName = (
  lookup: Map<string, GlyphData>,
  glyphName: string
) => {
  const keys: string[] = []
  addLookupKeys(keys, glyphName)
  for (const key of keys) {
    const glyph = lookup.get(key)
    if (glyph) {
      return glyph
    }
  }
  return null
}

export const computeCharsetCoverage = (
  charsetPackage: CharsetCoverageInput,
  lookup: Map<string, GlyphData>
): CharsetCoverage => {
  const emptyGlyphNames: string[] = []
  const missingGlyphNames: string[] = []
  let drawnCount = 0

  for (const glyphName of charsetPackage.glyphNames) {
    const glyph = findGlyphByPackageName(lookup, glyphName)
    if (!glyph) {
      missingGlyphNames.push(glyphName)
    } else if (isGlyphDrawn(glyph)) {
      drawnCount += 1
    } else {
      emptyGlyphNames.push(glyphName)
    }
  }

  const total = charsetPackage.glyphNames.length
  return {
    packageId: charsetPackage.id,
    label: charsetPackage.label,
    group: charsetPackage.group,
    section: charsetPackage.section,
    total,
    drawnCount,
    emptyGlyphNames,
    missingGlyphNames,
    drawnRatio: total > 0 ? drawnCount / total : 1,
  }
}
