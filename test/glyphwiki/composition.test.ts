import { describe, expect, it } from 'vitest'
import {
  buildDeepPlacements,
  composeNestedPartBox,
  parseCompositionLine,
  type GlyphwikiPartPlacement,
} from '@/lib/glyph/glyphwikiComposition'

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

describe('composeNestedPartBox', () => {
  it('maps an inner box through the parent placement', () => {
    // Parent occupies the right half; its drawn area spans 0..200 in its
    // own canvas, with the inner part in the bottom half.
    const composed = composeNestedPartBox(
      { x1: 100, y1: 0, x2: 200, y2: 200 },
      { x1: 0, y1: 0, x2: 200, y2: 200 },
      { x1: 0, y1: 100, x2: 200, y2: 200 }
    )
    expect(composed).toEqual({ x1: 100, y1: 100, x2: 200, y2: 200 })
  })
})

describe('buildDeepPlacements', () => {
  const makeMap = () =>
    new Map<string, GlyphwikiPartPlacement[]>([
      [
        '煙',
        [
          {
            char: '火',
            box: { x1: 12, y1: 18, x2: 78, y2: 185 },
            variant: '01',
          },
          {
            char: '垔',
            box: { x1: 77, y1: 28, x2: 189, y2: 177 },
            variant: null,
          },
        ],
      ],
      [
        '垔',
        [
          {
            char: '西',
            box: { x1: 20, y1: 10, x2: 180, y2: 90 },
            variant: null,
          },
          {
            char: '土',
            box: { x1: 20, y1: 100, x2: 180, y2: 190 },
            variant: null,
          },
        ],
      ],
    ])

  it('includes nested parts with composed boxes after direct parts', () => {
    const placements = buildDeepPlacements(makeMap(), '煙')!
    expect(placements.map((part) => part.char)).toEqual([
      '火',
      '垔',
      '西',
      '土',
    ])
    const earth = placements.find((part) => part.char === '土')!
    // 土 sits in the lower half of 垔's region within 煙.
    expect(earth.box.x1).toBeGreaterThanOrEqual(77)
    expect(earth.box.x2).toBeLessThanOrEqual(189)
    expect(earth.box.y1).toBeGreaterThan(100)
  })

  it('limits recursion depth', () => {
    const placements = buildDeepPlacements(makeMap(), '煙', 1)!
    expect(placements.map((part) => part.char)).toEqual(['火', '垔'])
  })

  it('returns null for unknown characters', () => {
    expect(buildDeepPlacements(makeMap(), '火')).toBeNull()
  })
})
