import { describe, expect, it } from 'vitest'
import { buildGlyphPreviewData } from 'src/lib/glyph/glyphOverview'
import { normalizeGlyphToLayers } from 'src/store'
import type { GlyphData } from 'src/store'

const makeGlyph = (id: string): GlyphData =>
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
    componentRefs: [],
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
})
