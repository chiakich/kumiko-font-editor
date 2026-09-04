import { describe, expect, it } from 'vitest'
import { wouldCreateComponentCycle } from '@/store/glyphGeometry'
import { normalizeGlyphToLayers } from '@/store'
import type { GlyphData } from '@/store/types'

const makeGlyph = (id: string, componentGlyphIds: string[] = []): GlyphData =>
  normalizeGlyphToLayers({
    id,
    name: id,
    paths: [],
    components: [],
    componentRefs: componentGlyphIds.map((glyphId, index) => ({
      id: `c${index}`,
      glyphId,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    })),
    metrics: { width: 1000, lsb: 0, rsb: 0 },
  } as unknown as GlyphData)

describe('wouldCreateComponentCycle', () => {
  it('rejects self references', () => {
    const glyphMap = { A: makeGlyph('A') }
    expect(wouldCreateComponentCycle(glyphMap, 'A', 'A')).toBe(true)
  })

  it('allows acyclic references', () => {
    const glyphMap = {
      host: makeGlyph('host'),
      part: makeGlyph('part'),
    }
    expect(wouldCreateComponentCycle(glyphMap, 'host', 'part')).toBe(false)
  })

  it('rejects indirect cycles', () => {
    // part -> nested -> host would close the loop host -> part.
    const glyphMap = {
      host: makeGlyph('host'),
      part: makeGlyph('part', ['nested']),
      nested: makeGlyph('nested', ['host']),
    }
    expect(wouldCreateComponentCycle(glyphMap, 'host', 'part')).toBe(true)
  })

  it('allows shared diamond-shaped composition', () => {
    const glyphMap = {
      host: makeGlyph('host', ['left']),
      left: makeGlyph('left', ['base']),
      right: makeGlyph('right', ['base']),
      base: makeGlyph('base'),
    }
    expect(wouldCreateComponentCycle(glyphMap, 'host', 'right')).toBe(false)
  })
})
