import type { StructureGuideModel } from 'src/canvas'
import type { GlyphGeometrySample } from 'src/features/common/qualityCheck/glyphSampling'
import {
  STRUCTURE_SIDES,
  type StructureBaseline,
} from 'src/features/common/qualityCheck/structureMetrics'

/** 把單字 sample + 母體基準轉成畫布圖層要的分布帶模型（glyph-local 座標）。 */
export const buildStructureGuideModel = (
  sample: GlyphGeometrySample,
  baseline: StructureBaseline
): StructureGuideModel => {
  const sides = {} as StructureGuideModel['sides']
  for (const side of STRUCTURE_SIDES) {
    const sideSample = sample.sides[side]
    // 帶子取「這個字此邊的筆畫類型」對應的分布：框架字比框架帶、樹枝字比樹枝帶
    const distribution = baseline.sides[side][sideSample.type]
    sides[side] = {
      bearing: sideSample.bearing,
      isFraming: sideSample.type === 'framing',
      band: distribution
        ? {
            p10: distribution.p10,
            p90: distribution.p90,
            mode: distribution.mode,
          }
        : null,
    }
  }
  return {
    advance: sample.advance,
    bodyTop: baseline.bodyBox.top,
    bodyBottom: baseline.bodyBox.bottom,
    sides,
  }
}
