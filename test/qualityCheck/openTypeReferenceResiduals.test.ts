import opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { buildRadarReferenceDataFromOpenTypeFont } from 'src/lib/qualityCheck/openTypeReferenceResiduals'

const makeRectPath = (
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
) => {
  const path = new opentype.Path()
  path.moveTo(xMin, yMin)
  path.lineTo(xMax, yMin)
  path.lineTo(xMax, yMax)
  path.lineTo(xMin, yMax)
  path.close()
  return path
}

const makeGlyph = (character: string, index: number) =>
  new opentype.Glyph({
    name: `glyph${index}`,
    unicode: character.codePointAt(0),
    advanceWidth: 1000,
    path: makeRectPath(
      80 + (index % 5) * 4,
      -80 + (index % 3) * 2,
      920 - (index % 4) * 3,
      820 + (index % 6) * 4
    ),
  })

describe('buildRadarReferenceDataFromOpenTypeFont', () => {
  it('builds partial reference residuals from an OpenType font', () => {
    const glyphs = [
      new opentype.Glyph({ name: '.notdef', advanceWidth: 1000 }),
      ...Array.from({ length: 28 }, (_, index) =>
        makeGlyph(String.fromCodePoint(0x4e00 + index), index)
      ),
    ]
    const font = new opentype.Font({
      familyName: 'Synthetic Reference',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 880,
      descender: -120,
      glyphs,
    })

    const result = buildRadarReferenceDataFromOpenTypeFont(
      font,
      'Synthetic Reference',
      new Set()
    )

    expect(result.sampleCount).toBe(28)
    expect(result.entryCount).toBeGreaterThan(20)
    expect(result.data.source).toBe('Synthetic Reference')
    expect(result.data.defaultConfidence).toBe(0.75)
    expect(result.data.residualsByCharacter['一']).toEqual(
      expect.objectContaining({
        'face:widthRatio': expect.any(Number),
        'face:heightRatio': expect.any(Number),
      })
    )
  })

  it('rejects fonts without enough Han outlines', () => {
    const font = new opentype.Font({
      familyName: 'Tiny Reference',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 880,
      descender: -120,
      glyphs: [
        new opentype.Glyph({ name: '.notdef', advanceWidth: 1000 }),
        makeGlyph('一', 0),
      ],
    })

    expect(() =>
      buildRadarReferenceDataFromOpenTypeFont(font, 'Tiny Reference', new Set())
    ).toThrow('漢字輪廓不足')
  })
})
