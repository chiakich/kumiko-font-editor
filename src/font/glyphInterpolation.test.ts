import { describe, expect, it } from 'vitest'
import { isInterpolatedGlyphLocation } from 'src/font/designspaceLocation'
import { interpolateGlyphLayer } from 'src/font/glyphInterpolation'
import { bakeGlyphStaticInstance } from 'src/font/staticInstance'
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

  it('uses brace layers as glyph-specific interpolation sources', () => {
    const glyphWithBrace = glyph()
    glyphWithBrace.layers = {
      ...glyphWithBrace.layers,
      brace: {
        ...layer('brace', 650, 180, 650),
        type: 'brace',
        associatedMasterId: 'Light',
        braceLocation: { Weight: 50 },
      },
    }
    glyphWithBrace.layerOrder = ['Light', 'Bold', 'brace']

    const result = interpolateGlyphLayer({
      glyph: glyphWithBrace,
      axes,
      sources,
      location: { Weight: 50 },
    })

    expect(result.issues).toEqual([])
    expect(result.layer?.metrics.width).toBeCloseTo(650)
    expect(result.layer?.paths[0].nodes[1].x).toBeCloseTo(180)
  })

  it('uses bracket layers when their axis rules match', () => {
    const glyphWithBracket = glyph()
    glyphWithBracket.layers = {
      ...glyphWithBracket.layers,
      bracket: {
        ...layer('bracket', 900, 300, 900),
        type: 'bracket',
        associatedMasterId: 'Bold',
        bracketAxisRules: { Weight: { min: 80, max: 100 } },
      },
    }
    glyphWithBracket.layerOrder = ['Light', 'Bold', 'bracket']

    const inactive = interpolateGlyphLayer({
      glyph: glyphWithBracket,
      axes,
      sources,
      location: { Weight: 50 },
    })
    const active = interpolateGlyphLayer({
      glyph: glyphWithBracket,
      axes,
      sources,
      location: { Weight: 100 },
    })

    expect(inactive.layer?.metrics.width).toBeCloseTo(600)
    expect(active.layer?.metrics.width).toBeCloseTo(900)
    expect(active.layer?.paths[0].nodes[1].x).toBeCloseTo(300)
  })

  it('can ignore bracket layers for base variable masters', () => {
    const glyphWithBracket = glyph()
    glyphWithBracket.layers = {
      ...glyphWithBracket.layers,
      bracket: {
        ...layer('bracket', 900, 300, 900),
        type: 'bracket',
        associatedMasterId: 'Bold',
        bracketAxisRules: { Weight: { min: 80, max: 100 } },
      },
    }
    glyphWithBracket.layerOrder = ['Light', 'Bold', 'bracket']

    const result = interpolateGlyphLayer({
      glyph: glyphWithBracket,
      axes,
      sources,
      location: { Weight: 100 },
      includeBracketLayers: false,
    })

    expect(result.layer?.metrics.width).toBeCloseTo(700)
    expect(result.layer?.paths[0].nodes[1].x).toBeCloseTo(200)
  })
})

describe('bakeGlyphStaticInstance', () => {
  it('flattens an export instance into a single active layer', () => {
    const result = bakeGlyphStaticInstance({
      fontData: { axes, sources },
      glyph: glyph(),
      instance: {
        id: 'instance-medium',
        name: 'Medium',
        styleName: 'Medium',
        location: { Weight: 50 },
        export: true,
      },
    })

    expect(result.errors).toEqual([])
    expect(result.glyph.activeLayerId).toBe('public.default')
    expect(result.glyph.layerOrder).toEqual(['public.default'])
    expect(Object.keys(result.glyph.layers ?? {})).toEqual(['public.default'])
    expect(result.glyph.layers?.['public.default'].metrics.width).toBeCloseTo(
      600
    )
    expect(
      result.glyph.layers?.['public.default'].paths[0].nodes[1].x
    ).toBeCloseTo(150)
  })

  it('reports blocking errors when outlines cannot interpolate', () => {
    const incompatibleBold = {
      ...layer('Bold', 700, 200, 700),
      paths: [],
    }

    const result = bakeGlyphStaticInstance({
      fontData: { axes, sources },
      glyph: glyph(incompatibleBold),
      instance: {
        id: 'instance-medium',
        name: 'Medium',
        styleName: 'Medium',
        location: { Weight: 50 },
        export: true,
      },
    })

    expect(result.errors.some((error) => error.message.includes('paths'))).toBe(
      true
    )
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

  it('treats active bracket layers at source locations as preview', () => {
    const glyphWithBracket = glyph()
    glyphWithBracket.layers = {
      ...glyphWithBracket.layers,
      bracket: {
        ...layer('bracket', 900, 300, 900),
        type: 'bracket',
        associatedMasterId: 'Bold',
        bracketAxisRules: { Weight: { min: 80, max: 100 } },
      },
    }
    glyphWithBracket.layerOrder = ['Light', 'Bold', 'bracket']
    const data: FontData = {
      glyphs: { A: glyphWithBracket },
      axes,
      sources,
    }

    expect(
      isInterpolatedGlyphLocation(data, glyphWithBracket, { Weight: 100 })
    ).toBe(true)
  })
})
