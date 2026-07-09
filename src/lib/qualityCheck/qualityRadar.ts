import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import {
  sideLabels,
  strokeTypeLabels,
  type StructureSide,
} from 'src/lib/qualityCheck/structureMetrics'

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
  /**
   * 比較群組：同視窗內再細分的比較母體（如按包圍結構分組）。
   * 只影響統計分組，不進 RadarReason.key，advice 文案對應不受影響。
   */
  cohort?: string
  /**
   * 感知尺度下限：母體高度一致時 MAD 會縮到肉眼無法分辨的量級，
   * 把毫無視覺意義的差異放大成極端 z 值。量偏離時尺度至少取此值。
   */
  scaleFloor?: number
}

export interface RadarRobustStat {
  count: number
  median: number
  /** robust 標準差（1.4826 × MAD，MAD 退化時退回更寬的離散度估計） */
  scale: number
  /**
   * 雙側尺度（double-MAD）：3type 報告指出邊距分布是偏態的
   * （眾數貼近範圍最大值端），對稱的單一尺度會高估長尾側、
   * 低估短尾側的偏離。低於中位數與高於中位數的偏差各自估尺度。
   */
  scaleBelow: number
  scaleAbove: number
  p10: number
  p90: number
}

export interface RadarReason {
  key: string
  label: string
  dimension: RadarDimension
  format: RadarValueFormat
  /** 這項建議使用的尺：複雜度相近母體、或參考字體 residual 校正 */
  basis: RadarBasis
  value: number
  /** 比較母體（複雜度相鄰視窗）的中位數與 80% 區間 */
  median: number
  p10: number
  p90: number
  zScore: number
  /** 同比較組中最接近中位數的參照字，供 UI 對照「正常長怎樣」 */
  peerCharacters?: string[]
}

export interface RadarGlyphEvaluation {
  glyphId: string
  glyphName: string
  character: string
  /** 各維度最大偏離的平方和；0 表示完全落在群體內 */
  score: number
  reasons: RadarReason[]
}

export type RadarBasis = 'peers' | 'reference'

export type RadarReferenceFeatureKey =
  | 'face:widthRatio'
  | 'face:heightRatio'
  | 'face:aspect'
  | 'balance:centroidX'
  | 'balance:centroidY'
  | 'ink:toFace'
  | 'bearing:left'
  | 'bearing:right'
  | 'bearing:top'
  | 'bearing:bottom'

export interface RadarReferenceResidual {
  /** 參考字體中「此字 − 參考同儕 median」的相對偏移，單位同 feature value */
  value: number
  /** 0–1；用來降低參考字體風格對目前字體的影響，未指定時用 dataset default */
  confidence?: number
}

export type RadarReferenceResidualInput = number | RadarReferenceResidual

export interface RadarReferenceData {
  /** 顯示/除錯用，例如 Noto Sans CJK Regular */
  source?: string
  /** 未逐字指定 confidence 時使用；未指定表示完整套用 residual */
  defaultConfidence?: number
  residualsByCharacter: Partial<
    Record<
      string,
      Partial<Record<RadarReferenceFeatureKey, RadarReferenceResidualInput>>
    >
  >
}

export interface RadarDimensionScore {
  dimension: RadarDimension
  /** 0–100：該維度下「無明顯離群特徵」的字形比例 */
  score: number
  outlierCount: number
}

/**
 * 複雜度視窗：一/丶這類筆畫極簡的字，邊距與字面天生就跟複雜字不同，
 * 拿全體統計比會永遠霸佔風險榜。固定層數的 quantile 分層也不夠：
 * 最低層的中位字仍有三五畫，單筆畫字在層內依舊是極端值。
 * 改為沿複雜度排序取重疊滑動視窗，每個字只跟「複雜度最接近的 K 個字」比，
 * 丶的比較對象就真的是丨丿冫亅。視窗內同時保留複雜度自身的分布，
 * 供 peer-mismatch 折扣判斷「這個字在視窗內是否仍缺乏真正的同儕」。
 */
export interface RadarComplexityWindow {
  /** 視窗複雜度中位數，評分時以此挑最近視窗 */
  centerComplexity: number
  /** 視窗內複雜度分布（peer-mismatch 折扣用） */
  complexityStat: RadarRobustStat
  statsByKey: Map<string, RadarRobustStat>
  /** 每個 feature/cohort 中最接近中位數的參照字（UI 對照用） */
  exemplarsByKey: Map<string, string[]>
}

export interface RadarStrata {
  /** 依 centerComplexity 遞增排列的重疊視窗 */
  windows: RadarComplexityWindow[]
}

export interface RadarAnalysis {
  sampleCount: number
  strata: RadarStrata
  /** 參考字體 residual 資料；用來把目前字體同儕 median 平移到該字的結構期待值 */
  referenceData: RadarReferenceData | null
  /** 母體中被 GlyphWiki 組成資料判定為包圍結構的字（即時評分路徑沿用同一分類） */
  enclosureCharacters: Set<string>
  dimensionScores: RadarDimensionScore[]
  overallScore: number
  /** 依風險分數排序的可疑字形（score ≥ RADAR_SUSPECT_SCORE） */
  suspects: RadarGlyphEvaluation[]
  evaluationByGlyphId: Map<string, RadarGlyphEvaluation>
}

/** 特徵 |z| 達此值列入異常原因 */
export const RADAR_REASON_Z = 2
/** 特徵 |z| 達此值將該字計入維度離群 */
export const RADAR_OUTLIER_Z = 2.5
/** 風險分數達此值才列入可疑字（單維度 z≥3 或多維度中度偏離） */
export const RADAR_SUSPECT_SCORE = 1
/** 單一特徵計分時 |z| 封頂，避免極端字以天文數字霸佔排名 */
const RADAR_Z_CAP = 8
const MIN_RADAR_SAMPLES = 20
/**
 * 視窗大小 K = clamp(ceil(N/3), 40, 150)：
 * 下限 40 保住 median/MAD 的估計品質（scale 誤差 ≈ 1.16/√K），
 * 上限 150 維持比較母體的局部性；字數少時平滑退化為全體統計。
 */
const MIN_WINDOW_SIZE = 40
const MAX_WINDOW_SIZE = 150
/** 視窗間隔 = K / 3，相鄰視窗約 2/3 重疊 */
const WINDOW_STRIDE_DIVISOR = 3
/** 每個 feature/cohort 保留的參照字數（含被評估字本身，UI 端會濾掉） */
const MAX_EXEMPLARS_PER_KEY = 5
/**
 * peer-mismatch 折扣強度：字的複雜度在視窗內 |z| 每超出 1 一個單位，
 * 特徵 z 分數的折扣分母加 0.5。視窗已經很局部，只需弱折扣處理
 * 排序兩端（最簡單/最複雜的一批字）視窗內仍偏斜的殘餘問題。
 */
const PEER_MISMATCH_RATE = 0.5
const MAD_TO_SIGMA = 1.4826
const IQR_TO_SIGMA = 1 / 1.349

const STRUCTURE_SIDES: StructureSide[] = ['left', 'right', 'top', 'bottom']

/**
 * 感知尺度下限（以優質商業字體校正）：低於這些量級的偏差
 * 在字身框尺度下難以目視分辨，不應該產生高 z 值建議。
 */
const BEARING_FLOOR_RATIO = 0.01
const SYMMETRY_FLOOR_RATIO = 0.015
const PERCENT_FLOOR = 0.01
const ASPECT_FLOOR = 0.02

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

const collectGlyphFeatures = (
  sample: GlyphGeometrySample,
  unitsPerEm: number,
  bodyCenterY: number,
  semanticEnclosure: boolean
): RadarFeatureValue[] => {
  const features: RadarFeatureValue[] = []
  const advance = Math.max(1, sample.advance)
  const ink = sample.ink

  /**
   * 包圍結構分組：口框/日目類兩側皆框架筆畫的字，依排版慣例字面要
   * 收窄補償（包圍結構視覺上顯大），跟無包圍的字本來就不該同尺比。
   * 以每軸的框架筆畫數（0/1/2）當 cohort，尺寸/邊距/墨量特徵
   * 只跟同包圍程度的字比較。
   * GlyphWiki 組成資料判定為包圍結構的字（semanticEnclosure）
   * 直接視四側為框架筆畫：幾何分型會隨畫壞的輪廓共變，語意分類不會。
   */
  const sideType = (side: StructureSide) =>
    semanticEnclosure ? 'framing' : sample.sides[side].type
  const hFraming =
    (sideType('left') === 'framing' ? 1 : 0) +
    (sideType('right') === 'framing' ? 1 : 0)
  const vFraming =
    (sideType('top') === 'framing' ? 1 : 0) +
    (sideType('bottom') === 'framing' ? 1 : 0)
  const hCohort = `h${hFraming}`
  const vCohort = `v${vFraming}`
  const faceCohort = `${hCohort}${vCohort}`

  // 邊界：依邊界筆畫理論，框架/樹枝筆畫分開建立分布；
  // cohort 帶對側類型，全包圍字的邊距只跟其他全包圍字比
  const oppositeSide: Record<StructureSide, StructureSide> = {
    left: 'right',
    right: 'left',
    top: 'bottom',
    bottom: 'top',
  }
  for (const side of STRUCTURE_SIDES) {
    const type = sideType(side)
    features.push({
      key: `bearing:${side}:${type}`,
      label: `${sideLabels[side]}${strokeTypeLabels[type]}邊距`,
      dimension: 'boundary',
      format: 'units',
      value: sample.sides[side].bearing,
      cohort: sideType(oppositeSide[side]),
      scaleFloor: unitsPerEm * BEARING_FLOOR_RATIO,
    })
  }

  // 對稱性（3type 報告 P83）：框架字應在字身框中視覺置中，
  // lsb−rsb 的離群直接量測未置中（比墨水重心對框架字更銳利）。
  // 只對語意包圍字或四邊皆框架的字生效：阝部、匚框這類
  // 「單側框架、設計上本來就不對稱」的字不適用這個規則。
  if (semanticEnclosure || (hFraming === 2 && vFraming === 2)) {
    features.push({
      key: 'bearing:symmetryH',
      label: '左右置中偏移',
      dimension: 'balance',
      format: 'units',
      value: sample.sides.left.bearing - sample.sides.right.bearing,
      scaleFloor: unitsPerEm * SYMMETRY_FLOOR_RATIO,
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
    cohort: hCohort,
    scaleFloor: PERCENT_FLOOR,
  })
  features.push({
    key: 'face:heightRatio',
    label: '字面高度比',
    dimension: 'proportion',
    format: 'percent',
    value: faceHeight / unitsPerEm,
    cohort: vCohort,
    scaleFloor: PERCENT_FLOOR,
  })
  if (faceHeight > 0) {
    features.push({
      key: 'face:aspect',
      label: '字面長寬比',
      dimension: 'proportion',
      format: 'ratio',
      value: faceWidth / faceHeight,
      cohort: faceCohort,
      scaleFloor: ASPECT_FLOOR,
    })
  }

  // 墨量與密度分布
  if (ink.inkToFaceRatio !== null) {
    // 字面收窄會直接推高墨量比，跟著包圍程度分組
    features.push({
      key: 'ink:toFace',
      label: '字面內墨量比',
      dimension: 'ink',
      format: 'percent',
      value: ink.inkToFaceRatio,
      cohort: faceCohort,
      scaleFloor: PERCENT_FLOOR,
    })
  }
  if (ink.inkToEmRatio !== null) {
    features.push({
      key: 'ink:toEm',
      label: '版面墨量比',
      dimension: 'ink',
      format: 'percent',
      value: ink.inkToEmRatio,
      scaleFloor: PERCENT_FLOOR,
    })
  }
  if (ink.spreadX !== null && ink.spreadY !== null) {
    features.push({
      key: 'ink:spreadX',
      label: '水平密度分布',
      dimension: 'ink',
      format: 'percent',
      value: ink.spreadX / advance,
      cohort: hCohort,
      scaleFloor: PERCENT_FLOOR,
    })
    features.push({
      key: 'ink:spreadY',
      label: '垂直密度分布',
      dimension: 'ink',
      format: 'percent',
      value: ink.spreadY / unitsPerEm,
      cohort: vCohort,
      scaleFloor: PERCENT_FLOOR,
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
      scaleFloor: PERCENT_FLOOR,
    })
    features.push({
      key: 'balance:centroidY',
      label: '重心垂直偏移',
      dimension: 'balance',
      format: 'percent',
      value: (ink.centroidY - bodyCenterY) / unitsPerEm,
      scaleFloor: PERCENT_FLOOR,
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

interface GlyphFeatureEntry {
  sample: GlyphGeometrySample
  complexity: number
  features: RadarFeatureValue[]
}

/** 統計分組鍵：cohort 細分比較母體，但不改變 RadarReason 對外的 key */
const featureStatKey = (feature: RadarFeatureValue) =>
  feature.cohort ? `${feature.key}@${feature.cohort}` : feature.key

/**
 * 放置類特徵：邊距與重心描述的是「字放在字身框的哪裡」，
 * 排印慣例（部件形式、間距形式）因字體而異，參考字體單獨不可信，
 * 同儕統計也會被天生特殊的字誤導。這類特徵要兩把尺同向才算異常。
 * 形狀類特徵（字面比例、墨量）在成熟字體間高度一致，參考字體可直接平移。
 */
const isPlacementFeature = (feature: RadarFeatureValue) =>
  feature.dimension === 'boundary' || feature.key.startsWith('balance:')

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const referenceResidualValue = (
  referenceData: RadarReferenceData | null | undefined,
  character: string,
  feature: RadarFeatureValue,
  unitsPerEm: number
): number | null => {
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
    const confidence = clamp01(referenceData.defaultConfidence ?? 1)
    return entry * confidence * unitScale
  }
  const confidence = clamp01(
    entry.confidence ?? referenceData.defaultConfidence ?? 1
  )
  return entry.value * confidence * unitScale
}

const shiftStat = (
  stat: RadarRobustStat,
  medianShift: number
): RadarRobustStat => ({
  ...stat,
  median: stat.median + medianShift,
  p10: stat.p10 + medianShift,
  p90: stat.p90 + medianShift,
})

const buildStrata = (glyphFeatures: GlyphFeatureEntry[]): RadarStrata => {
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
          const statKey = featureStatKey(feature)
          const values = entriesByKey.get(statKey) ?? []
          values.push({
            value: feature.value,
            character: entry.sample.character,
          })
          entriesByKey.set(statKey, values)
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

const nearestWindow = (
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

const RADAR_DIMENSIONS: RadarDimension[] = [
  'boundary',
  'proportion',
  'ink',
  'balance',
]

interface FeatureEvaluation {
  score: number
  reasons: RadarReason[]
  outlierDimensions: Set<RadarDimension>
}

const evaluateFeatures = (
  sample: GlyphGeometrySample,
  features: RadarFeatureValue[],
  complexity: number,
  strata: RadarStrata,
  referenceData: RadarReferenceData | null,
  unitsPerEm: number
): FeatureEvaluation => {
  const reasons: RadarReason[] = []
  const outlierDimensions = new Set<RadarDimension>()
  const window = nearestWindow(strata, complexity)
  if (!window) {
    return { score: 0, reasons, outlierDimensions }
  }

  // peer-mismatch 折扣：字的複雜度離視窗中心越遠，尺寸類比較越不可信
  // （延伸性：字面大小、邊距、墨量本來就隨複雜度變動），z 等比收縮。
  // balance 維度不折扣：置中與重心不隨複雜度共變，簡單字也該放對位置，
  // 且畫壞的字複雜度本身常是偏的，折扣會遮蔽它的置中錯誤。
  const complexityZ = radarZScore(complexity, window.complexityStat)
  const peerShrink =
    1 / (1 + PEER_MISMATCH_RATE * Math.max(0, Math.abs(complexityZ) - 1))

  // 同維度特徵高度共線（字面小 → 邊距/寬比/長寬比/密度全偏），
  // 每維度只取最大偏離計分，避免同一件事疊計多次
  const maxExcessByDimension = new Map<RadarDimension, number>()
  for (const feature of features) {
    const statKey = featureStatKey(feature)
    const peerStat = window.statsByKey.get(statKey)
    if (!peerStat) {
      continue
    }
    const referenceResidual = referenceResidualValue(
      referenceData,
      sample.character,
      feature,
      unitsPerEm
    )
    const floor = feature.scaleFloor ?? 0
    const placement = isPlacementFeature(feature)
    let basis: RadarBasis = 'peers'
    let stat: RadarRobustStat = peerStat
    let zScore =
      radarZScore(feature.value, peerStat, floor) *
      (feature.dimension === 'balance' ? 1 : peerShrink)
    if (referenceResidual !== null) {
      const referenceStat = shiftStat(peerStat, referenceResidual)
      const referenceZ = radarZScore(feature.value, referenceStat, floor)
      if (placement) {
        // 放置類：兩把尺同向才算異常，取偏離較小者。
        // 單一參考字體的特異排印慣例（如部件置中方式）不足以定罪，
        // 天生放置特殊的字也不因偏離同儕被誤殺。
        if (zScore * referenceZ <= 0) {
          zScore = 0
        } else if (Math.abs(referenceZ) < Math.abs(zScore)) {
          basis = 'reference'
          stat = referenceStat
          zScore = referenceZ
        }
      } else {
        // 形狀類：成熟字體間高度一致，參考結構期待值直接取代同儕
        basis = 'reference'
        stat = referenceStat
        zScore = referenceZ
      }
    }
    const excess = Math.min(Math.abs(zScore), RADAR_Z_CAP) - RADAR_REASON_Z
    if (excess > 0) {
      const previous = maxExcessByDimension.get(feature.dimension) ?? 0
      if (excess > previous) {
        maxExcessByDimension.set(feature.dimension, excess)
      }
      const peerCharacters = (window.exemplarsByKey.get(statKey) ?? []).filter(
        (character) => character !== sample.character
      )
      reasons.push({
        key: feature.key,
        label: feature.label,
        dimension: feature.dimension,
        format: feature.format,
        basis,
        value: feature.value,
        median: stat.median,
        p10: stat.p10,
        p90: stat.p90,
        zScore,
        peerCharacters: peerCharacters.length > 0 ? peerCharacters : undefined,
      })
    }
    if (Math.abs(zScore) >= RADAR_OUTLIER_Z) {
      outlierDimensions.add(feature.dimension)
    }
  }

  let score = 0
  for (const excess of maxExcessByDimension.values()) {
    score += excess * excess
  }

  reasons.sort((left, right) => Math.abs(right.zScore) - Math.abs(left.zScore))
  return { score, reasons, outlierDimensions }
}

/**
 * 以既有母體基準即時評估單一字形：編輯中的字每動一筆都會偏離快取的
 * evaluationByGlyphId，這條路徑讓 UI 拿「凍結的尺」量「正在動的筆」。
 */
export const evaluateSampleAgainstRadar = (
  sample: GlyphGeometrySample,
  radar: Pick<
    RadarAnalysis,
    'strata' | 'enclosureCharacters' | 'referenceData'
  >,
  bodyBox: { top: number; bottom: number; unitsPerEm: number }
): RadarGlyphEvaluation => {
  const unitsPerEm = bodyBox.unitsPerEm
  const bodyCenterY = (bodyBox.top + bodyBox.bottom) / 2
  const { score, reasons } = evaluateFeatures(
    sample,
    collectGlyphFeatures(
      sample,
      unitsPerEm,
      bodyCenterY,
      radar.enclosureCharacters.has(sample.character)
    ),
    glyphComplexity(sample, unitsPerEm),
    radar.strata,
    radar.referenceData,
    unitsPerEm
  )
  return {
    glyphId: sample.glyphId,
    glyphName: sample.glyphName,
    character: sample.character,
    score,
    reasons,
  }
}

/**
 * 核心：從統一取樣得到的 sample 計算離群分析。
 * sample 已含 ink，故不重複攤平、不依賴 store，可在 Worker 執行。
 */
export const computeRadarFromSamples = (
  samples: GlyphGeometrySample[],
  bodyBox: { top: number; bottom: number; unitsPerEm: number },
  semanticEnclosureChars?: ReadonlySet<string>,
  referenceData?: RadarReferenceData | null
): RadarAnalysis | null => {
  if (samples.length < MIN_RADAR_SAMPLES) {
    return null
  }

  const unitsPerEm = bodyBox.unitsPerEm
  const bodyCenterY = (bodyBox.top + bodyBox.bottom) / 2

  // 只保留母體中實際出現的包圍字，即時評分路徑用同一份分類
  const enclosureCharacters = new Set<string>()
  for (const sample of samples) {
    if (sample.character && semanticEnclosureChars?.has(sample.character)) {
      enclosureCharacters.add(sample.character)
    }
  }

  const glyphFeatures = samples.map((sample) => ({
    sample,
    complexity: glyphComplexity(sample, unitsPerEm),
    features: collectGlyphFeatures(
      sample,
      unitsPerEm,
      bodyCenterY,
      enclosureCharacters.has(sample.character)
    ),
  }))

  const strata = buildStrata(glyphFeatures)

  const evaluationByGlyphId = new Map<string, RadarGlyphEvaluation>()
  const dimensionOutliers: Record<RadarDimension, number> = {
    boundary: 0,
    proportion: 0,
    ink: 0,
    balance: 0,
  }

  for (const entry of glyphFeatures) {
    const { score, reasons, outlierDimensions } = evaluateFeatures(
      entry.sample,
      entry.features,
      entry.complexity,
      strata,
      referenceData ?? null,
      unitsPerEm
    )
    for (const dimension of outlierDimensions) {
      dimensionOutliers[dimension] += 1
    }
    evaluationByGlyphId.set(entry.sample.glyphId, {
      glyphId: entry.sample.glyphId,
      glyphName: entry.sample.glyphName,
      character: entry.sample.character,
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
    .filter((evaluation) => evaluation.score >= RADAR_SUSPECT_SCORE)
    .sort((left, right) => right.score - left.score)

  return {
    sampleCount,
    strata,
    referenceData: referenceData ?? null,
    enclosureCharacters,
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
  `${reason.label} ${formatRadarValue(reason.value, reason.format)}（同層中位 ${formatRadarValue(reason.median, reason.format)}，z ${reason.zScore.toFixed(1)}）`
