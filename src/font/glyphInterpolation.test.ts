import { describe, expect, it } from 'vitest'
import { isInterpolatedGlyphLocation } from 'src/font/designspaceLocation'
import { interpolateGlyphLayer } from 'src/font/glyphInterpolation'
import type {
  FontAxes,
  FontData,
  FontSource,
  GlyphData,
  GlyphLayerData,
  PathData,
} from 'src/store/types'

const axes: FontAxes = {
  axes: [
    {
      name: 'Weight',
      label: 'Weight',
      tag: 'wght',
      minValue: 0,
      defaultValue: 0,
      maxValue: 100,
    },
  ],
  mappings: [],
}

const sources: Record<string, FontSource> = {
  Light: { id: 'Light', name: 'Light', location: { Weight: 0 } },
  Bold: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
}

const path = (id: string, right: number, top: number): PathData => ({
  id,
  closed: true,
  nodes: [
    { id: `${id}-1`, kind: 'oncurve', x: 0, y: 0, segmentType: 'line' },
    { id: `${id}-2`, kind: 'oncurve', x: right, y: 0, segmentType: 'line' },
    { id: `${id}-3`, kind: 'oncurve', x: right, y: top, segmentType: 'line' },
    { id: `${id}-4`, kind: 'oncurve', x: 0, y: top, segmentType: 'line' },
  ],
})

const layer = (
  id: string,
  width: number,
  right: number,
  top: number
): GlyphLayerData => ({
  id,
  name: id,
  type: 'master',
  associatedMasterId: id,
  paths: [path(`${id}-path`, right, top)],
  componentRefs: [
    {
      id: `${id}-component`,
      glyphId: 'acute',
      x: id === 'Light' ? 0 : 100,
      y: 0,
      scaleX: id === 'Light' ? 1 : 2,
      scaleY: 1,
      rotation: 0,
    },
  ],
  anchors:
    id === 'Light'
      ? [
          { id: 'top-light', name: 'top', x: 50, y: 500 },
          { id: 'bottom-light', name: 'bottom', x: 50, y: 0 },
        ]
      : [
          { id: 'bottom-bold', name: 'bottom', x: 70, y: 0 },
          { id: 'top-bold', name: 'top', x: 70, y: 700 },
        ],
  guidelines: [
    { id: `${id}-guide`, x: 10, y: 20, angle: id === 'Light' ? 0 : 20 },
  ],
  metrics: { lsb: 0, rsb: width - right, width },
})

const glyph = (boldLayer = layer('Bold', 700, 200, 700)): GlyphData => ({
  id: 'A',
  name: 'A',
  activeLayerId: 'Light',
  layerOrder: ['Light', 'Bold'],
  layers: {
    Light: layer('Light', 500, 100, 500),
    Bold: boldLayer,
  },
})

describe('interpolateGlyphLayer', () => {
  it('builds a layer-like instance at an intermediate location', () => {
    const result = interpolateGlyphLayer({
      glyph: glyph(),
      axes,
      sources,
      location: { Weight: 50 },
    })

    expect(result.issues).toEqual([])
    expect(result.modelErrors).toEqual([])
    expect(result.layer?.metrics.width).toBeCloseTo(600)
    expect(result.layer?.paths[0].nodes[1].x).toBeCloseTo(150)
    expect(result.layer?.paths[0].nodes[2].y).toBeCloseTo(600)
    expect(result.layer?.componentRefs[0].transform?.e).toBeCloseTo(50)
    expect(result.layer?.componentRefs[0].scaleX).toBeCloseTo(1.5)
    expect(
      result.layer?.anchors.find((anchor) => anchor.name === 'top')?.y
    ).toBeCloseTo(600)
    expect(result.layer?.guidelines[0].angle).toBeCloseTo(10)
  })

  it('reports incompatible outlines instead of producing an instance', () => {
    const incompatibleBold = {
      ...layer('Bold', 700, 200, 700),
      paths: [],
    }

    const result = interpolateGlyphLayer({
      glyph: glyph(incompatibleBold),
      axes,
      sources,
      location: { Weight: 50 },
    })

    expect(result.layer).toBeNull()
    expect(result.issues.map((issue) => issue.code)).toContain('path-count')
  })

  it('falls back to a sparse sub-model when a source layer is missing', () => {
    const sparseGlyph = glyph()
    delete sparseGlyph.layers?.Bold

    const result = interpolateGlyphLayer({
      glyph: sparseGlyph,
      axes,
      sources,
      location: { Weight: 50 },
    })

    expect(result.layer?.metrics.width).toBeCloseTo(500)
    expect(result.layer?.paths[0].nodes[1].x).toBeCloseTo(100)
    expect(result.issues.map((issue) => issue.code)).toContain('missing-layer')
  })
})

describe('isInterpolatedGlyphLocation', () => {
  it('treats sparse support source locations as preview for glyphs without that layer', () => {
    const supportSources: Record<string, FontSource> = {
      ...sources,
      'Light · support.crossbar': {
        id: 'Light · support.crossbar',
        name: 'Light · support.crossbar',
        location: { Weight: 50 },
      },
    }
    const glyphWithoutSupport = glyph()
    const glyphWithSupport = glyph()
    glyphWithSupport.layers = {
      ...glyphWithSupport.layers,
      'Light · support.crossbar': {
        ...layer('Light · support.crossbar', 560, 140, 560),
        associatedMasterId: 'Light · support.crossbar',
      },
    }
    const data: FontData = {
      glyphs: {
        A: glyphWithoutSupport,
        B: glyphWithSupport,
      },
      axes,
      sources: supportSources,
    }

    expect(
      isInterpolatedGlyphLocation(data, glyphWithoutSupport, { Weight: 50 })
    ).toBe(true)
    expect(
      isInterpolatedGlyphLocation(data, glyphWithSupport, { Weight: 50 })
    ).toBe(false)
  })
})
