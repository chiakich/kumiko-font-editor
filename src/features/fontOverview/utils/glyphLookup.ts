import type { GlyphData } from 'src/store'
import { getPrimaryGlyphUnicode } from 'src/lib/glyph/glyphUnicode'

export const addGlyphLookupKeys = (keys: Set<string>, glyphName: string) => {
  keys.add(glyphName.toLowerCase())

  const uniMatch = glyphName.match(/^uni([0-9a-fA-F]{4,6})$/)
  if (uniMatch?.[1]) {
    keys.add(uniMatch[1].toUpperCase())
  }

  const uMatch = glyphName.match(/^u([0-9a-fA-F]{5,6})$/)
  if (uMatch?.[1]) {
    keys.add(uMatch[1].toUpperCase())
  }
}

export const getGlyphCandidateLookupKeys = (candidate: {
  id: string
  name: string
  unicode: string | null
}) => {
  const keys = new Set<string>()
  addGlyphLookupKeys(keys, candidate.id)
  addGlyphLookupKeys(keys, candidate.name)
  if (candidate.unicode) {
    const unicode = candidate.unicode.toUpperCase()
    keys.add(unicode)
    keys.add(`uni${unicode}`.toLowerCase())
  }
  return keys
}

export const getExistingGlyphLookupKeys = (
  glyphMap: Record<string, GlyphData>
) => {
  const keys = new Set<string>()
  for (const glyph of Object.values(glyphMap)) {
    addGlyphLookupKeys(keys, glyph.id)
    addGlyphLookupKeys(keys, glyph.name)
    const primaryUnicode = getPrimaryGlyphUnicode(glyph)
    if (primaryUnicode) {
      const unicode = primaryUnicode.toUpperCase()
      keys.add(unicode)
      keys.add(`uni${unicode}`.toLowerCase())
    }
  }
  return keys
}

export const hasGlyphCandidate = (
  existingGlyphKeys: Set<string>,
  candidate: {
    id: string
    name: string
    unicode: string | null
  }
) =>
  Array.from(getGlyphCandidateLookupKeys(candidate)).some((key) =>
    existingGlyphKeys.has(key)
  )
