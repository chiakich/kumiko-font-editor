import { describe, expect, it } from 'vitest'
import {
  buildGlyphInkSamples,
  buildProofRun,
} from 'src/features/common/qualityCheck/qualityProof'
import type { FontData, GlyphData, PathData } from 'src/store/types'

const makePath = (id: string, points: Array<[number, number]>): PathData => ({
  id,
  closed: true,
  nodes: points.map(([x, y], index) => ({
    id: `${id}_${index}`,
    x,
    y,
    type: 'corner',
  })),
})

const makeGlyph = (
  id: string,
  unicode: string,
  width: number,
  paths: PathData[]
): GlyphData => ({
  id,
  name: id,
  unicode,
  paths,
  components: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width },
})

const fontData: FontData = {
  unitsPerEm: 1000,
  glyphs: {
    uni6C38: makeGlyph('uni6C38', '6C38', 1000, [
      makePath('box', [
        [100, 0],
        [900, 0],
        [900, 800],
        [100, 800],
      ]),
    ]),
    A: makeGlyph('A', '0041', 600, [
      makePath('a_box', [
        [50, 0],
        [550, 0],
        [550, 700],
        [50, 700],
      ]),
    ]),
  },
}

describe('quality proof helpers', () => {
  it('maps proof text to current font glyphs and missing characters', () => {
    const proofRun = buildProofRun(fontData, '永A?')

    expect(proofRun.matchedCount).toBe(2)
    expect(proofRun.missingCount).toBe(1)
    expect(proofRun.glyphs[0].glyphId).toBe('uni6C38')
    expect(proofRun.glyphs[1].glyphId).toBe('A')
    expect(proofRun.glyphs[2].isMissing).toBe(true)
  })

  it('builds glyph ink samples from outline bounds', () => {
    const samples = buildGlyphInkSamples(
      Object.values(fontData.glyphs),
      fontData
    )

    expect(samples).toHaveLength(2)
    expect(samples[0].inkRatio).not.toBeNull()
    expect(samples[0].inkRatio).toBeGreaterThan(samples[1].inkRatio ?? 0)
  })
})
