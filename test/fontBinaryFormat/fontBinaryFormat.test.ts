import { describe, expect, it } from 'vitest'
import { getBinaryExportGlyphList } from 'src/lib/fontBinaryFormat'
import type { FontData, GlyphData } from 'src/store'

const makeGlyph = (id: string, unicode: string | null = null): GlyphData =>
  ({
    id,
    name: id,
    unicode,
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: [],
    components: [],
    componentRefs: [],
  }) as unknown as GlyphData

describe('getBinaryExportGlyphList', () => {
  it('places .notdef first and preserves unencoded glyphs', () => {
    const fontData: FontData = {
      glyphOrder: ['A', '.notdef'],
      glyphs: {
        A: makeGlyph('A', '0041'),
        '.notdef': makeGlyph('.notdef'),
        unencoded: makeGlyph('unencoded'),
      },
    }

    const glyphList = getBinaryExportGlyphList(fontData)

    expect(glyphList.map((glyph) => glyph.id)).toEqual([
      '.notdef',
      'A',
      'unencoded',
    ])
    expect(glyphList[0]?.unicode).toBeNull()
    expect(glyphList[2]?.unicode).toBeNull()
  })
})
