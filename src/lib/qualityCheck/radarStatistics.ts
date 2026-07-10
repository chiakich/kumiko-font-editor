import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import { featureStatKeys } from 'src/lib/qualityCheck/radarFeatureCollection'
import type {
  RadarComplexityWindow,
  RadarFeatureValue,
  RadarRobustStat,
  RadarStrata,
} from 'src/lib/qualityCheck/qualityRadar'

const MAD_TO_SIGMA = 1.4826
const IQR_TO_SIGMA = 1 / 1.349
const MIN_WINDOW_SIZE = 40
const MAX_WINDOW_SIZE = 150
const WINDOW_STRIDE_DIVISOR = 3
const MAX_EXEMPLARS_PER_KEY = 5
const MIN_RADAR_SAMPLES = 20

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

/** 單側 MAD 樣本少於此數時不可信，退回整體尺度 */
const MIN_SIDE_SAMPLES = 5

const oneSidedScale = (
  sorted: number[],
  median: number,
  side: 'below' | 'above',
  fallback: number
) => {
  const deviations = sorted
    .filter((value) => (side === 'below' ? value <= median : value >= median))
    .map((value) => Math.abs(value - median))
    .sort((left, right) => left - right)
  if (deviations.length < MIN_SIDE_SAMPLES) {
    return fallback
  }
  const sideMad = quantileOf(deviations, 0.5)
  return sideMad > 0 ? sideMad * MAD_TO_SIGMA : fallback
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
  return {
    count: sorted.length,
    median,
    scale,
    scaleBelow: oneSidedScale(sorted, median, 'below', scale),
    scaleAbove: oneSidedScale(sorted, median, 'above', scale),
    p10,
    p90,
  }
}

export const radarZScore = (
  value: number,
  stat: RadarRobustStat,
  scaleFloor = 0
) => {
  // 偏態分布用該側自己的尺度量偏離；尺度不得低於感知下限
  const sideScale = value >= stat.median ? stat.scaleAbove : stat.scaleBelow
  const scale = Math.max(sideScale, scaleFloor)
  return scale > 0 ? (value - stat.median) / scale : 0
}

/** 複雜度代理值：墨水面積開根號（≈ 筆畫數 × 筆畫尺度），對 UPM 正規化 */
export const glyphComplexity = (
  sample: GlyphGeometrySample,
  unitsPerEm: number
) => Math.sqrt(Math.max(0, sample.ink.inkArea)) / unitsPerEm

export interface GlyphFeatureEntry {
  sample: GlyphGeometrySample
  complexity: number
  features: RadarFeatureValue[]
}

/**
 * 放置類特徵：邊距與重心描述的是「字放在字身框的哪裡」，
 * 排印慣例（部件形式、間距形式）因字體而異，參考字體單獨不可信，
 * 同儕統計也會被天生特殊的字誤導。這類特徵要兩把尺同向才算異常。
 * 形狀類特徵先經目前字體的 style scale／error 校正，再平移期待值。
 */

export const buildStrata = (
  glyphFeatures: GlyphFeatureEntry[]
): RadarStrata => {
  const sorted = [...glyphFeatures].sort(
    (left, right) => left.complexity - right.complexity
  )
  const total = sorted.length
  const windowSize = Math.min(
    total,
    Math.max(MIN_WINDOW_SIZE, Math.min(MAX_WINDOW_SIZE, Math.ceil(total / 3)))
  )
  const stride = Math.max(1, Math.floor(windowSize / WINDOW_STRIDE_DIVISOR))
  const lastStart = total - windowSize

  const windows: RadarComplexityWindow[] = []
  for (let start = 0; ; start += stride) {
    const windowStart = Math.min(start, lastStart)
    const slice = sorted.slice(windowStart, windowStart + windowSize)
    const complexityStat = buildRobustStat(
      slice.map((entry) => entry.complexity)
    )
    if (complexityStat) {
      const entriesByKey = new Map<
        string,
        Array<{ value: number; character: string }>
      >()
      for (const entry of slice) {
        for (const feature of entry.features) {
          for (const statKey of featureStatKeys(feature)) {
            const values = entriesByKey.get(statKey) ?? []
            values.push({
              value: feature.value,
              character: entry.sample.character,
            })
            entriesByKey.set(statKey, values)
          }
        }
      }
      const statsByKey = new Map<string, RadarRobustStat>()
      const exemplarsByKey = new Map<string, string[]>()
      for (const [key, entries] of entriesByKey) {
        // 視窗內樣本不足的特徵直接不評（如某側 framing 邊距太稀少）。
        // 寧可少量一項，也不要退回全體統計拿錯誤的尺去量
        if (entries.length < MIN_RADAR_SAMPLES) {
          continue
        }
        const stat = buildRobustStat(entries.map((entry) => entry.value))
        if (stat) {
          statsByKey.set(key, stat)
          const exemplars: string[] = []
          for (const entry of [...entries].sort(
            (left, right) =>
              Math.abs(left.value - stat.median) -
              Math.abs(right.value - stat.median)
          )) {
            if (entry.character && !exemplars.includes(entry.character)) {
              exemplars.push(entry.character)
              if (exemplars.length >= MAX_EXEMPLARS_PER_KEY) {
                break
              }
            }
          }
          exemplarsByKey.set(key, exemplars)
        }
      }
      windows.push({
        centerComplexity: complexityStat.median,
        complexityStat,
        statsByKey,
        exemplarsByKey,
      })
    }
    if (windowStart >= lastStart) {
      break
    }
  }
  return { windows }
}

export const nearestWindow = (
  strata: RadarStrata,
  complexity: number
): RadarComplexityWindow | null => {
  const windows = strata.windows
  if (windows.length === 0) {
    return null
  }
  let low = 0
  let high = windows.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (windows[mid].centerComplexity < complexity) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  if (
    low > 0 &&
    complexity - windows[low - 1].centerComplexity <
      windows[low].centerComplexity - complexity
  ) {
    return windows[low - 1]
  }
  return windows[low]
}
