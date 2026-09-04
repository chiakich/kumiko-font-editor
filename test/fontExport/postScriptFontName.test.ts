import { describe, expect, it } from 'vitest'
import opentype from 'opentype.js'
import {
  buildExportSfntBuffer,
  toPostScriptFontName,
} from '@/lib/fontFormats/fontBinaryFormat'
import { makeGlyph } from '../openTypeFeatures/openTypeFeatureTestHelpers'

describe('toPostScriptFontName', () => {
  it('keeps an ascii name, joining family and style', () => {
    expect(toPostScriptFontName('Kumiko Sans', 'Semi Bold')).toBe(
      'KumikoSans-SemiBold'
    )
  })

  it('strips non-ascii and postscript delimiters', () => {
    expect(toPostScriptFontName('未命名字體', 'Regular')).toBe(
      'KumikoExport-Regular'
    )
    expect(toPostScriptFontName('思源黑體 Sans (Test)', 'Regular')).toBe(
      'SansTest-Regular'
    )
  })

  it('never returns an empty name and caps at 63 characters', () => {
    expect(toPostScriptFontName('未命名', '字體')).toBe('KumikoExport')
    expect(toPostScriptFontName('A'.repeat(80), 'Regular')).toHaveLength(63)
  })
})

// A CJK family name used to reach the CFF Name INDEX as raw UTF-8, which
// fontTools rejects with "'ascii' codec can't decode byte …" the moment the
// feature compiler (or any consumer) reads the font back.
describe('export sfnt PostScript identity', () => {
  it('writes a sanitized PostScript name for a CJK family name', () => {
    const buffer = buildExportSfntBuffer({
      fontData: { unitsPerEm: 1000 },
      glyphs: [makeGlyph('.notdef'), makeGlyph('a', '0061')],
      familyName: '未命名字體',
    })
    const font = opentype.parse(buffer)
    expect(font.getEnglishName('postScriptName')).toBe('KumikoExport-Regular')
    // The display family name keeps the original text.
    expect(font.getEnglishName('fontFamily')).toBe('未命名字體')
  })
})
