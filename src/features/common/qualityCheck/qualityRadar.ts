import type { FontData, GlyphData } from 'src/store'
import { getGlyphLayer } from 'src/store'
import { getGlyphInkMetrics } from 'src/features/common/qualityCheck/glyphGeometry'
import {
  buildStructureGlyphSample,
  getStructureBodyBox,
  isHanGlyph,
  sideLabels,
  strokeTypeLabels,
  type StructureGlyphSample,
  type StructureSide,
} from 'src/features/common/qualityCheck/structureMetrics'

/**
 * Font Quality Radar：以同一套字體自身的統計分布為基準的
 * 幾何離群偵測（outlier detection），不是美學評分。
 * 每個特徵以 median/MAD 計算 robust z-score，
 * 偏離群體越遠的字越值得人工檢查。
 */

export type RadarDimension = 'boundary' | 'proportion' | 'ink' | 'balance'

export const radarDimensionLabels: Record<RadarDimension, string> = {
  boundary: '邊界一致性',
  proportion: '字面比例',
  ink: '墨量穩定',
  balance: '視覺重心',
}

export type RadarValueFormat = 'units' | 'ratio' | 'percent'

interface RadarFeatureDefinition {
  key: string
  label: string
  dimension: RadarDimension
  format: RadarValueFormat
}

export interface RadarFeatureValue extends RadarFeatureDefinition {
  value: number
}

export interface RadarRobustStat {
  count: number
  median: number
  /** robust 標準差（1.4826 × MAD，MAD 退化時退回 IQR 估計） */
  scale: number
  p10: number
  p90: number
}

export interface RadarReason {
  key: string
  label: string
  dimension: RadarDimension
  format: RadarValueFormat
  value: number
  median: number
  zScore: number
}

export interface RadarGlyphEvaluation {
  glyphId: string
  glyphName: string
  character: string
  /** 超出正常區間的累積程度；0 表示完全落在群體內 */
  score: number
  reasons: RadarReason[]
}

export interface RadarDimensionScore {
  dimension: RadarDimension
  /** 0–100：該維度下「無明顯離群特徵」的字形比例 */
  score: number
  outlierCount: number
}

export interface RadarAnalysis {
  sampleCount: number
  featureStats: Map<string, RadarRobustStat>
  dimensionScores: RadarDimensionScore[]
  overallScore: number
  /** 依風險分數排序的可疑字形（score > 0） */
  suspects: RadarGlyphEvaluation[]
  evaluationByGlyphId: Map<string, RadarGlyphEvaluation>
}

/** 特徵 |z| 達此值列入異常原因 */
export const RADAR_REASON_Z = 2
/** 特徵 |z| 達此值將該字計入維度離群 */
export const RADAR_OUTLIER_Z = 2.5
const MIN_RADAR_SAMPLES = 20
const MAD_TO_SIGMA = 1.4826
const IQR_TO_SIGMA = 1 / 1.349

const STRUCTURE_SIDES: StructureSide[] = ['left', 'right', 'top', 'bottom']

const collectGlyphFeatures = (
  glyph: GlyphData,
  fontData: FontData,
  sample: StructureGlyphSample,
  unitsPerEm: number,
  bodyCenterY: number
): RadarFeatureValue[] => {
  const features: RadarFeatureValue[] = []
  const activeLayer = getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph
  const advance = Math.max(1, activeLayer.metrics.width)

  // 邊界：依邊界筆畫理論，框架/樹枝筆畫分開建立分布
  for (const side of STRUCTURE_SIDES) {
    const sideSample = sample.sides[side]
    features.push({
      key: `bearing:${side}:${sideSample.type}`,
      label: `${sideLabels[side]}${strokeTypeLabels[sideSample.type]}邊距`,
      dimension: 'boundary',
      format: 'units',
      value: sideSample.bearing,
    })
  }

  // 字面比例
  const faceWidth = sample.bounds.xMax - sample.bounds.xMin
  const faceHeight = sample.bounds.yMax - sample.bounds.yMin
  features.push({
    key: 'face:widthRatio',
    label: '字面寬度比',
    dimension: 'proportion',
    format: 'percent',
    value: faceWidth / advance,
  })
  features.push({
    key: 'face:heightRatio',
    label: '字面高度比',
    dimension: 'proportion',
    format: 'percent',
    value: faceHeight / unitsPerEm,
  })
  if (faceHeight > 0) {
    features.push({
      key: 'face:aspect',
      label: '字面長寬比',
      dimension: 'proportion',
      format: 'ratio',
      value: faceWidth / faceHeight,
    })
  }

  // 墨量與密度分布
  const ink = getGlyphInkMetrics(glyph, fontData.glyphs, unitsPerEm)
  if (ink.inkToFaceRatio !== null) {
    features.push({
      key: 'ink:toFace',
      label: '字面內墨量比',
      dimension: 'ink',
      format: 'percent',
      value: ink.inkToFaceRatio,
    })
  }
  if (ink.inkToEmRatio !== null) {
    features.push({
      key: 'ink:toEm',
      label: '版面墨量比',
      dimension: 'ink',
      format: 'percent',
      value: ink.inkToEmRatio,
    })
  }
  if (ink.spreadX !== null && ink.spreadY !== null) {
    features.push({
      key: 'ink:spreadX',
      label: '水平密度分布',
      dimension: 'ink',
      format: 'percent',
      value: ink.spreadX / advance,
    })
    features.push({
      key: 'ink:spreadY',
      label: '垂直密度分布',
      dimension: 'ink',
      format: 'percent',
      value: ink.spreadY / unitsPerEm,
    })
  }

  // 視覺重心
  if (ink.centroidX !== null && ink.centroidY !== null) {
    features.push({
      key: 'balance:centroidX',
      label: '重心水平偏移',
      dimension: 'balance',
      format: 'percent',
      value: (ink.centroidX - advance / 2) / advance,
    })
    features.push({
      key: 'balance:centroidY',
      label: '重心垂直偏移',
      dimension: 'balance',
      format: 'percent',
      value: (ink.centroidY - bodyCenterY) / unitsPerEm,
    })
  }

  return features
}

const quantileOf = (sorted: number[], q: number) => {
  if (sorted.length === 0) {
    return 0
  }
  const position = (sorted.length - 1) * q
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const weight = position - lowerIndex
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
}

export const buildRobustStat = (values: number[]): RadarRobustStat | null => {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const median = quantileOf(sorted, 0.5)
  const deviations = sorted
    .map((value) => Math.abs(value - median))
    .sort((left, right) => left - right)
  const mad = quantileOf(deviations, 0.5)
  const p10 = quantileOf(sorted, 0.1)
  const p90 = quantileOf(sorted, 0.9)
  // MAD 為 0 時（半數以上樣本同值）逐步退回更寬的離散度估計
  const iqr = quantileOf(sorted, 0.75) - quantileOf(sorted, 0.25)
  const scale =
    mad > 0
      ? mad * MAD_TO_SIGMA
      : iqr > 0
        ? iqr * IQR_TO_SIGMA
        : (p90 - p10) / 2.563
  return { count: sorted.length, median, scale, p10, p90 }
}

export const radarZScore = (value: number, stat: RadarRobustStat) =>
  stat.scale > 0 ? (value - stat.median) / stat.scale : 0

const RADAR_DIMENSIONS: RadarDimension[] = [
  'boundary',
  'proportion',
  'ink',
  'balance',
]

export const buildRadarAnalysis = (
  fontData: FontData | null | undefined
): RadarAnalysis | null => {
  if (!fontData) {
    return null
  }

  const bodyBox = getStructureBodyBox(fontData)
  const unitsPerEm = bodyBox.unitsPerEm
  const bodyCenterY = (bodyBox.top + bodyBox.bottom) / 2

  const glyphFeatures: Array<{
    glyph: GlyphData
    character: string
    features: RadarFeatureValue[]
  }> = []
  for (const glyph of Object.values(fontData.glyphs)) {
    if (!isHanGlyph(glyph)) {
      continue
    }
    const sample = buildStructureGlyphSample(glyph, fontData, bodyBox)
    if (!sample) {
      continue
    }
    glyphFeatures.push({
      glyph,
      character: sample.character,
      features: collectGlyphFeatures(
        glyph,
        fontData,
        sample,
        unitsPerEm,
        bodyCenterY
      ),
    })
  }

  if (glyphFeatures.length < MIN_RADAR_SAMPLES) {
    return null
  }

  const valuesByFeature = new Map<string, number[]>()
  for (const entry of glyphFeatures) {
    for (const feature of entry.features) {
      const values = valuesByFeature.get(feature.key) ?? []
      values.push(feature.value)
      valuesByFeature.set(feature.key, values)
    }
  }

  const featureStats = new Map<string, RadarRobustStat>()
  for (const [key, values] of valuesByFeature) {
    if (values.length < MIN_RADAR_SAMPLES) {
      continue
    }
    const stat = buildRobustStat(values)
    if (stat) {
      featureStats.set(key, stat)
    }
  }

  const evaluationByGlyphId = new Map<string, RadarGlyphEvaluation>()
  const dimensionOutliers: Record<RadarDimension, number> = {
    boundary: 0,
    proportion: 0,
    ink: 0,
    balance: 0,
  }

  for (const entry of glyphFeatures) {
    const reasons: RadarReason[] = []
    const dimensionHit = new Set<RadarDimension>()
    let score = 0

    for (const feature of entry.features) {
      const stat = featureStats.get(feature.key)
      if (!stat) {
        continue
      }
      const zScore = radarZScore(feature.value, stat)
      const excess = Math.abs(zScore) - RADAR_REASON_Z
      if (excess > 0) {
        score += excess * excess
        reasons.push({
          key: feature.key,
          label: feature.label,
          dimension: feature.dimension,
          format: feature.format,
          value: feature.value,
          median: stat.median,
          zScore,
        })
      }
      if (Math.abs(zScore) >= RADAR_OUTLIER_Z) {
        dimensionHit.add(feature.dimension)
      }
    }

    for (const dimension of dimensionHit) {
      dimensionOutliers[dimension] += 1
    }
    reasons.sort(
      (left, right) => Math.abs(right.zScore) - Math.abs(left.zScore)
    )
    evaluationByGlyphId.set(entry.glyph.id, {
      glyphId: entry.glyph.id,
      glyphName: entry.glyph.name,
      character: entry.character,
      score,
      reasons,
    })
  }

  const sampleCount = glyphFeatures.length
  const dimensionScores = RADAR_DIMENSIONS.map((dimension) => ({
    dimension,
    score: Math.round(100 * (1 - dimensionOutliers[dimension] / sampleCount)),
    outlierCount: dimensionOutliers[dimension],
  }))
  const overallScore = Math.round(
    dimensionScores.reduce((total, entry) => total + entry.score, 0) /
      dimensionScores.length
  )

  const suspects = [...evaluationByGlyphId.values()]
    .filter((evaluation) => evaluation.score > 0)
    .sort((left, right) => right.score - left.score)

  return {
    sampleCount,
    featureStats,
    dimensionScores,
    overallScore,
    suspects,
    evaluationByGlyphId,
  }
}

export const formatRadarValue = (
  value: number,
  format: RadarValueFormat
): string => {
  if (format === 'units') {
    return `${Math.round(value)}`
  }
  if (format === 'percent') {
    return `${(value * 100).toFixed(1)}%`
  }
  return value.toFixed(2)
}

export const formatRadarReason = (reason: RadarReason) =>
  `${reason.label} ${formatRadarValue(reason.value, reason.format)}（中位 ${formatRadarValue(reason.median, reason.format)}，z ${reason.zScore.toFixed(1)}）`
