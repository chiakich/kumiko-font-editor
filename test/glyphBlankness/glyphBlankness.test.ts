import { describe, expect, it } from 'vitest'
import {
  isEmptyGlyphToEdit,
  isKnownBlankGlyph,
} from 'src/lib/glyph/glyphBlankness'
import type { GlyphData } from 'src/store'
import { normalizeGlyphToLayers } from 'src/store'

const makeGlyph = (input: {
  id: string
  unicode?: string | null
  drawn?: boolean
}): GlyphData =>
  normalizeGlyphToLayers({
    id: input.id,
    name: input.id,
    unicodes: input.unicode ? [input.unicode] : [],
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: input.drawn ? [{ id: 'p1', nodes: [], closed: true }] : [],
    components: [],
    componentRefs: [],
  }) as unknown as GlyphData

describe('glyph blankness', () => {
  it('recognizes known blank glyph names and unicodes', () => {
    expect(isKnownBlankGlyph(makeGlyph({ id: 'space' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'zerowidthjoiner' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'zerowidthspace' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'hairspace' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'thinspace' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'punctuationspace' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'figurespace' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'enspace' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'DEL' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'CR' }))).toBe(true)
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '3000' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '200D' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '200B' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '200A' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '2009' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '2008' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '2007' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '2002' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '007F' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'cid1', unicode: '000D' }))).toBe(
      true
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: 'A', unicode: '0041' }))).toBe(
      false
    )
    expect(isKnownBlankGlyph(makeGlyph({ id: '.notdef' }))).toBe(false)
  })

  it('excludes known blank glyphs from editable empty glyphs', () => {
    expect(isEmptyGlyphToEdit(makeGlyph({ id: 'space' }))).toBe(false)
    expect(isEmptyGlyphToEdit(makeGlyph({ id: 'A', drawn: false }))).toBe(true)
    expect(isEmptyGlyphToEdit(makeGlyph({ id: 'A', drawn: true }))).toBe(false)
  })
})
