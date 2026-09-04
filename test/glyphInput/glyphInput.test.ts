import { describe, expect, it } from 'vitest'
import {
  isCjkDefaultFullWidthCodePoint,
  parseGlyphAdditionInput,
} from '@/features/fontOverview/utils/glyphInput'
import {
  buildGlyphNameInfoMap,
  parseGlyphDataLine,
} from '@/lib/glyph/glyphNameInfo'

const infoMap = buildGlyphNameInfoMap(
  [
    'leftArrow\t2190\tarrowleft\t',
    'bar\t007C\t\tverticalbar',
    'Asmall\t\tuni1D00\t',
  ].join('\n')
)

describe('parseGlyphDataLine', () => {
  it('maps the primary name and alt names to the same info', () => {
    const map = buildGlyphNameInfoMap('bar\t007C\t\tverticalbar')
    expect(map.get('bar')).toEqual({ unicode: '007C', production: null })
    expect(map.get('verticalbar')).toEqual({
      unicode: '007C',
      production: null,
    })
  })

  it('keeps empty unicode/production as null', () => {
    expect(parseGlyphDataLine('Asmall\t\tuni1D00\t')?.info).toEqual({
      unicode: null,
      production: 'uni1D00',
    })
  })
})

describe('parseGlyphAdditionInput with GlyphData lookup', () => {
  it('resolves a Glyphs nice name to its unicode and production name', () => {
    const [candidate] = parseGlyphAdditionInput('leftArrow', infoMap)
    expect(candidate).toMatchObject({
      id: 'leftArrow',
      unicode: '2190',
      production: 'arrowleft',
    })
  })

  it('resolves an alt name', () => {
    const [candidate] = parseGlyphAdditionInput('verticalbar', infoMap)
    expect(candidate?.unicode).toBe('007C')
  })

  it('keeps unicode null for an unencoded named glyph but retains production', () => {
    const [candidate] = parseGlyphAdditionInput('Asmall', infoMap)
    expect(candidate).toMatchObject({ unicode: null, production: 'uni1D00' })
  })

  it('still derives uniXXXX and single chars without the map', () => {
    expect(parseGlyphAdditionInput('uni4E00')[0]).toMatchObject({
      unicode: '4E00',
      production: null,
    })
    expect(parseGlyphAdditionInput('A')[0]).toMatchObject({
      unicode: '0041',
      production: null,
    })
  })

  it('returns null unicode for unknown names without the map', () => {
    expect(parseGlyphAdditionInput('leftArrow')[0]).toMatchObject({
      unicode: null,
      production: null,
    })
  })
})

describe('isCjkDefaultFullWidthCodePoint', () => {
  it('classifies CJK ideographs and fullwidth forms as full-width defaults', () => {
    expect(isCjkDefaultFullWidthCodePoint(0x4e00)).toBe(true)
    expect(isCjkDefaultFullWidthCodePoint(0xff21)).toBe(true)
  })

  it('does not classify Latin letters as full-width defaults', () => {
    expect(isCjkDefaultFullWidthCodePoint(0x0041)).toBe(false)
  })
})
