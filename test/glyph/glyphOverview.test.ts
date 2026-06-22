import { describe, expect, it } from 'vitest'
import { buildGlyphPreviewData } from 'src/lib/glyph/glyphOverview'
import { normalizeGlyphToLayers } from 'src/store'
import type { GlyphData } from 'src/store'

const makeGlyph = (
  id: string,
  componentRefs: NonNullable<GlyphData['layers']>[string]['componentRefs'] = []
): GlyphData =>
  normalizeGlyphToLayers({
    id,
    name: id,
    unicodes: [],
    paths: [
      {
        id: 'path-1',
        closed: true,
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
          {
            id: 'node-3',
            kind: 'oncurve',
            segmentType: 'line',
            x: 100,
            y: 100,
          },
        ],
      },
    ],
    components: [],
    componentRefs,
    anchors: [],
    guidelines: [],
    metrics: { width: 500, lsb: 0, rsb: 500 },
  })

describe('glyph overview preview', () => {
  it('drops cached preview geometry after a glyph is evicted', () => {
    const glyph = makeGlyph('A')
    const glyphMap = { A: glyph }

    expect(buildGlyphPreviewData(glyph, glyphMap).shapes).toHaveLength(1)

    delete glyph.layers
    glyph.activeLayerId = null

    const evictedPreview = buildGlyphPreviewData(glyph, glyphMap)
    expect(evictedPreview.shapes).toEqual([])
    expect(evictedPreview.width).toBe(240)
  })

  it('uses full affine component transforms in preview geometry', () => {
    const base = makeGlyph('base')
    const host = makeGlyph('host', [
      {
        id: 'component-1',
        glyphId: 'base',
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        xyScale: 0.25,
        yxScale: -0.5,
      },
    ])
    const glyphMap = { base, host }

    const preview = buildGlyphPreviewData(host, glyphMap)

    expect(preview.shapes).toHaveLength(2)
    expect(preview.shapes[1].transform).toBe('matrix(1 0.25 -0.5 1 10 20)')
  })
})
