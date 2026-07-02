import { describe, it, expect } from 'vitest'
import {
  deriveStatAxisLabels,
  findIncompatibleMasterGlyphs,
} from './canonicalBinaryExport'
import type {
  FontAxis,
  FontExportInstance,
  GlyphData,
  PathNode,
} from 'src/store'

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

describe('deriveStatAxisLabels', () => {
  const axis = (
    name: string,
    tag: string,
    min: number,
    def: number,
    max: number
  ): FontAxis => ({
    name,
    label: name,
    tag,
    minValue: min,
    defaultValue: def,
    maxValue: max,
  })

  const instance = (
    styleName: string,
    location: Record<string, number>,
    customData?: Record<string, unknown>
  ): FontExportInstance => ({
    id: styleName,
    name: styleName,
    styleName,
    location,
    export: true,
    ...(customData ? { customData } : {}),
  })

  const weight = axis('Weight', 'wght', 400, 400, 700)
  const width = axis('Width', 'wdth', 75, 100, 100)

  it('labels each axis from single-axis instances with an elidable default', () => {
    const labels = deriveStatAxisLabels(
      [weight, width],
      [
        instance('Regular', { Weight: 400, Width: 100 }),
        instance('SemiBold', { Weight: 600, Width: 100 }),
        instance('Bold', { Weight: 700, Width: 100 }),
        instance('Condensed', { Weight: 400, Width: 75 }),
        // Mixed-axis instance must NOT contribute to either axis' labels.
        instance('Bold Condensed', { Weight: 700, Width: 75 }),
      ]
    )
    expect(labels.Weight).toEqual([
      { name: 'Regular', value: 400, elidable: true },
      { name: 'SemiBold', value: 600, elidable: undefined },
      { name: 'Bold', value: 700, elidable: undefined },
    ])
    expect(labels.Width).toEqual([
      { name: 'Condensed', value: 75, elidable: undefined },
      { name: 'Regular', value: 100, elidable: true },
    ])
  })

  it('honors the "Style Name as STAT entry" override for mixed-axis instances', () => {
    const labels = deriveStatAxisLabels(
      [weight, width],
      [
        instance(
          'Display',
          { Weight: 700, Width: 75 },
          {
            'Style Name as STAT entry': 'wght',
          }
        ),
      ]
    )
    expect(labels.Weight).toEqual([
      { name: 'Display', value: 700, elidable: undefined },
    ])
    expect(labels.Width).toBeUndefined()
  })
})
