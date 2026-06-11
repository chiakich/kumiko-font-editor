import { describe, expect, it } from 'vitest'
import {
  computeInkArea,
  computeInkMoments,
  flattenContour,
} from 'src/features/common/qualityCheck/polygonGeometry'
import {
  buildRobustStat,
  computeRadarFromSamples,
  radarZScore,
} from 'src/features/common/qualityCheck/qualityRadar'
import { analyzeFontPopulation } from 'src/features/common/qualityCheck/useQualityAnalysis'
import type { GlyphGeometrySample } from 'src/features/common/qualityCheck/glyphSampling'
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

  it('does not misclassify a partially overlapping stroke as a counter', () => {
    // L 形筆畫：底橫 (0,0)-(300,100) + 右豎 (200,0)-(300,300)，面積 50000
    const lShape = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: 200, y: 300 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]
    // 交疊筆畫：第一個頂點 (250,150) 落在 L 的墨水內，但多數頂點在外
    const crossingStroke = [
      { x: 250, y: 150 },
      { x: 250, y: 250 },
      { x: 150, y: 250 },
      { x: 150, y: 150 },
    ]
    // 單點判定會把整條筆畫當挖空（50000 − 10000）；多數決應視為實心
    expect(computeInkArea([lShape, crossingStroke])).toBeGreaterThan(50000)
    const moments = computeInkMoments([lShape, crossingStroke])!
    expect(moments.centroidX).toBeGreaterThan(0)
    expect(moments.centroidX).toBeLessThan(300)
    expect(moments.spreadY).toBeGreaterThan(0)
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

    const radar = analyzeFontPopulation(makeFontData(glyphs)).radar!
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

  it('does not flag a simple glyph whose smaller face follows the complexity trend', () => {
    const glyphs: GlyphData[] = []
    // 22 個複雜字：大字面、大墨量（實心方塊 → 複雜度與字面尺寸完全線性相關）
    for (let index = 0; index < 22; index += 1) {
      const jitter = (index % 5) * 6
      const size = 850 + jitter
      glyphs.push(
        makeHanGlyph(
          index,
          makeSquarePath(
            (1000 - size) / 2,
            -120 + (880 + 120 - size) / 2,
            (1000 + size) / 2,
            -120 + (880 + 120 + size) / 2
          )
        )
      )
    }
    // 3 個簡單字：依延伸性原則做小，落在複雜度→尺寸趨勢線上
    for (let index = 22; index < 25; index += 1) {
      const size = 550
      glyphs.push(
        makeHanGlyph(
          index,
          makeSquarePath(
            (1000 - size) / 2,
            -120 + (880 + 120 - size) / 2,
            (1000 + size) / 2,
            -120 + (880 + 120 + size) / 2
          )
        )
      )
    }

    const radar = analyzeFontPopulation(makeFontData(glyphs)).radar!
    const simpleGlyph = radar.evaluationByGlyphId.get('g22')!
    // 修正前：widthRatio/heightRatio 直接比一致性，簡單小字必被誤報
    expect(
      simpleGlyph.reasons.some((reason) => reason.dimension === 'proportion')
    ).toBe(false)
    expect(radar.sizeTrend.slopeByKey.get('face:widthRatio')).toBeGreaterThan(0)
  })

  it('returns null when there are not enough Han samples', () => {
    const glyphs = [makeHanGlyph(0, makeSquarePath(50, -50, 950, 820))]
    expect(analyzeFontPopulation(makeFontData(glyphs)).radar).toBeNull()
  })
})

const makeStratumSample = (
  id: string,
  faceWidth: number,
  inkArea: number,
  jitter: number
): GlyphGeometrySample => {
  const advance = 1000
  const xMin = (advance - faceWidth) / 2 + jitter
  const xMax = xMin + faceWidth
  const yMin = 200
  const yMax = 560
  const faceArea = faceWidth * (yMax - yMin)
  return {
    glyphId: id,
    glyphName: id,
    character: id,
    advance,
    bounds: { xMin, yMin, xMax, yMax },
    sides: {
      left: { type: 'branching', bearing: Math.round(xMin), coverage: 0.3 },
      right: {
        type: 'branching',
        bearing: Math.round(advance - xMax),
        coverage: 0.3,
      },
      top: {
        type: 'branching',
        bearing: Math.round(880 - yMax),
        coverage: 0.3,
      },
      bottom: {
        type: 'branching',
        bearing: Math.round(yMin - -120),
        coverage: 0.3,
      },
    },
    ink: {
      bounds: { xMin, yMin, xMax, yMax },
      inkArea,
      faceArea,
      inkToFaceRatio: Math.min(1, inkArea / faceArea),
      inkToEmRatio: inkArea / (advance * 1000),
      centroidX: (xMin + xMax) / 2,
      centroidY: 380,
      spreadX: faceWidth / Math.sqrt(12),
      spreadY: 100,
    },
  }
}

describe('complexity strata', () => {
  it('compares glyphs against similar-complexity peers, not the whole font', () => {
    const samples: GlyphGeometrySample[] = []
    // 35 個簡單字（低墨量、小字面）+ 35 個複雜字（高墨量、大字面）
    for (let index = 0; index < 35; index += 1) {
      samples.push(
        makeStratumSample(`s${index}`, 500, 40000, ((index % 5) - 2) * 4)
      )
    }
    for (let index = 0; index < 35; index += 1) {
      samples.push(
        makeStratumSample(`c${index}`, 900, 640000, ((index % 5) - 2) * 4)
      )
    }
    // 錯誤的簡單字：墨量少（複雜度低）卻撐滿字面
    samples.push(makeStratumSample('wrong', 900, 40000, 0))

    const radar = computeRadarFromSamples(samples, {
      top: 880,
      bottom: -120,
      unitsPerEm: 1000,
    })!
    expect(radar.strata.binUpperBounds.length).toBeGreaterThan(1)
    // 正常的簡單小字不再因為「跟全字體不同」被列為可疑
    expect(radar.suspects.some((suspect) => suspect.glyphId === 's0')).toBe(
      false
    )
    // 同層內的真離群仍被抓到
    expect(radar.suspects.some((suspect) => suspect.glyphId === 'wrong')).toBe(
      true
    )
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
