import { describe, it, expect } from 'vitest'
import {
  buildEmptyMasterLayer,
  buildCopiedMasterLayer,
} from './masterLayerBuilders'
import type { FontSource, GlyphLayerData, PathNode } from 'src/store'

const on = (x: number, y: number, id: string): PathNode => ({
  id,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'line',
})

const base: GlyphLayerData = {
  id: 'default',
  name: 'Regular',
  type: 'master',
  associatedMasterId: 'default',
  paths: [
    {
      id: 'p0',
      nodes: [
        on(0, 0, 'a'),
        on(100, 0, 'b'),
        on(100, 100, 'c'),
        on(0, 100, 'd'),
      ],
      closed: true,
    },
  ],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 10, rsb: 20, width: 500 },
}

const source: FontSource = {
  id: 'bold',
  name: 'Bold',
  location: { Weight: 700 },
}

describe('buildEmptyMasterLayer', () => {
  it('produces an empty outline keyed to the source, preserving advance width', () => {
    const layer = buildEmptyMasterLayer(source, base)
    expect(layer.id).toBe('bold')
    expect(layer.associatedMasterId).toBe('bold')
    expect(layer.paths).toEqual([])
    expect(layer.componentRefs).toEqual([])
    expect(layer.metrics.width).toBe(500)
  })
})

describe('buildCopiedMasterLayer', () => {
  it('clones the base outline at distance 0 with stable node ids', () => {
    const layer = buildCopiedMasterLayer(source, base, 0)
    expect(layer.id).toBe('bold')
    expect(layer.paths[0].nodes.map((node) => node.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(layer.metrics.width).toBe(500)
  })

  it('emboldens the outline for a positive distance (area grows)', () => {
    const layer = buildCopiedMasterLayer(source, base, 20)
    const xs = layer.paths[0].nodes.map((node) => node.x)
    // The offset square should extend past the original [0, 100] bounds.
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(100)
  })
})
