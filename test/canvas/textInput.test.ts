import { describe, expect, it } from 'vitest'
import {
  buildGlyphIdByCharacter,
  buildTextInputCommitPlan,
} from '@/features/editor/canvas/workspace/layout/textInput'
import type { FontData, GlyphData } from '@/store'

const makeGlyph = (id: string, unicodes: string[] = []): GlyphData => ({
  id,
  name: id,
  unicodes,
})

const makeFontData = (
  glyphs: Record<string, GlyphData>,
  unitsPerEm = 1000
): FontData => ({
  glyphs,
  unitsPerEm,
})

const buildPlan = (
  fontData: FontData,
  value: string,
  selectionStart = value.length
) =>
  buildTextInputCommitPlan({
    fontData,
    glyphIdByCharacter: buildGlyphIdByCharacter(fontData),
    selectionStart,
    value,
  })

describe('canvas text input commit plan', () => {
  it('keeps existing Unicode glyphs in the editor line', () => {
    const fontData = makeFontData({
      A: makeGlyph('A', ['0041']),
    })

    expect(buildPlan(fontData, 'A')).toMatchObject({
      activeGlyphIndex: 0,
      cursorIndex: 1,
      glyphIds: ['A'],
      glyphsToAdd: [],
      text: 'A',
    })
  })

  it('uses an existing glyph id even when Unicode metadata is missing', () => {
    const fontData = makeFontData({
      A: makeGlyph('A'),
    })

    expect(buildPlan(fontData, 'A')).toMatchObject({
      glyphIds: ['A'],
      glyphsToAdd: [],
      text: 'A',
    })
  })

  it('creates glyph candidates for typed characters missing from the font', () => {
    const fontData = makeFontData({
      A: makeGlyph('A', ['0041']),
    })

    expect(buildPlan(fontData, 'AB你 ')).toEqual({
      activeGlyphIndex: 3,
      cursorIndex: 4,
      glyphIds: ['A', 'B', 'uni4F60', 'space'],
      glyphsToAdd: [
        {
          id: 'B',
          name: 'B',
          unicode: '0042',
          production: null,
        },
        {
          id: 'uni4F60',
          name: '你',
          unicode: '4F60',
          production: null,
          width: 1000,
        },
        {
          id: 'space',
          name: 'space',
          unicode: '0020',
          production: null,
        },
      ],
      text: 'AB你 ',
    })
  })

  it('ignores unsupported control whitespace when computing the cursor', () => {
    const fontData = makeFontData({
      A: makeGlyph('A', ['0041']),
    })

    expect(buildPlan(fontData, 'A\n\tB', 3)).toMatchObject({
      cursorIndex: 1,
      glyphIds: ['A', 'B'],
      text: 'AB',
    })
  })
})
