import type { FontData } from 'src/store'
import {
  resolveFontGlyphs,
  type ResolvedFont,
} from 'src/features/common/qualityCheck/resolvedGlyph'
import { buildFontGeometrySamples } from 'src/features/common/qualityCheck/glyphSampling'
import {
  buildStructureBaseline,
  type StructureBaseline,
} from 'src/features/common/qualityCheck/structureMetrics'
import {
  computeRadarFromSamples,
  type RadarAnalysis,
} from 'src/features/common/qualityCheck/qualityRadar'

/**
 * 母體分析：整套字體唯一的重計算點。一次 flatten 取樣後，
 * 結構基準與離群偵測共用同一組 sample。純函數、不依賴 store，
 * 是 Worker 的執行單元。
 */
export interface PopulationAnalysis {
  baseline: StructureBaseline | null
  radar: RadarAnalysis | null
}

export const runPopulationAnalysis = (
  resolvedFont: ResolvedFont
): PopulationAnalysis => {
  const samples = buildFontGeometrySamples(resolvedFont)
  return {
    baseline: buildStructureBaseline(samples, resolvedFont.bodyBox),
    radar: computeRadarFromSamples(samples, resolvedFont.bodyBox),
  }
}

/** 主執行緒便利函數：同步從 FontData 算出母體分析（小字體或測試用）。 */
export const analyzeFontPopulation = (
  fontData: FontData | null | undefined
): PopulationAnalysis => {
  if (!fontData) {
    return { baseline: null, radar: null }
  }
  return runPopulationAnalysis(resolveFontGlyphs(fontData))
}
