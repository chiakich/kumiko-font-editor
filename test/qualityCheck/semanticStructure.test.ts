import { describe, expect, it } from 'vitest'
import { buildEnclosureCharacterSet } from 'src/features/common/qualityCheck/utils/semanticStructure'
import {
  parseCompositionLine,
  type GlyphwikiPartPlacement,
} from 'src/lib/glyph/glyphwikiComposition'

const buildMap = (lines: string[]) => {
  const map = new Map<string, GlyphwikiPartPlacement[]>()
  for (const line of lines) {
    const parsed = parseCompositionLine(line)
    if (parsed) {
      map.set(parsed.target, parsed.parts)
    }
  }
  return map
}

describe('buildEnclosureCharacterSet', () => {
  it('classifies glyphs whose direct part is a canvas-spanning enclosure', () => {
    const map = buildMap([
      // 實際 dump 格式：囗/門 部件框住大半畫布
      '國\t囗:30,28,170,172:j\t或:43,36,157,166:j',
      '問\t門:29,27,171,186:05\t口:71,108,131,152:j',
      // 左右結構，無包圍
      '煙\t火:14,20,90,180:03\t垔:95,18,186,182:j',
      // 囗 出現但只是小部件，不構成包圍
      '𠮷\t士:40,20,160,90:j\t囗:60,110,140,180:j',
    ])
    const enclosed = buildEnclosureCharacterSet(map)
    expect(enclosed.has('國')).toBe(true)
    expect(enclosed.has('問')).toBe(true)
    expect(enclosed.has('煙')).toBe(false)
    expect(enclosed.has('𠮷')).toBe(false)
  })
})
