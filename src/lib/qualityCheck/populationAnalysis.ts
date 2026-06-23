import type { FontData } from 'src/store'
import type { ResolvedFont } from 'src/lib/qualityCheck/resolvedGlyph'
import { resolveFontGlyphs } from 'src/lib/qualityCheck/resolvedGlyph'
import { buildFontGeometrySamples } from 'src/lib/qualityCheck/glyphSampling'
import {
  buildStructureBaseline,
  type StructureBaseline,
} from 'src/lib/qualityCheck/structureMetrics'
import {
  buildStructureRuler,
  type StructureRuler,
} from 'src/lib/qualityCheck/structureRuler'
import {
  computeRadarFromSamples,
  type RadarAnalysis,
} from 'src/lib/qualityCheck/qualityRadar'

/**
 * 母體分析：整套字體唯一的重計算點。一次 flatten 取樣後，
 * 結構基準與離群偵測共用同一組 sample。純函數、不依賴 store，
 * 是 Worker 的執行單元。
 */
export interface PopulationAnalysis {
  baseline: StructureBaseline | null
  ruler: StructureRuler | null
  radar: RadarAnalysis | null
}

export const runPopulationAnalysis = (
  resolvedFont: ResolvedFont,
  semanticEnclosureChars?: ReadonlySet<string>
): PopulationAnalysis => {
  const samples = buildFontGeometrySamples(resolvedFont)
  const ruler = buildStructureRuler(samples, resolvedFont.bodyBox)
  return {
    baseline: buildStructureBaseline(samples, resolvedFont.bodyBox),
    ruler,
    radar: computeRadarFromSamples(
      samples,
      resolvedFont.bodyBox,
      semanticEnclosureChars
    ),
  }
}

/**
 * Synchronously derive population analysis from live FontData. Useful for small
 * fonts, tests, and fallback paths where the worker is not involved.
 */
export const analyzeFontPopulation = (
  fontData: FontData | null | undefined,
  semanticEnclosureChars?: ReadonlySet<string>
): PopulationAnalysis => {
  if (!fontData) {
    return { baseline: null, ruler: null, radar: null }
  }
  return runPopulationAnalysis(
    resolveFontGlyphs(fontData),
    semanticEnclosureChars
  )
}
