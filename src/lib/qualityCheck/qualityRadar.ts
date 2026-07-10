import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import type {
  PartSpacingMetrics,
  SemanticPartLayout,
} from 'src/lib/qualityCheck/partSpacingMetrics'
import {
  collectGlyphFeatures,
  featureStatKeys,
  isPlacementFeature,
} from 'src/lib/qualityCheck/radarFeatureCollection'
import {
  buildStrata,
  glyphComplexity,
  nearestWindow,
  radarZScore,
} from 'src/lib/qualityCheck/radarStatistics'
import {
  buildReferenceStyleScales,
  referenceFeatureKeyOf,
  referenceResidualValue,
  shiftStat,
} from 'src/lib/qualityCheck/radarReferenceModel'
export {
  RADAR_REFERENCE_FEATURE_KEYS,
  referenceFeatureKeyOf,
} from 'src/lib/qualityCheck/radarReferenceModel'
export {
  buildRobustStat,
  glyphComplexity,
  radarZScore,
} from 'src/lib/qualityCheck/radarStatistics'

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
  /** 主要 cohort 樣本不足時，依序退回較寬的結構比較群。 */
  fallbackCohorts?: string[]
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

export type RadarBasis = 'peers' | 'reference' | 'baseline'

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
  | 'gap:x'
  | 'gap:y'

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
  /** 目前字體相對參考字體的 residual 振幅；窄體／異形風格可自動收縮。 */
  referenceStyleScales: Partial<Record<RadarReferenceFeatureKey, number>>
  /** 風格映射後仍無法解釋的字別差異，作為 reference z-score 尺度下限。 */
  referenceStyleErrors: Partial<Record<RadarReferenceFeatureKey, number>>
  /** 母體中被 GlyphWiki 組成資料判定為包圍結構的字（即時評分路徑沿用同一分類） */
  enclosureCharacters: Set<string>
  /** 即時取樣沿用母體分析時相同的語意部件分界。 */
  partLayoutsByCharacter: Map<string, SemanticPartLayout>
  /** 編輯中的字以母體快照內同一字的介面間距作為敏感基準。 */
  partSpacingBaselineByGlyphId: Map<string, PartSpacingMetrics>
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
 * peer-mismatch 折扣強度：字的複雜度在視窗內 |z| 每超出 1 一個單位，
 * 特徵 z 分數的折扣分母加 0.5。視窗已經很局部，只需弱折扣處理
 * 排序兩端（最簡單/最複雜的一批字）視窗內仍偏斜的殘餘問題。
 */
const PEER_MISMATCH_RATE = 0.5

/** 批次同儕檢查較保守；小幅移動由編輯階段的同字 baseline 負責。 */
const PART_GAP_PEER_Z_OFFSET = 1.5
const PART_GAP_DRIFT_FLOOR = 0.004
const PART_SEPARATION_DRIFT_FLOOR = 0.002

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
  referenceStyleScales: Partial<Record<RadarReferenceFeatureKey, number>>,
  referenceStyleErrors: Partial<Record<RadarReferenceFeatureKey, number>>,
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
    const statKey = featureStatKeys(feature).find((key) =>
      window.statsByKey.has(key)
    )
    const peerStat = statKey ? window.statsByKey.get(statKey) : undefined
    if (!statKey || !peerStat) {
      continue
    }
    const referenceResidual = referenceResidualValue(
      referenceData,
      referenceStyleScales,
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
      const referenceKey = referenceFeatureKeyOf(feature.key)
      const referenceStat = shiftStat(
        peerStat,
        referenceResidual,
        referenceKey ? (referenceStyleErrors[referenceKey] ?? 0) : 0
      )
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
        // 形狀類：以 style scale 與映射誤差校正後的參考期待值取代同儕
        basis = 'reference'
        stat = referenceStat
        zScore = referenceZ
      }
    }
    if (feature.key.startsWith('part-gap:') && zScore < 0) {
      zScore = 0
    } else if (feature.key.startsWith('part-gap:')) {
      zScore = Math.max(0, zScore - PART_GAP_PEER_Z_OFFSET)
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
    | 'strata'
    | 'enclosureCharacters'
    | 'referenceData'
    | 'referenceStyleScales'
    | 'referenceStyleErrors'
  >,
  bodyBox: { top: number; bottom: number; unitsPerEm: number },
  partSpacingBaseline?: PartSpacingMetrics | null
): RadarGlyphEvaluation => {
  const unitsPerEm = bodyBox.unitsPerEm
  const bodyCenterY = (bodyBox.top + bodyBox.bottom) / 2
  const evaluation = evaluateFeatures(
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
    radar.referenceStyleScales,
    radar.referenceStyleErrors,
    unitsPerEm
  )
  let score = evaluation.score
  const reasons = [...evaluation.reasons]
  const partSpacing = sample.partSpacing
  if (
    partSpacing &&
    partSpacingBaseline &&
    partSpacing.axis === partSpacingBaseline.axis &&
    partSpacing.gapRatio >= 0 &&
    partSpacingBaseline.gapRatio >= 0
  ) {
    const gapDelta = partSpacing.gapRatio - partSpacingBaseline.gapRatio
    const separationDelta =
      partSpacing.separationRatio !== undefined &&
      partSpacingBaseline.separationRatio !== undefined
        ? partSpacing.separationRatio - partSpacingBaseline.separationRatio
        : Number.NEGATIVE_INFINITY
    const gapZ = gapDelta / PART_GAP_DRIFT_FLOOR
    const separationZ = separationDelta / PART_SEPARATION_DRIFT_FLOOR
    const usesSeparation = separationZ > gapZ
    const zScore = Math.max(gapZ, separationZ)
    if (zScore > RADAR_REASON_Z) {
      const currentValue = usesSeparation
        ? (partSpacing.separationRatio ?? partSpacing.gapRatio)
        : partSpacing.gapRatio
      const baselineValue = usesSeparation
        ? (partSpacingBaseline.separationRatio ?? partSpacingBaseline.gapRatio)
        : partSpacingBaseline.gapRatio
      const driftFloor = usesSeparation
        ? PART_SEPARATION_DRIFT_FLOOR
        : PART_GAP_DRIFT_FLOOR
      const key =
        partSpacing.axis === 'horizontal' ? 'part-gap:x' : 'part-gap:y'
      const reason: RadarReason = {
        key,
        label:
          partSpacing.axis === 'horizontal'
            ? '左右部件介面間距'
            : '上下部件介面間距',
        dimension: 'proportion',
        format: 'percent',
        basis: 'baseline',
        value: currentValue,
        median: baselineValue,
        p10: baselineValue - driftFloor,
        p90: baselineValue + driftFloor,
        zScore,
      }
      const existingIndex = reasons.findIndex((entry) => entry.key === key)
      if (existingIndex === -1) {
        reasons.push(reason)
      } else if (zScore > Math.abs(reasons[existingIndex].zScore)) {
        reasons[existingIndex] = reason
      }
      const excess = Math.min(zScore, RADAR_Z_CAP) - RADAR_REASON_Z
      score += excess * excess
    }
  }
  reasons.sort((left, right) => Math.abs(right.zScore) - Math.abs(left.zScore))
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
  const partLayoutsByCharacter = new Map<string, SemanticPartLayout>()
  const partSpacingBaselineByGlyphId = new Map<string, PartSpacingMetrics>()
  for (const sample of samples) {
    if (sample.character && semanticEnclosureChars?.has(sample.character)) {
      enclosureCharacters.add(sample.character)
    }
    if (sample.partSpacing) {
      partSpacingBaselineByGlyphId.set(sample.glyphId, sample.partSpacing)
      partLayoutsByCharacter.set(sample.character, {
        axis: sample.partSpacing.axis,
        firstCharacter: sample.partSpacing.firstCharacter,
        secondCharacter: sample.partSpacing.secondCharacter,
        splitRatio: sample.partSpacing.splitRatio,
      })
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
  const referenceStyleModel = buildReferenceStyleScales(
    glyphFeatures,
    strata,
    referenceData ?? null,
    unitsPerEm
  )

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
      referenceStyleModel.scales,
      referenceStyleModel.errors,
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
    referenceStyleScales: referenceStyleModel.scales,
    referenceStyleErrors: referenceStyleModel.errors,
    enclosureCharacters,
    partLayoutsByCharacter,
    partSpacingBaselineByGlyphId,
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
