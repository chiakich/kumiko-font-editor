import {
  RADAR_OUTLIER_Z,
  formatRadarValue,
  type RadarReason,
} from 'src/features/common/qualityCheck/qualityRadar'
import {
  sideLabels,
  type StructureSide,
} from 'src/features/common/qualityCheck/structureMetrics'

/**
 * 把工程向的 RadarReason（z-score、中位數）翻譯成素人能讀的白話建議：
 * 「哪裡不對、跟大家差多少、往哪個方向調」。純函數，UI 各處共用。
 */

export type AdviceSeverity = 'notice' | 'warning'

export interface RadarAdvice {
  key: string
  severity: AdviceSeverity
  /** 一句話描述問題（白話，不含數字） */
  title: string
  /** 目前值 vs 群體常見範圍 */
  detail: string
  /** 建議的調整方向；無明確機械修法時為 null */
  action: string | null
}

const BEARING_ACTIONS: Record<StructureSide, [string, string]> = {
  // [偏多（留白過大）, 偏少（留白過小）]
  left: ['將左側筆畫往左延伸或整體左移', '將左側筆畫往內收或整體右移'],
  right: ['將右側筆畫往右延伸或整體右移', '將右側筆畫往內收或整體左移'],
  top: ['將頂部筆畫往上延伸', '將頂部筆畫往下收'],
  bottom: ['將底部筆畫往下延伸', '將底部筆畫往上收'],
}

const formatDelta = (reason: RadarReason) =>
  formatRadarValue(Math.abs(reason.value - reason.median), reason.format)

const describeBody = (
  reason: RadarReason
): Pick<RadarAdvice, 'title' | 'action'> => {
  const high = reason.zScore > 0
  const delta = formatDelta(reason)

  if (reason.key.startsWith('bearing:')) {
    const side = reason.key.split(':')[1] as StructureSide
    return {
      title: `${sideLabels[side]}留白比複雜度相近的字${high ? '多' : '少'}`,
      action: `${BEARING_ACTIONS[side][high ? 0 : 1]}約 ${delta}`,
    }
  }

  switch (reason.key) {
    case 'face:widthRatio':
      return {
        title: `以複雜度相近的字來看，字面偏${high ? '寬' : '窄'}`,
        action: `將字面寬度${high ? '收窄' : '拉寬'}約 ${delta}`,
      }
    case 'face:heightRatio':
      return {
        title: `以複雜度相近的字來看，字面偏${high ? '高' : '矮'}`,
        action: `將字面高度${high ? '壓低' : '加高'}約 ${delta}`,
      }
    case 'face:aspect':
      return {
        title: `字面比例偏${high ? '扁寬' : '瘦長'}`,
        action: null,
      }
    case 'ink:toFace':
    case 'ink:toEm':
      return {
        title: `筆畫整體偏${high ? '粗重' : '細淡'}，排版時這個字會比其他字${high ? '黑' : '淺'}`,
        action: `將筆畫${high ? '調細' : '加粗'}，讓灰度接近其他字`,
      }
    case 'ink:spreadX':
      return {
        title: `筆畫在水平方向分布偏${high ? '散' : '擠'}`,
        action: null,
      }
    case 'ink:spreadY':
      return {
        title: `筆畫在垂直方向分布偏${high ? '散' : '擠'}`,
        action: null,
      }
    case 'balance:centroidX':
      return {
        title: `視覺重心偏${high ? '右' : '左'}，字看起來會往${high ? '右' : '左'}倒`,
        action: `將整體往${high ? '左' : '右'}移，或加強${high ? '左' : '右'}半部筆畫`,
      }
    case 'balance:centroidY':
      return {
        title: `視覺重心偏${high ? '高' : '低'}，字看起來會${high ? '頭重腳輕' : '下墜'}`,
        action: `將整體往${high ? '下' : '上'}調整重量分布`,
      }
    default:
      return { title: `${reason.label}明顯偏離群體`, action: null }
  }
}

const describeRange = (reason: RadarReason) =>
  `目前 ${formatRadarValue(reason.value, reason.format)}，複雜度相近的字常見 ${formatRadarValue(reason.p10, reason.format)}–${formatRadarValue(reason.p90, reason.format)}`

export const buildRadarAdvice = (reason: RadarReason): RadarAdvice => {
  const { title, action } = describeBody(reason)
  return {
    key: reason.key,
    severity: Math.abs(reason.zScore) >= RADAR_OUTLIER_Z ? 'warning' : 'notice',
    title,
    detail: describeRange(reason),
    action,
  }
}
