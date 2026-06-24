import { describe, expect, it } from 'vitest'
import {
  buildUfoLibFromFontData,
  fontAxesFromLib,
} from 'src/lib/fontFormats/fontInfoSettings'
import type { FontData, GlyphData } from 'src/store'

const makeGlyph = (id: string, production: string | null): GlyphData =>
  ({
    id,
    name: id,
    unicodes: [],
    production,
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: [],
    components: [],
    componentRefs: [],
  }) as unknown as GlyphData

const makeFontData = (glyphs: GlyphData[]): FontData =>
  ({
    glyphs: Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
  }) as unknown as FontData

describe('buildUfoLibFromFontData public.postscriptNames', () => {
  it('maps glyph id to production name when they differ', () => {
    const lib = buildUfoLibFromFontData(
      makeFontData([makeGlyph('leftArrow', 'arrowleft')])
    )
    expect(lib['public.postscriptNames']).toEqual({ leftArrow: 'arrowleft' })
  })

  it('omits glyphs without a production name or where it equals the id', () => {
    const lib = buildUfoLibFromFontData(
      makeFontData([
        makeGlyph('A', null),
        makeGlyph('uni4E00', 'uni4E00'),
        makeGlyph('leftArrow', 'arrowleft'),
      ])
    )
    expect(lib['public.postscriptNames']).toEqual({ leftArrow: 'arrowleft' })
  })

  it('omits the key entirely when no glyph needs remapping', () => {
    const lib = buildUfoLibFromFontData(makeFontData([makeGlyph('A', null)]))
    expect('public.postscriptNames' in lib).toBe(false)
  })
})

describe('buildUfoLibFromFontData public.glyphOrder', () => {
  const makeFontDataWithOrder = (
    glyphs: GlyphData[],
    glyphOrder?: string[]
  ): FontData =>
    ({
      glyphs: Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
      ...(glyphOrder ? { glyphOrder } : {}),
    }) as unknown as FontData

  it('honors glyphOrder and appends glyphs missing from it', () => {
    const lib = buildUfoLibFromFontData(
      makeFontDataWithOrder(
        [makeGlyph('A', null), makeGlyph('B', null), makeGlyph('C', null)],
        ['B', 'A']
      )
    )
    expect(lib['public.glyphOrder']).toEqual(['B', 'A', 'C'])
  })

  it('drops ids in glyphOrder that have no glyph', () => {
    const lib = buildUfoLibFromFontData(
      makeFontDataWithOrder([makeGlyph('A', null)], ['A', 'ghost'])
    )
    expect(lib['public.glyphOrder']).toEqual(['A'])
  })

  it('falls back to glyph keys when glyphOrder is absent', () => {
    const lib = buildUfoLibFromFontData(
      makeFontDataWithOrder([makeGlyph('A', null), makeGlyph('B', null)])
    )
    expect(lib['public.glyphOrder']).toEqual(['A', 'B'])
  })
})

describe('fontAxesFromLib', () => {
  it('preserves discrete values and axis mappings from Kumiko UFO lib metadata', () => {
    const lib = buildUfoLibFromFontData({
      glyphs: {},
      axes: {
        axes: [
          {
            name: 'Italic',
            label: 'Italic',
            tag: 'ital',
            minValue: 0,
            defaultValue: 0,
            maxValue: 1,
            values: [0, 1],
            mapping: [
              [0, 0],
              [1, 100],
            ],
          },
        ],
        mappings: [],
      },
    } as unknown as FontData)

    expect(fontAxesFromLib(lib)?.axes[0]).toMatchObject({
      values: [0, 1],
      mapping: [
        [0, 0],
        [1, 100],
      ],
    })
  })
})
