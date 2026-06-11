import { describe, expect, it } from 'vitest'
import {
  computeInkMoments,
  flattenContour,
} from 'src/features/common/qualityCheck/glyphGeometry'
import {
  buildRadarAnalysis,
  buildRobustStat,
  radarZScore,
} from 'src/features/common/qualityCheck/qualityRadar'
import type { FontData, GlyphData, PathData } from 'src/store'

const squarePolygon = (
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
) => [
  { x: xMin, y: yMin },
  { x: xMax, y: yMin },
  { x: xMax, y: yMax },
  { x: xMin, y: yMax },
]

describe('computeInkMoments', () => {
  it('computes centroid and spread of a square', () => {
    const moments = computeInkMoments([squarePolygon(0, 0, 100, 100)])!
    expect(moments.area).toBeCloseTo(10000)
    expect(moments.centroidX).toBeCloseTo(50)
    expect(moments.centroidY).toBeCloseTo(50)
    // 均勻分布的標準差 = 邊長 / sqrt(12)
    expect(moments.spreadX).toBeCloseTo(100 / Math.sqrt(12), 1)
  })

  it('subtracts holes but keeps the centroid of a symmetric donut', () => {
    const moments = computeInkMoments([
      squarePolygon(0, 0, 100, 100),
      squarePolygon(40, 40, 60, 60),
    ])!
    expect(moments.area).toBeCloseTo(10000 - 400)
    expect(moments.centroidX).toBeCloseTo(50)
    expect(moments.centroidY).toBeCloseTo(50)
  })

  it('is independent of contour orientation', () => {
    const clockwise = [...squarePolygon(0, 0, 100, 100)].reverse()
    const moments = computeInkMoments([clockwise])!
    expect(moments.area).toBeCloseTo(10000)
    expect(moments.centroidX).toBeCloseTo(50)
  })
})

describe('buildRobustStat / radarZScore', () => {
  it('computes median and robust scale', () => {
    const stat = buildRobustStat([10, 12, 11, 9, 10, 50])!
    expect(stat.median).toBeCloseTo(10.5)
    expect(radarZScore(50, stat)).toBeGreaterThan(3)
    expect(Math.abs(radarZScore(10, stat))).toBeLessThan(1)
  })

  it('falls back to IQR when MAD degenerates', () => {
    // 過半樣本同值 → MAD = 0，但仍有離散度
    const stat = buildRobustStat([10, 10, 10, 10, 10, 14, 6, 18, 2])!
    expect(stat.scale).toBeGreaterThan(0)
  })
})

const makeSquarePath = (
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): PathData => ({
  id: 'p1',
  closed: true,
  nodes: [
    { id: 'n1', x: xMin, y: yMin, type: 'corner' },
    { id: 'n2', x: xMax, y: yMin, type: 'corner' },
    { id: 'n3', x: xMax, y: yMax, type: 'corner' },
    { id: 'n4', x: xMin, y: yMax, type: 'corner' },
  ],
})

const makeHanGlyph = (index: number, path: PathData): GlyphData =>
  ({
    id: `g${index}`,
    name: `g${index}`,
    unicode: (0x4e00 + index).toString(16).toUpperCase(),
    paths: [path],
    components: [],
    componentRefs: [],
    metrics: { width: 1000, lsb: 0, rsb: 0 },
  }) as unknown as GlyphData

const makeFontData = (glyphs: GlyphData[]): FontData =>
  ({
    glyphs: Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
    unitsPerEm: 1000,
    lineMetricsHorizontalLayout: {
      ascender: { value: 880 },
      descender: { value: -120 },
    },
  }) as unknown as FontData

describe('buildRadarAnalysis', () => {
  it('ranks the deviant glyph first with reasons', () => {
    const glyphs: GlyphData[] = []
    // 24 個正常字：邊距與重心都帶小幅、不對稱的抖動
    for (let index = 0; index < 24; index += 1) {
      const jitter = (index % 5) * 2.5
      const skew = (index % 3) * 4
      glyphs.push(
        makeHanGlyph(
          index,
          makeSquarePath(
            55 + jitter,
            -55 - jitter,
            938 - skew,
            815 + jitter - skew
          )
        )
      )
    }
    // 離群字：整體大幅偏右
    glyphs.push(makeHanGlyph(24, makeSquarePath(320, -55, 990, 815)))

    const radar = buildRadarAnalysis(makeFontData(glyphs))!
    expect(radar.sampleCount).toBe(25)
    expect(radar.suspects.length).toBeGreaterThan(0)
    expect(radar.suspects[0]!.glyphId).toBe('g24')
    expect(radar.suspects[0]!.reasons.length).toBeGreaterThan(0)
    // 重心偏移應該是其中一個異常原因
    expect(
      radar.suspects[0]!.reasons.some(
        (reason) => reason.dimension === 'balance'
      )
    ).toBe(true)
    // 維度分數因離群字而低於滿分
    const balanceScore = radar.dimensionScores.find(
      (entry) => entry.dimension === 'balance'
    )!
    expect(balanceScore.score).toBeLessThan(100)
  })

  it('returns null when there are not enough Han samples', () => {
    const glyphs = [makeHanGlyph(0, makeSquarePath(50, -50, 950, 820))]
    expect(buildRadarAnalysis(makeFontData(glyphs))).toBeNull()
  })
})

describe('flattenContour', () => {
  it('keeps straight segments as-is', () => {
    const polygon = flattenContour([
      { x: 0, y: 0, type: 'corner' },
      { x: 100, y: 0, type: 'corner' },
      { x: 100, y: 100, type: 'corner' },
    ])
    expect(polygon.length).toBeGreaterThanOrEqual(3)
  })
})
