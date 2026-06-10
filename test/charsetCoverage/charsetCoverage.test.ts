import { describe, expect, it } from 'vitest'
import {
  buildGlyphLookupMap,
  computeCharsetCoverage,
} from 'src/lib/charsetCoverage'
import type { GlyphData } from 'src/store'

const makeGlyph = (input: {
  id: string
  unicode?: string | null
  drawn?: boolean
}): GlyphData =>
  ({
    id: input.id,
    name: input.id,
    unicode: input.unicode ?? null,
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: input.drawn ? [{ id: 'p1', nodes: [], closed: true }] : [],
    components: [],
    componentRefs: [],
  }) as unknown as GlyphData

const toGlyphMap = (glyphs: GlyphData[]) =>
  Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph]))

describe('computeCharsetCoverage', () => {
  it('splits glyph names into drawn, empty, and missing', () => {
    const lookup = buildGlyphLookupMap(
      toGlyphMap([
        makeGlyph({ id: 'A', unicode: '0041', drawn: true }),
        makeGlyph({ id: 'B', unicode: '0042', drawn: false }),
      ])
    )
    const coverage = computeCharsetCoverage(
      {
        id: 'test',
        label: 'Test',
        group: 'latin',
        section: 'Basic',
        glyphNames: ['A', 'B', 'C'],
      },
      lookup
    )
    expect(coverage.drawnCount).toBe(1)
    expect(coverage.emptyGlyphNames).toEqual(['B'])
    expect(coverage.missingGlyphNames).toEqual(['C'])
    expect(coverage.drawnRatio).toBeCloseTo(1 / 3)
  })

  it('matches uniXXXX package names against glyph unicodes', () => {
    const lookup = buildGlyphLookupMap(
      toGlyphMap([makeGlyph({ id: 'cid12345', unicode: '8655', drawn: true })])
    )
    const coverage = computeCharsetCoverage(
      {
        id: 'test',
        label: 'Test',
        group: 'zh',
        section: 'Han',
        glyphNames: ['uni8655'],
      },
      lookup
    )
    expect(coverage.drawnCount).toBe(1)
    expect(coverage.missingGlyphNames).toEqual([])
  })

  it('matches case-insensitively on glyph names', () => {
    const lookup = buildGlyphLookupMap(
      toGlyphMap([makeGlyph({ id: 'A', drawn: true })])
    )
    const coverage = computeCharsetCoverage(
      {
        id: 'test',
        label: 'Test',
        group: 'latin',
        section: 'Basic',
        glyphNames: ['A'],
      },
      lookup
    )
    expect(coverage.missingGlyphNames).toEqual([])
  })

  it('treats components-only glyphs as drawn', () => {
    const glyph = makeGlyph({ id: 'gou', drawn: false })
    ;(glyph as { componentRefs: unknown[] }).componentRefs = [{ id: 'c1' }]
    const lookup = buildGlyphLookupMap(toGlyphMap([glyph]))
    const coverage = computeCharsetCoverage(
      {
        id: 'test',
        label: 'Test',
        group: 'zh',
        section: 'Han',
        glyphNames: ['gou'],
      },
      lookup
    )
    expect(coverage.drawnCount).toBe(1)
  })
})
