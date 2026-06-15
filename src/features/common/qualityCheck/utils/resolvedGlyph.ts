import {
  getGlyphLayer,
  type FontData,
  type GlyphComponentRef,
  type PathData,
} from 'src/store'
import {
  getStructureBodyBox,
  type StructureBodyBox,
} from 'src/features/common/qualityCheck/utils/hanClassification'

/**
 * 把 store 的 GlyphData（含 layer/archive 等主執行緒狀態）解析成
 * 一份純資料的字形快照。這是品質分析「脫離 store」的關鍵邊界：
 * 解析只在主執行緒做一次，之後的幾何/取樣/統計皆為純函數，
 * 可直接搬進 Web Worker，也容易單獨測試。
 */
export interface ResolvedGlyph {
  id: string
  name: string
  unicode: string | null
  advance: number
  paths: PathData[]
  componentRefs: GlyphComponentRef[]
}

export interface ResolvedFont {
  glyphs: Record<string, ResolvedGlyph>
  bodyBox: StructureBodyBox
}

export const resolveGlyph = (
  glyph: Parameters<typeof getGlyphLayer>[0] & {
    id: string
    name: string
    unicode?: string | null
    activeLayerId?: string | null
  }
): ResolvedGlyph => {
  const layer = getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph
  return {
    id: glyph.id,
    name: glyph.name,
    unicode: glyph.unicode ?? null,
    advance: layer.metrics.width,
    paths: layer.paths,
    componentRefs: layer.componentRefs,
  }
}

export const resolveFontGlyphs = (
  fontData: FontData | null | undefined
): ResolvedFont => {
  const glyphs: Record<string, ResolvedGlyph> = {}
  if (fontData) {
    for (const glyph of Object.values(fontData.glyphs)) {
      glyphs[glyph.id] = resolveGlyph(glyph)
    }
  }
  return { glyphs, bodyBox: getStructureBodyBox(fontData) }
}
