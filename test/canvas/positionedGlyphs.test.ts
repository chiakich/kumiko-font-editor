import { describe, expect, it } from 'vitest'
import {
  buildPositionedGlyphs,
  type LayerGeometryCacheEntry,
} from 'src/features/editor/canvas/workspace/layout/positionedGlyphs'
import { normalizeGlyphToLayers } from 'src/store'
import type { FontAxes, FontData, FontSource, GlyphData } from 'src/store'

const makeGlyph = (id: string): GlyphData =>
  normalizeGlyphToLayers({
    id,
    name: id,
    unicodes: [],
    paths: [
      {
        id: 'path-1',
        closed: false,
        nodes: [
          {
            id: 'node-1',
            kind: 'oncurve',
            segmentType: 'line',
            x: 0,
            y: 0,
          },
          {
            id: 'node-2',
            kind: 'oncurve',
            segmentType: 'line',
            x: 100,
            y: 0,
          },
        ],
      },
    ],
    components: [],
    componentRefs: [],
    anchors: [],
    guidelines: [],
    metrics: { width: 500, lsb: 0, rsb: 500 },
  })

const makeFontData = (glyph: GlyphData): FontData => ({
  glyphs: { [glyph.id]: glyph },
  glyphOrder: [glyph.id],
})

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

const makeIncompatibleVariableGlyph = (): GlyphData => {
  const glyph = makeGlyph('F')
  const lightLayer = glyph.layers?.[glyph.activeLayerId ?? 'public.default']
  if (!lightLayer) {
    return glyph
  }
  return {
    ...glyph,
    activeLayerId: 'Light',
    layerOrder: ['Light', 'Bold'],
    layers: {
      Light: {
        ...lightLayer,
        id: 'Light',
        name: 'Light',
        associatedMasterId: 'Light',
      },
      Bold: {
        ...lightLayer,
        id: 'Bold',
        name: 'Bold',
        associatedMasterId: 'Bold',
        paths: [],
      },
    },
  }
}

describe('positioned glyph layout', () => {
  it('prunes cached layer geometry after glyph geometry is evicted', () => {
    const glyph = makeGlyph('A')
    const fontData = makeFontData(glyph)
    const layerGeometryCache = new Map<string, LayerGeometryCacheEntry>()

    expect(
      buildPositionedGlyphs({
        activeToolId: 'pointer',
        editorActiveGlyphIndex: 0,
        editorGlyphIds: ['A'],
        fontData,
        selectedLayerId: null,
        layerGeometryCache,
      })
    ).toHaveLength(1)
    expect(layerGeometryCache.size).toBe(1)

    delete glyph.layers
    glyph.activeLayerId = null

    expect(
      buildPositionedGlyphs({
        activeToolId: 'pointer',
        editorActiveGlyphIndex: 0,
        editorGlyphIds: ['A'],
        fontData,
        selectedLayerId: null,
        layerGeometryCache,
      })
    ).toEqual([])
    expect(layerGeometryCache.size).toBe(0)
  })

  it('falls back to the base layer when interpolation cannot build an instance', () => {
    const glyph = makeIncompatibleVariableGlyph()
    const fontData: FontData = {
      ...makeFontData(glyph),
      axes,
      sources,
    }

    const positionedGlyphs = buildPositionedGlyphs({
      activeToolId: 'pointer',
      editLocation: { Weight: 50 },
      editorActiveGlyphIndex: 0,
      editorGlyphIds: ['F'],
      fontData,
      selectedLayerId: null,
      layerGeometryCache: new Map(),
    })

    expect(positionedGlyphs).toHaveLength(1)
    expect(positionedGlyphs[0].glyph.metrics.width).toBe(500)
    expect(positionedGlyphs[0].pointRefs).toEqual([])
    expect(positionedGlyphs[0].isEditing).toBe(false)
  })
})
