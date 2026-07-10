import { featureStatKeys } from 'src/lib/qualityCheck/radarFeatureCollection'
import {
  nearestWindow,
  type GlyphFeatureEntry,
} from 'src/lib/qualityCheck/radarStatistics'
import {
  fitReferenceStyleModel,
  type ReferenceStylePair,
} from 'src/lib/qualityCheck/referenceStyleModel'
import type {
  RadarFeatureValue,
  RadarReferenceData,
  RadarReferenceFeatureKey,
  RadarRobustStat,
  RadarStrata,
} from 'src/lib/qualityCheck/qualityRadar'

export const RADAR_REFERENCE_FEATURE_KEYS = new Set<RadarReferenceFeatureKey>([
  'face:widthRatio',
  'face:heightRatio',
  'face:aspect',
  'balance:centroidX',
  'balance:centroidY',
  'ink:toFace',
  'bearing:left',
  'bearing:right',
  'bearing:top',
  'bearing:bottom',
  'gap:x',
  'gap:y',
])

/**
 * 邊距特徵帶幾何分型後綴（bearing:left:framing），但分型會隨畫壞的
 * 輪廓共變，參考資料以「邊」為鍵、不分型。residual 以 UPM 正規化儲存。
 */
export const referenceFeatureKeyOf = (
  featureKey: string
): RadarReferenceFeatureKey | null => {
  const key = featureKey.startsWith('bearing:')
    ? featureKey.split(':').slice(0, 2).join(':')
    : featureKey
  return RADAR_REFERENCE_FEATURE_KEYS.has(key as RadarReferenceFeatureKey)
    ? (key as RadarReferenceFeatureKey)
    : null
}

const isNormalizedBearingKey = (key: RadarReferenceFeatureKey) =>
  key.startsWith('bearing:')

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

interface ResolvedReferenceResidual {
  key: RadarReferenceFeatureKey
  /** 尚未套用 confidence 與字體風格縮放的 residual。 */
  value: number
  confidence: number
}

const resolveReferenceResidual = (
  referenceData: RadarReferenceData | null | undefined,
  character: string,
  feature: RadarFeatureValue,
  unitsPerEm: number
): ResolvedReferenceResidual | null => {
  if (!referenceData) {
    return null
  }
  const referenceKey = referenceFeatureKeyOf(feature.key)
  if (!referenceKey) {
    return null
  }
  const entry = referenceData.residualsByCharacter[character]?.[referenceKey]
  if (entry === undefined) {
    return null
  }
  // 邊距 residual 以 UPM 正規化儲存，換回目前字體的座標單位
  const unitScale = isNormalizedBearingKey(referenceKey) ? unitsPerEm : 1
  if (typeof entry === 'number') {
    return {
      key: referenceKey,
      value: entry * unitScale,
      confidence: clamp01(referenceData.defaultConfidence ?? 1),
    }
  }
  return {
    key: referenceKey,
    value: entry.value * unitScale,
    confidence: clamp01(
      entry.confidence ?? referenceData.defaultConfidence ?? 1
    ),
  }
}

export const referenceResidualValue = (
  referenceData: RadarReferenceData | null | undefined,
  referenceStyleScales: Partial<Record<RadarReferenceFeatureKey, number>>,
  character: string,
  feature: RadarFeatureValue,
  unitsPerEm: number
): number | null => {
  const residual = resolveReferenceResidual(
    referenceData,
    character,
    feature,
    unitsPerEm
  )
  if (!residual) {
    return null
  }
  return (
    residual.value *
    residual.confidence *
    (referenceStyleScales[residual.key] ?? 1)
  )
}

export const shiftStat = (
  stat: RadarRobustStat,
  medianShift: number,
  scaleFloor = 0
): RadarRobustStat => ({
  ...stat,
  median: stat.median + medianShift,
  p10: stat.p10 + medianShift,
  p90: stat.p90 + medianShift,
  scale: Math.max(stat.scale, scaleFloor),
  scaleBelow: Math.max(stat.scaleBelow, scaleFloor),
  scaleAbove: Math.max(stat.scaleAbove, scaleFloor),
})

const STYLE_ADAPTIVE_REFERENCE_KEYS = new Set<RadarReferenceFeatureKey>([
  'face:widthRatio',
  'face:heightRatio',
  'face:aspect',
  'ink:toFace',
  'gap:x',
  'gap:y',
])
export const buildReferenceStyleScales = (
  glyphFeatures: GlyphFeatureEntry[],
  strata: RadarStrata,
  referenceData: RadarReferenceData | null,
  unitsPerEm: number
): {
  scales: Partial<Record<RadarReferenceFeatureKey, number>>
  errors: Partial<Record<RadarReferenceFeatureKey, number>>
} => {
  if (!referenceData) {
    return { scales: {}, errors: {} }
  }
  const pairsByKey = new Map<RadarReferenceFeatureKey, ReferenceStylePair[]>()
  for (const entry of glyphFeatures) {
    const window = nearestWindow(strata, entry.complexity)
    if (!window) {
      continue
    }
    for (const feature of entry.features) {
      const residual = resolveReferenceResidual(
        referenceData,
        entry.sample.character,
        feature,
        unitsPerEm
      )
      if (!residual || !STYLE_ADAPTIVE_REFERENCE_KEYS.has(residual.key)) {
        continue
      }
      const statKey = featureStatKeys(feature).find((key) =>
        window.statsByKey.has(key)
      )
      const peerStat = statKey ? window.statsByKey.get(statKey) : undefined
      if (!peerStat) {
        continue
      }
      const pairs = pairsByKey.get(residual.key) ?? []
      pairs.push({
        reference: residual.value,
        current: feature.value - peerStat.median,
        confidence: residual.confidence,
      })
      pairsByKey.set(residual.key, pairs)
    }
  }

  const scales: Partial<Record<RadarReferenceFeatureKey, number>> = {}
  const errors: Partial<Record<RadarReferenceFeatureKey, number>> = {}
  for (const [key, pairs] of pairsByKey) {
    const model = fitReferenceStyleModel(pairs)
    scales[key] = model.scale
    errors[key] = model.error
  }
  return { scales, errors }
}
