import { describe, expect, it } from 'vitest'
import {
  computeInkArea,
  flattenContour,
  getPolygonsBounds,
} from 'src/features/common/qualityCheck/polygonGeometry'
import { flattenResolvedGlyph } from 'src/features/common/qualityCheck/glyphInk'
import {
  getStructureBodyBox,
  isHanGlyph,
} from 'src/features/common/qualityCheck/hanClassification'
import { resolveFontGlyphs } from 'src/features/common/qualityCheck/resolvedGlyph'
import { buildGlyphGeometrySample } from 'src/features/common/qualityCheck/glyphSampling'
import { analyzeFontPopulation } from 'src/features/common/qualityCheck/populationAnalysis'
import type { FontData, GlyphData, PathData } from 'src/store/types'

const makePath = (
  id: string,
  points: Array<[number, number]>,
  closed = true
): PathData => ({
  id,
  closed,
  nodes: points.map(([x, y], index) => ({
    id: `${id}_${index}`,
    x,
    y,
    type: 'corner',
  })),
})

const makeGlyph = (
  id: string,
  unicode: string | null,
  paths: PathData[],
  width = 1000
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

const makeFontData = (glyphs: GlyphData[]): FontData => ({
  glyphs: Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
  glyphOrder: glyphs.map((glyph) => glyph.id),
  unitsPerEm: 1000,
})

/** 框形字：四邊都由貼齊邊界的長邊（框架筆畫）定義 */
const makeFrameGlyph = (id: string, unicode: string) =>
  makeGlyph(id, unicode, [
    makePath('outer', [
      [80, -40],
      [920, -40],
      [920, 820],
      [80, 820],
    ]),
    makePath('inner', [
      [160, 40],
      [160, 740],
      [840, 740],
      [840, 40],
    ]),
  ])

/** 菱形字：四邊都只以一個點觸及邊界（樹枝筆畫） */
const makeDiamondGlyph = (id: string, unicode: string) =>
  makeGlyph(id, unicode, [
    makePath('diamond', [
      [500, -40],
      [920, 400],
      [500, 820],
      [80, 400],
    ]),
  ])

describe('glyph geometry', () => {
  it('computes real ink area with counters subtracted', () => {
    const resolvedFont = resolveFontGlyphs(
      makeFontData([makeFrameGlyph('frame', '56DE')])
    )
    const polygons = flattenResolvedGlyph(
      resolvedFont.glyphs.frame,
      resolvedFont.glyphs
    )

    expect(polygons).toHaveLength(2)
    const outerArea = 840 * 860
    const innerArea = 680 * 700
    expect(computeInkArea(polygons)).toBeCloseTo(outerArea - innerArea, 0)

    const bounds = getPolygonsBounds(polygons)
    expect(bounds).toEqual({ xMin: 80, xMax: 920, yMin: -40, yMax: 820 })
  })

  it('does not cancel disjoint filled contours with opposite winding', () => {
    const clockwise = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ]
    const counterClockwise = [
      { x: 300, y: 0 },
      { x: 300, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 0 },
      { x: 300, y: 0 },
    ]

    expect(computeInkArea([clockwise, counterClockwise])).toBeCloseTo(20_000, 0)
  })

  it('flattens cubic curves into sampled polylines', () => {
    const polygon = flattenContour([
      { x: 0, y: 0, type: 'corner' },
      { x: 0, y: 100, type: 'offcurve' },
      { x: 100, y: 100, type: 'offcurve' },
      { x: 100, y: 0, type: 'corner' },
    ])

    expect(polygon.length).toBeGreaterThan(4)
    expect(polygon.some((point) => point.y > 40)).toBe(true)
  })

  it('applies component transforms', () => {
    const base = makeGlyph('base', null, [
      makePath('square', [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]),
    ])
    const composite: GlyphData = {
      ...makeGlyph('composite', null, []),
      componentRefs: [
        {
          id: 'ref',
          glyphId: 'base',
          x: 500,
          y: 200,
          scaleX: 2,
          scaleY: 1,
          rotation: 0,
        },
      ],
    }
    const resolvedFont = resolveFontGlyphs(makeFontData([base, composite]))

    const bounds = getPolygonsBounds(
      flattenResolvedGlyph(resolvedFont.glyphs.composite, resolvedFont.glyphs)
    )
    expect(bounds).toEqual({ xMin: 500, xMax: 700, yMin: 200, yMax: 300 })
  })
})

describe('structure metrics', () => {
  it('detects Han glyphs by unicode', () => {
    expect(isHanGlyph(makeGlyph('han', '56DE', []))).toBe(true)
    expect(isHanGlyph(makeGlyph('latin', '0041', []))).toBe(false)
    expect(isHanGlyph(makeGlyph('unencoded', null, []))).toBe(false)
  })

  it('classifies framing vs branching boundary strokes per side', () => {
    const frame = makeFrameGlyph('frame', '56DE')
    const diamond = makeDiamondGlyph('diamond', '4EBA')
    const resolvedFont = resolveFontGlyphs(makeFontData([frame, diamond]))
    const bodyBox = getStructureBodyBox(makeFontData([frame, diamond]))

    const frameSample = buildGlyphGeometrySample(
      resolvedFont.glyphs.frame,
      resolvedFont.glyphs,
      bodyBox
    )
    expect(frameSample).not.toBeNull()
    expect(frameSample?.sides.left.type).toBe('framing')
    expect(frameSample?.sides.right.type).toBe('framing')
    expect(frameSample?.sides.top.type).toBe('framing')
    expect(frameSample?.sides.bottom.type).toBe('framing')
    expect(frameSample?.sides.left.bearing).toBe(80)
    expect(frameSample?.sides.right.bearing).toBe(80)
    expect(frameSample?.sides.top.bearing).toBe(60)
    expect(frameSample?.sides.bottom.bearing).toBe(80)

    const diamondSample = buildGlyphGeometrySample(
      resolvedFont.glyphs.diamond,
      resolvedFont.glyphs,
      bodyBox
    )
    expect(diamondSample?.sides.left.type).toBe('branching')
    expect(diamondSample?.sides.right.type).toBe('branching')
    expect(diamondSample?.sides.top.type).toBe('branching')
    expect(diamondSample?.sides.bottom.type).toBe('branching')
  })

  it('derives baseline distributions from existing Han glyphs', () => {
    const glyphs = Array.from({ length: 24 }, (_, index) =>
      makeFrameGlyph(
        `frame${index}`,
        (0x4e00 + index).toString(16).toUpperCase()
      )
    )
    const fontData = makeFontData(glyphs)

    const { baseline } = analyzeFontPopulation(fontData)
    expect(baseline).not.toBeNull()
    expect(baseline?.sampleCount).toBe(24)
    expect(baseline?.sides.left.framing?.mode).toBe(80)
    expect(baseline?.sides.left.framing?.count).toBe(24)
    expect(baseline?.sides.top.framing?.mode).toBe(60)
    expect(baseline?.centerOffsetMedian).toBe(0)
  })
})
