import {
  type GeometryBounds,
  type GeometryPoint,
} from 'src/features/common/qualityCheck/polygonGeometry'
import type { StructureBodyBox } from 'src/features/common/qualityCheck/hanClassification'

/**
 * 依 3type「中文字体解密组」研究報告 V1.2：
 * 每個漢字的真實字面框由最外側的「邊界筆畫」定義；以「線」定義字面框的是
 * 框架筆畫（Framing Stroke），以「點」定義的是樹枝筆畫（Branching Stroke）。
 * 本檔負責：四邊筆畫分類，以及從一組 sample 推導基準分布。
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

export type StructureSides = Record<StructureSide, StructureSideSample>

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

/** 框架/樹枝分類閾值：邊界幾何覆蓋該側 55% 以上視為「以線定義」 */
const FRAMING_COVERAGE_THRESHOLD = 0.55
/** 邊界帶寬度（相對 UPM），落在極值往內這個距離內的點視為邊界點 */
const EDGE_BAND_RATIO = 0.018

export const STRUCTURE_SIDES: StructureSide[] = [
  'left',
  'right',
  'top',
  'bottom',
]

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

/** 從已攤平的多邊形分類四邊筆畫並算邊距。 */
export const buildSidesFromPolygons = (
  polygons: GeometryPoint[][],
  bounds: GeometryBounds,
  advance: number,
  bodyBox: StructureBodyBox
): StructureSides => {
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

  return {
    left: buildSide('left', bounds.xMin),
    right: buildSide('right', advance - bounds.xMax),
    top: buildSide('top', bodyBox.top - bounds.yMax),
    bottom: buildSide('bottom', bounds.yMin - bodyBox.bottom),
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

/** 任何帶有四邊筆畫資訊的 sample 都能推導基準（避免與 glyphSampling 循環依賴）。 */
export interface StructureSideBearer {
  sides: StructureSides
}

export const buildStructureBaseline = (
  samples: StructureSideBearer[],
  bodyBox: StructureBodyBox
): StructureBaseline | null => {
  if (samples.length === 0) {
    return null
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

  return {
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
}
