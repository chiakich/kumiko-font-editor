import { describe, expect, it } from 'vitest'
import { parseCompositionLine } from 'src/lib/glyphwikiComposition'

describe('parseCompositionLine', () => {
  it('parses a two-part composition with variants', () => {
    const parsed = parseCompositionLine(
      '灶\t火:14,18,87,185:01\t土:78,17,187,175:02'
    )
    expect(parsed?.target).toBe('灶')
    expect(parsed?.parts).toEqual([
      { char: '火', box: { x1: 14, y1: 18, x2: 87, y2: 185 }, variant: '01' },
      { char: '土', box: { x1: 78, y1: 17, x2: 187, y2: 175 }, variant: '02' },
    ])
  })

  it('keeps variant null when missing', () => {
    const parsed = parseCompositionLine('煙\t火:12,18,78,185\t垔:77,28,189,177')
    expect(parsed?.parts[0]?.variant).toBeNull()
  })

  it('rejects single-part and malformed lines', () => {
    expect(parseCompositionLine('灶\t火:14,18,87,185')).toBeNull()
    expect(parseCompositionLine('灶\t火:14,18,87')).toBeNull()
    expect(parseCompositionLine('')).toBeNull()
  })
})
