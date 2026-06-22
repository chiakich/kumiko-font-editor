import { describe, expect, it } from 'vitest'
import { createOverviewGlyphPreviewSnapshot } from 'src/features/fontOverview/utils/overviewPreviewSnapshot'
import { normalizeGlyphToLayers } from 'src/store'
import type { GlyphComponentRef, GlyphData } from 'src/store/types'

const makeGlyph = (
  id: string,
  componentRefs: GlyphComponentRef[] = []
): GlyphData =>
  normalizeGlyphToLayers({
    id,
    name: id,
    unicodes: [],
    paths: [
      {
        id: `${id}-path`,
        closed: true,
        nodes: [
          {
            id: `${id}-node-1`,
            kind: 'oncurve',
            segmentType: 'line',
            x: 0,
            y: 0,
          },
          {
            id: `${id}-node-2`,
            kind: 'oncurve',
            segmentType: 'line',
            x: 100,
            y: 0,
          },
          {
            id: `${id}-node-3`,
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

const replaceDefaultLayer = (
  glyph: GlyphData,
  update: Partial<NonNullable<GlyphData['layers']>[string]>
): GlyphData => {
  const layerId = glyph.activeLayerId ?? 'public.default'
  const layer = glyph.layers?.[layerId]
  if (!layer) {
    return glyph
  }
  return {
    ...glyph,
    layers: {
      ...glyph.layers,
      [layerId]: {
        ...layer,
        ...update,
      },
    },
  }
}

describe('overview preview snapshots', () => {
  it('tracks transitive component dependencies without unrelated glyphs', () => {
    const base = makeGlyph('base')
    const host = makeGlyph('host', [
      {
        id: 'component-1',
        glyphId: 'base',
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
    ])
    const unrelated = makeGlyph('unrelated')
    const first = createOverviewGlyphPreviewSnapshot(
      'host',
      { base, host, unrelated },
      null,
      {}
    )
    const unrelatedChanged = replaceDefaultLayer(unrelated, {
      metrics: { width: 700, lsb: 0, rsb: 700 },
    })
    const second = createOverviewGlyphPreviewSnapshot(
      'host',
      { base, host, unrelated: unrelatedChanged },
      null,
      {}
    )
    const baseChanged = replaceDefaultLayer(base, {
      metrics: { width: 700, lsb: 0, rsb: 700 },
    })
    const third = createOverviewGlyphPreviewSnapshot(
      'host',
      { base: baseChanged, host, unrelated },
      null,
      {}
    )

    expect(first?.isReady).toBe(true)
    expect(first?.cacheKey).toBe(second?.cacheKey)
    expect(first?.cacheKey).not.toBe(third?.cacheKey)
    expect(Object.keys(first?.glyphs ?? {}).sort()).toEqual(['base', 'host'])
  })

  it('includes edit times for dirty dependency invalidation', () => {
    const base = makeGlyph('base')
    const host = makeGlyph('host', [
      {
        id: 'component-1',
        glyphId: 'base',
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
    ])
    const first = createOverviewGlyphPreviewSnapshot(
      'host',
      { base, host },
      null,
      {}
    )
    const second = createOverviewGlyphPreviewSnapshot(
      'host',
      { base, host },
      null,
      { base: 123 }
    )

    expect(first?.cacheKey).not.toBe(second?.cacheKey)
  })
})
