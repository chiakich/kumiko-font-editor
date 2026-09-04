import { describe, expect, it } from 'vitest'
import {
  collectOverviewGeometryGlyphIds,
  OVERVIEW_GEOMETRY_PRELOAD_MARGIN,
  OVERVIEW_MAX_RESIDENT_GLYPH_GEOMETRY,
} from '@/features/fontOverview/utils/overviewGeometryWindow'
import type { GlyphData } from '@/domain'

const makeGlyphs = (count: number): GlyphData[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `glyph-${index}`,
    name: `glyph-${index}`,
    unicodes: [],
    layerOrder: ['public.default'],
  }))

describe('overview geometry window', () => {
  it('loads the visible range plus a bounded preload margin', () => {
    const glyphs = makeGlyphs(100)
    const startIndex = Math.max(0, 20 - OVERVIEW_GEOMETRY_PRELOAD_MARGIN)
    const endIndex = Math.min(
      glyphs.length - 1,
      29 + OVERVIEW_GEOMETRY_PRELOAD_MARGIN
    )

    expect(
      collectOverviewGeometryGlyphIds(glyphs, {
        startIndex: 20,
        endIndex: 29,
      })
    ).toEqual(
      Array.from(
        { length: endIndex - startIndex + 1 },
        (_, index) => `glyph-${index + startIndex}`
      )
    )
  })

  it('clamps preload ranges at section boundaries', () => {
    const glyphs = makeGlyphs(10)

    expect(
      collectOverviewGeometryGlyphIds(glyphs, {
        startIndex: 0,
        endIndex: 2,
      })
    ).toEqual(glyphs.map((glyph) => glyph.id))

    expect(
      collectOverviewGeometryGlyphIds(glyphs, {
        startIndex: 8,
        endIndex: 9,
      })
    ).toEqual(glyphs.map((glyph) => glyph.id))
  })

  it('keeps CJK overview residency below the general editor cache ceiling', () => {
    expect(OVERVIEW_GEOMETRY_PRELOAD_MARGIN).toBe(48)
    expect(OVERVIEW_MAX_RESIDENT_GLYPH_GEOMETRY).toBe(480)
    expect(OVERVIEW_MAX_RESIDENT_GLYPH_GEOMETRY).toBeLessThan(800)
  })
})
