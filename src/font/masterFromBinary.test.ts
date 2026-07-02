import { describe, it, expect } from 'vitest'
import { buildMasterFromBinaryFont } from './masterFromBinary'
import { getGlyphMasterLayerForSource } from './designspaceLocation'
import type { FontData, FontSource, GlyphData, PathNode } from 'src/store'

const node = (x: number, y: number, id: string): PathNode => ({
  id,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'line',
})

const makeGlyph = (id: string, unicodes: string[], x: number): GlyphData => ({
  id,
  name: id,
  unicodes,
  activeLayerId: 'public.default',
  layerOrder: ['public.default'],
  layers: {
    'public.default': {
      id: 'public.default',
      name: 'public.default',
      type: 'master',
      associatedMasterId: 'public.default',
      paths: [{ id: 'p0', nodes: [node(x, 0, 'n0')], closed: true }],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
  },
})

const source: FontSource = {
  id: 'master-bold',
  name: 'Bold',
  location: { Weight: 700 },
}

describe('buildMasterFromBinaryFont', () => {
  it('adds a master layer per matched glyph and reports unmatched', () => {
    const glyphs = [
      makeGlyph('A', ['0041'], 0),
      makeGlyph('B', ['0042'], 0),
      makeGlyph('onlyInProject', [], 0),
    ]
    const binaryFontData: Pick<FontData, 'glyphs'> = {
      glyphs: {
        // matches 'A' by name
        A: makeGlyph('A', ['0041'], 111),
        // matches 'B' by unicode even though the name differs
        Balt: makeGlyph('Balt', ['0042'], 222),
      },
    }

    const result = buildMasterFromBinaryFont({ glyphs, binaryFontData, source })

    expect(result.matchedGlyphIds).toEqual(['A', 'B'])
    expect(result.unmatchedGlyphIds).toEqual(['onlyInProject'])

    const a = result.glyphs.find((glyph) => glyph.id === 'A') as GlyphData
    const boldLayer = getGlyphMasterLayerForSource(a, 'master-bold')
    expect(boldLayer).toBeTruthy()
    expect(boldLayer?.paths[0].nodes[0].x).toBe(111)
    expect(a.layerOrder).toContain('master-bold')

    const b = result.glyphs.find((glyph) => glyph.id === 'B') as GlyphData
    expect(
      getGlyphMasterLayerForSource(b, 'master-bold')?.paths[0].nodes[0].x
    ).toBe(222)

    // Unmatched glyph is untouched (stays sparse at the new master).
    const other = result.glyphs.find(
      (glyph) => glyph.id === 'onlyInProject'
    ) as GlyphData
    expect(getGlyphMasterLayerForSource(other, 'master-bold')).toBeNull()
  })

  it('replaces an existing layer when re-importing to the same source id', () => {
    const glyph = makeGlyph('A', ['0041'], 0)
    const first = buildMasterFromBinaryFont({
      glyphs: [glyph],
      binaryFontData: { glyphs: { A: makeGlyph('A', ['0041'], 111) } },
      source,
    })
    const second = buildMasterFromBinaryFont({
      glyphs: first.glyphs,
      binaryFontData: { glyphs: { A: makeGlyph('A', ['0041'], 333) } },
      source,
    })
    const a = second.glyphs[0]
    expect(
      getGlyphMasterLayerForSource(a, 'master-bold')?.paths[0].nodes[0].x
    ).toBe(333)
    // No duplicate layerOrder entry.
    expect(a.layerOrder?.filter((id) => id === 'master-bold')).toHaveLength(1)
  })
})
