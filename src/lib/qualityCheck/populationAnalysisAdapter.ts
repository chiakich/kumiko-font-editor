import type { FontData } from '@/store'
import { resolveFontGlyphs } from '@/lib/qualityCheck/resolvedGlyph'
import {
  runPopulationAnalysis,
  type PopulationAnalysis,
} from '@/lib/qualityCheck/populationAnalysis'
import type { RadarReferenceData } from '@/lib/qualityCheck/qualityRadar'

/**
 * Synchronously derive population analysis from live FontData. Keep this
 * adapter out of the worker import graph; resolveFontGlyphs is the only layer
 * that may touch store-backed glyph data.
 */
export const analyzeFontPopulation = (
  fontData: FontData | null | undefined,
  semanticEnclosureChars?: ReadonlySet<string>,
  referenceData?: RadarReferenceData | null
): PopulationAnalysis => {
  if (!fontData) {
    return { baseline: null, ruler: null, radar: null }
  }
  return runPopulationAnalysis(
    resolveFontGlyphs(fontData),
    semanticEnclosureChars,
    referenceData
  )
}
