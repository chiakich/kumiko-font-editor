import type { ResolvedFont } from 'src/lib/qualityCheck/resolvedGlyph'
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
  type RadarReferenceData,
  type RadarAnalysis,
} from 'src/lib/qualityCheck/qualityRadar'
import type { SemanticPartLayout } from 'src/lib/qualityCheck/partSpacingMetrics'

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
  semanticEnclosureChars?: ReadonlySet<string>,
  referenceData?: RadarReferenceData | null,
  partLayoutsByCharacter?: ReadonlyMap<string, SemanticPartLayout>
): PopulationAnalysis => {
  const samples = buildFontGeometrySamples(resolvedFont, partLayoutsByCharacter)
  const ruler = buildStructureRuler(samples, resolvedFont.bodyBox)
  return {
    baseline: buildStructureBaseline(samples, resolvedFont.bodyBox),
    ruler,
    radar: computeRadarFromSamples(
      samples,
      resolvedFont.bodyBox,
      semanticEnclosureChars,
      referenceData
    ),
  }
}
