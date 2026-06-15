import { describe, expect, it } from 'vitest'
import { serializeGlyphsFileToBlob } from 'src/lib/glyphsExport'
import type { GlyphsDocument } from 'src/lib/glyphsDocument'
import type { FontData, GlyphData } from 'src/store'

const glyph = (id: string, name: string, unicode: string | null): GlyphData =>
  ({
    id,
    name,
    unicode,
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: [],
    components: [],
    componentRefs: [],
  }) as unknown as GlyphData

describe('serializeGlyphsFileToBlob glyph matching', () => {
  it('keeps a second glyph that shares a unicode with another', async () => {
    const fontData = {
      glyphs: {
        A: glyph('A', 'A', '0041'),
        'A.alt': glyph('A.alt', 'A.alt', '0041'),
      },
    } as unknown as FontData
    // The original document only knows about A; A.alt is a new glyph that also
    // carries unicode 0041 — it must not be dropped on export.
    const document = {
      glyphs: [{ glyphname: 'A', unicode: '0041' }],
    } as unknown as GlyphsDocument

    const text = await serializeGlyphsFileToBlob(
      fontData,
      null,
      document
    ).text()

    expect(text).toContain('A.alt')
    expect(text).toMatch(/glyphname = A\b/)
  })
})
