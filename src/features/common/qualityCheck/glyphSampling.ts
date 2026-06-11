import {
  computeInkFromPolygons,
  flattenResolvedGlyph,
  type GlyphInkMetrics,
} from 'src/features/common/qualityCheck/glyphInk'
import {
  getPolygonsBounds,
  type GeometryBounds,
} from 'src/features/common/qualityCheck/polygonGeometry'
import {
  buildSidesFromPolygons,
  type StructureSides,
} from 'src/features/common/qualityCheck/structureMetrics'
import {
  getGlyphCharacter,
  isHanGlyph,
  type StructureBodyBox,
} from 'src/features/common/qualityCheck/hanClassification'
import type {
  ResolvedFont,
  ResolvedGlyph,
} from 'src/features/common/qualityCheck/resolvedGlyph'

/**
 * 母體統計分析的單一特徵來源：每個字形「攤平一次」即同時得到
 * 邊界筆畫分類與墨水度量，供結構基準與離群偵測共用，
 * 避免各分析器各自重複攤平。純函數，可在 Worker 執行。
 */
export interface GlyphGeometrySample {
  glyphId: string
  glyphName: string
  character: string
  advance: number
  bounds: GeometryBounds
  sides: StructureSides
  ink: GlyphInkMetrics
}

export const buildGlyphGeometrySample = (
  glyph: ResolvedGlyph,
  glyphs: Record<string, ResolvedGlyph>,
  bodyBox: StructureBodyBox
): GlyphGeometrySample | null => {
  const polygons = flattenResolvedGlyph(glyph, glyphs)
  const bounds = getPolygonsBounds(polygons)
  if (!bounds) {
    return null
  }
  return {
    glyphId: glyph.id,
    glyphName: glyph.name,
    character: getGlyphCharacter(glyph),
    advance: glyph.advance,
    bounds,
    sides: buildSidesFromPolygons(polygons, bounds, glyph.advance, bodyBox),
    ink: computeInkFromPolygons(polygons, glyph.advance, bodyBox.unitsPerEm),
  }
}

export const buildFontGeometrySamples = (
  resolvedFont: ResolvedFont
): GlyphGeometrySample[] => {
  const samples: GlyphGeometrySample[] = []
  for (const glyph of Object.values(resolvedFont.glyphs)) {
    if (!isHanGlyph(glyph)) {
      continue
    }
    const sample = buildGlyphGeometrySample(
      glyph,
      resolvedFont.glyphs,
      resolvedFont.bodyBox
    )
    if (sample) {
      samples.push(sample)
    }
  }
  return samples
}
