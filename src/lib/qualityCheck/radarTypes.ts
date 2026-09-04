export type RadarDimension = 'boundary' | 'proportion' | 'ink' | 'balance'

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
