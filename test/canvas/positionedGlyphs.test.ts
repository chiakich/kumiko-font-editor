import { describe, expect, it } from 'vitest'
import {
  buildPositionedGlyphs,
  type LayerGeometryCacheEntry,
} from 'src/features/editor/canvas/workspace/layout/positionedGlyphs'
import { normalizeGlyphToLayers } from 'src/store'
import type { FontData, GlyphData } from 'src/store'

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
})
