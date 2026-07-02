import { describe, it, expect } from 'vitest'
import { findIncompatibleMasterGlyphs } from './canonicalBinaryExport'
import type { GlyphData, PathNode } from 'src/store'

const on = (x: number, y: number, id: string): PathNode => ({
  id,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'line',
})

const makeMasterGlyph = (id: string, nodeCount: number): GlyphData => ({
  id,
  name: id,
  unicodes: [],
  activeLayerId: 'public.default',
  layerOrder: ['public.default'],
  layers: {
    'public.default': {
      id: 'public.default',
      name: 'public.default',
      type: 'master',
      associatedMasterId: 'public.default',
      paths: [
        {
          id: 'p0',
          nodes: Array.from({ length: nodeCount }, (_, i) =>
            on(i * 10, 0, `n${i}`)
          ),
          closed: true,
        },
      ],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
  },
})

describe('findIncompatibleMasterGlyphs', () => {
  it('flags glyphs whose masters differ in node count', () => {
    const glyphs = [makeMasterGlyph('A', 4)]
    const result = findIncompatibleMasterGlyphs(glyphs, [
      { glyphs: [makeMasterGlyph('A', 4)] },
      { glyphs: [makeMasterGlyph('A', 5)] },
    ])
    expect(result).toEqual(['A'])
  })

  it('passes structurally identical masters', () => {
    const glyphs = [makeMasterGlyph('A', 4)]
    const result = findIncompatibleMasterGlyphs(glyphs, [
      { glyphs: [makeMasterGlyph('A', 4)] },
      { glyphs: [makeMasterGlyph('A', 4)] },
    ])
    expect(result).toEqual([])
  })
})
