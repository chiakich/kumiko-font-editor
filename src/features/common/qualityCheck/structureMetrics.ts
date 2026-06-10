import { getGlyphLayer, type FontData, type GlyphData } from 'src/store'
import {
  flattenGlyphToPolygons,
  getPolygonsBounds,
  type GeometryBounds,
  type GeometryPoint,
} from 'src/features/common/qualityCheck/glyphGeometry'

/**
 * 依 3type「中文字体解密组」研究報告 V1.2 實作：
 * - 每個漢字的「真實字面框」由最外側的「邊界筆畫」定義；
 * - 以「線」定義字面框的是框架筆畫（Framing Stroke），
 *   以「點」定義的是樹枝筆畫（Branching Stroke）；
 * - 對四邊分別統計兩類筆畫的邊距（side bearing）分布，
 *   取得眾數與 80% 集中區間，作為可推導的檢查值，
 *   用於檢查新做或新產生的字是否落在既有字的空間規律內。
 */

export type StructureSide = 'left' | 'right' | 'top' | 'bottom'
export type BoundaryStrokeType = 'framing' | 'branching'

export interface StructureSideSample {
  type: BoundaryStrokeType
  /** 該側邊距（左/右相對 advance，上/下相對字身框） */
  bearing: number
  /** 邊界附近幾何覆蓋該側長度的比例（用於框架/樹枝分類） */
  coverage: number
}

export interface StructureGlyphSample {
  glyphId: string
  glyphName: string
  character: string
  advance: number
  bounds: GeometryBounds
  sides: Record<StructureSide, StructureSideSample>
}

export interface SideDistribution {
  count: number
  /** 眾數（出現頻率最高的邊距值） */
  mode: number
  /** 80% 集中區間（P10–P90） */
  p10: number
  p90: number
  min: number
  max: number
}

export interface StructureBodyBox {
  top: number
  bottom: number
  unitsPerEm: number
}

export interface StructureBaseline {
  bodyBox: StructureBodyBox
  sampleCount: number
  sides: Record<
    StructureSide,
    Record<BoundaryStrokeType, SideDistribution | null>
  >
  /** 左右皆框架筆畫的字的 lsb-rsb 中位數（對稱性基準） */
  centerOffsetMedian: number | null
}

export interface StructureFinding {
  glyphId: string
  glyphName: string
  character: string
  side: StructureSide | null
  severity: 'warning' | 'info'
  message: string
}

export interface StructureAnalysis {
  baseline: StructureBaseline | null
  samples: StructureGlyphSample[]
}

const HAN_RANGES: Array<[number, number]> = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x3134f],
]

export const isHanCodePoint = (codePoint: number) =>
  HAN_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)

export const getGlyphCodePoint = (glyph: GlyphData) => {
  if (!glyph.unicode) {
    return null
  }
  const parsed = Number.parseInt(glyph.unicode, 16)
  return Number.isFinite(parsed) ? parsed : null
}

export const isHanGlyph = (glyph: GlyphData) => {
  const codePoint = getGlyphCodePoint(glyph)
  return codePoint !== null && isHanCodePoint(codePoint)
}

const DEFAULT_UNITS_PER_EM = 1000
/** CJK 慣用字身框：UPM 1000 時約為 [-120, 880] */
const DEFAULT_ASCENDER_RATIO = 0.88
/** 框架/樹枝分類閾值：邊界幾何覆蓋該側 55% 以上視為「以線定義」 */
const FRAMING_COVERAGE_THRESHOLD = 0.55
/** 邊界帶寬度（相對 UPM），落在極值往內這個距離內的點視為邊界點 */
const EDGE_BAND_RATIO = 0.018
const MIN_BASELINE_SAMPLES = 20
/** 對稱性檢查：lsb-rsb 偏離基準超過此值（相對 UPM）提示 */
const CENTER_OFFSET_TOLERANCE_RATIO = 0.02

export const getStructureBodyBox = (
  fontData: FontData | null | undefined
): StructureBodyBox => {
  const unitsPerEm = fontData?.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  const metrics = fontData?.lineMetricsHorizontalLayout
  const ascender = metrics?.ascender?.value
  const descender = metrics?.descender?.value
  const top =
    typeof ascender === 'number' && Number.isFinite(ascender) && ascender > 0
      ? ascender
      : Math.round(unitsPerEm * DEFAULT_ASCENDER_RATIO)
  const bottom =
    typeof descender === 'number' &&
    Number.isFinite(descender) &&
    descender <= 0
      ? descender
      : top - unitsPerEm
  return { top, bottom, unitsPerEm }
}

const getSideCoverage = (
  polygons: GeometryPoint[][],
  bounds: GeometryBounds,
  side: StructureSide,
  bandWidth: number
) => {
  const isHorizontalSide = side === 'top' || side === 'bottom'
  const edgeValue =
    side === 'left'
      ? bounds.xMin
      : side === 'right'
        ? bounds.xMax
        : side === 'top'
          ? bounds.yMax
          : bounds.yMin

  let spanMin = Number.POSITIVE_INFINITY
  let spanMax = Number.NEGATIVE_INFINITY
  for (const polygon of polygons) {
    for (const point of polygon) {
      const edgeAxisValue = isHorizontalSide ? point.y : point.x
      const inBand =
        side === 'left' || side === 'bottom'
          ? edgeAxisValue <= edgeValue + bandWidth
          : edgeAxisValue >= edgeValue - bandWidth
      if (!inBand) {
        continue
      }
      const spanValue = isHorizontalSide ? point.x : point.y
      spanMin = Math.min(spanMin, spanValue)
      spanMax = Math.max(spanMax, spanValue)
    }
  }

  if (!Number.isFinite(spanMin) || !Number.isFinite(spanMax)) {
    return 0
  }

  const sideLength = isHorizontalSide
    ? bounds.xMax - bounds.xMin
    : bounds.yMax - bounds.yMin
  return sideLength > 0 ? (spanMax - spanMin) / sideLength : 0
}

export const buildStructureGlyphSample = (
  glyph: GlyphData,
  fontData: FontData,
  bodyBox: StructureBodyBox
): StructureGlyphSample | null => {
  const polygons = flattenGlyphToPolygons(glyph, fontData.glyphs)
  const bounds = getPolygonsBounds(polygons)
  if (!bounds) {
    return null
  }

  const activeLayer = getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph
  const advance = activeLayer.metrics.width
  const bandWidth = bodyBox.unitsPerEm * EDGE_BAND_RATIO

  const buildSide = (
    side: StructureSide,
    bearing: number
  ): StructureSideSample => {
    const coverage = getSideCoverage(polygons, bounds, side, bandWidth)
    return {
      type: coverage >= FRAMING_COVERAGE_THRESHOLD ? 'framing' : 'branching',
      bearing: Math.round(bearing),
      coverage,
    }
  }

  const character = (() => {
    const codePoint = getGlyphCodePoint(glyph)
    return codePoint === null ? glyph.name : String.fromCodePoint(codePoint)
  })()

  return {
    glyphId: glyph.id,
    glyphName: glyph.name,
    character,
    advance,
    bounds,
    sides: {
      left: buildSide('left', bounds.xMin),
      right: buildSide('right', advance - bounds.xMax),
      top: buildSide('top', bodyBox.top - bounds.yMax),
      bottom: buildSide('bottom', bounds.yMin - bodyBox.bottom),
    },
  }
}

const quantile = (sortedValues: number[], q: number) => {
  if (sortedValues.length === 0) {
    return 0
  }
  const position = (sortedValues.length - 1) * q
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const weight = position - lowerIndex
  return Math.round(
    sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
  )
}

const buildDistribution = (values: number[]): SideDistribution | null => {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const frequency = new Map<number, number>()
  for (const value of sorted) {
    frequency.set(value, (frequency.get(value) ?? 0) + 1)
  }
  let mode = sorted[0]
  let bestCount = 0
  for (const [value, count] of frequency) {
    if (count > bestCount || (count === bestCount && value < mode)) {
      mode = value
      bestCount = count
    }
  }
  return {
    count: sorted.length,
    mode,
    p10: quantile(sorted, 0.1),
    p90: quantile(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

const STRUCTURE_SIDES: StructureSide[] = ['left', 'right', 'top', 'bottom']

export const sideLabels: Record<StructureSide, string> = {
  left: '左側',
  right: '右側',
  top: '頂部',
  bottom: '底部',
}

export const strokeTypeLabels: Record<BoundaryStrokeType, string> = {
  framing: '框架筆畫',
  branching: '樹枝筆畫',
}

/**
 * 從字體現有的漢字字形推導結構基準值。
 */
export const analyzeFontStructure = (
  fontData: FontData | null | undefined
): StructureAnalysis => {
  if (!fontData) {
    return { baseline: null, samples: [] }
  }

  const bodyBox = getStructureBodyBox(fontData)
  const samples: StructureGlyphSample[] = []
  for (const glyph of Object.values(fontData.glyphs)) {
    if (!isHanGlyph(glyph)) {
      continue
    }
    const sample = buildStructureGlyphSample(glyph, fontData, bodyBox)
    if (sample) {
      samples.push(sample)
    }
  }

  if (samples.length === 0) {
    return { baseline: null, samples }
  }

  const sideValues: Record<
    StructureSide,
    Record<BoundaryStrokeType, number[]>
  > = {
    left: { framing: [], branching: [] },
    right: { framing: [], branching: [] },
    top: { framing: [], branching: [] },
    bottom: { framing: [], branching: [] },
  }
  const centerOffsets: number[] = []

  for (const sample of samples) {
    for (const side of STRUCTURE_SIDES) {
      const sideSample = sample.sides[side]
      sideValues[side][sideSample.type].push(sideSample.bearing)
    }
    if (
      sample.sides.left.type === 'framing' &&
      sample.sides.right.type === 'framing'
    ) {
      centerOffsets.push(sample.sides.left.bearing - sample.sides.right.bearing)
    }
  }

  const baseline: StructureBaseline = {
    bodyBox,
    sampleCount: samples.length,
    sides: {
      left: {
        framing: buildDistribution(sideValues.left.framing),
        branching: buildDistribution(sideValues.left.branching),
      },
      right: {
        framing: buildDistribution(sideValues.right.framing),
        branching: buildDistribution(sideValues.right.branching),
      },
      top: {
        framing: buildDistribution(sideValues.top.framing),
        branching: buildDistribution(sideValues.top.branching),
      },
      bottom: {
        framing: buildDistribution(sideValues.bottom.framing),
        branching: buildDistribution(sideValues.bottom.branching),
      },
    },
    centerOffsetMedian:
      centerOffsets.length > 0
        ? quantile(
            [...centerOffsets].sort((left, right) => left - right),
            0.5
          )
        : null,
  }

  return { baseline, samples }
}

/**
 * 用推導出的基準值檢查指定字形（新做或新產生的字）。
 */
export const checkGlyphStructure = (
  sample: StructureGlyphSample,
  baseline: StructureBaseline
): StructureFinding[] => {
  const findings: StructureFinding[] = []

  for (const side of STRUCTURE_SIDES) {
    const sideSample = sample.sides[side]
    const typeLabel = strokeTypeLabels[sideSample.type]

    if (sideSample.bearing < 0) {
      findings.push({
        glyphId: sample.glyphId,
        glyphName: sample.glyphName,
        character: sample.character,
        side,
        severity: 'warning',
        message: `${sideLabels[side]}${typeLabel}邊距 ${sideSample.bearing}，超出字身框（負邊距）`,
      })
      continue
    }

    const distribution = baseline.sides[side][sideSample.type]
    if (!distribution || distribution.count < MIN_BASELINE_SAMPLES) {
      continue
    }

    if (
      sideSample.bearing < distribution.p10 ||
      sideSample.bearing > distribution.p90
    ) {
      const bandWidth = Math.max(1, distribution.p90 - distribution.p10)
      const overflow =
        sideSample.bearing < distribution.p10
          ? distribution.p10 - sideSample.bearing
          : sideSample.bearing - distribution.p90
      findings.push({
        glyphId: sample.glyphId,
        glyphName: sample.glyphName,
        character: sample.character,
        side,
        severity: overflow > bandWidth * 0.5 ? 'warning' : 'info',
        message: `${sideLabels[side]}${typeLabel}邊距 ${sideSample.bearing}，超出 80% 集中區間 ${distribution.p10}–${distribution.p90}（眾數 ${distribution.mode}）`,
      })
    }
  }

  if (
    baseline.centerOffsetMedian !== null &&
    sample.sides.left.type === 'framing' &&
    sample.sides.right.type === 'framing'
  ) {
    const offset = sample.sides.left.bearing - sample.sides.right.bearing
    const tolerance = Math.round(
      baseline.bodyBox.unitsPerEm * CENTER_OFFSET_TOLERANCE_RATIO
    )
    if (Math.abs(offset - baseline.centerOffsetMedian) > tolerance) {
      findings.push({
        glyphId: sample.glyphId,
        glyphName: sample.glyphName,
        character: sample.character,
        side: null,
        severity: 'info',
        message: `左右皆為框架筆畫，但 lsb-rsb = ${offset} 偏離整體基準 ${baseline.centerOffsetMedian}（容差 ±${tolerance}），視覺上可能不置中`,
      })
    }
  }

  return findings
}
