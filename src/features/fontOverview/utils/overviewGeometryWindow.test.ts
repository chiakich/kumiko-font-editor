import { describe, expect, it } from 'vitest'
import {
  collectOverviewGeometryGlyphIds,
  collectUnloadedOverviewGeometryGlyphIds,
} from 'src/features/fontOverview/utils/overviewGeometryWindow'
import type { GlyphData } from 'src/store'

const makeGlyph = (
  id: string,
  componentGlyphIds: string[] = [],
  isLoaded = true
): GlyphData => ({
  id,
  name: id,
  activeLayerId: isLoaded ? 'public.default' : null,
  componentGlyphIds,
  layers: isLoaded
    ? {
        'public.default': {
          id: 'public.default',
          name: 'public.default',
          type: 'master',
          associatedMasterId: 'public.default',
          paths: [],
          componentRefs: componentGlyphIds.map((componentGlyphId) => ({
            glyphId: componentGlyphId,
            id: `component-${componentGlyphId}`,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            x: 0,
            y: 0,
          })),
          anchors: [],
          guidelines: [],
          metrics: { lsb: 0, rsb: 500, width: 500 },
        },
      }
    : undefined,
})

describe('overview geometry window', () => {
  it('collects geometry ids around a visible range', () => {
    const glyphs = [makeGlyph('A'), makeGlyph('B'), makeGlyph('C')]

    expect(
      collectOverviewGeometryGlyphIds(glyphs, { startIndex: 1, endIndex: 1 }, 0)
    ).toEqual(['B'])
  })

  it('finds unloaded roots and component dependencies', () => {
    const glyphMap: Record<string, GlyphData> = {
      A: makeGlyph('A', ['acute'], true),
      acute: makeGlyph('acute', [], false),
      B: makeGlyph('B', [], false),
    }

    expect(
      collectUnloadedOverviewGeometryGlyphIds(['A', 'B'], glyphMap)
    ).toEqual(['acute', 'B'])
  })
})
