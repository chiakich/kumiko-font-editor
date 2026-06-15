/**
 * 漢字判定與字身框（body box）推導。這些是品質檢查各模組共用的
 * 基礎判定，與「邊界筆畫」「離群偵測」等具體分析無關，故獨立成檔。
 */

export interface UnicodeBearer {
  unicode?: string | null
}

export interface BodyBoxSource {
  unitsPerEm?: number
  lineMetricsHorizontalLayout?: {
    ascender?: { value: number }
    descender?: { value: number }
  } | null
}

export interface StructureBodyBox {
  top: number
  bottom: number
  unitsPerEm: number
}

const HAN_RANGES: Array<[number, number]> = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x3134f],
]

export const DEFAULT_UNITS_PER_EM = 1000
/** CJK 慣用字身框：UPM 1000 時約為 [-120, 880] */
const DEFAULT_ASCENDER_RATIO = 0.88

export const isHanCodePoint = (codePoint: number) =>
  HAN_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)

export const getGlyphCodePoint = (glyph: UnicodeBearer) => {
  if (!glyph.unicode) {
    return null
  }
  const parsed = Number.parseInt(glyph.unicode, 16)
  return Number.isFinite(parsed) ? parsed : null
}

export const isHanGlyph = (glyph: UnicodeBearer) => {
  const codePoint = getGlyphCodePoint(glyph)
  return codePoint !== null && isHanCodePoint(codePoint)
}

/** 取得字符顯示用文字；無碼位時回傳 fallback（通常是 glyph name） */
export const getGlyphCharacter = (
  glyph: UnicodeBearer & { name?: string },
  fallback?: string
) => {
  const codePoint = getGlyphCodePoint(glyph)
  if (codePoint !== null) {
    return String.fromCodePoint(codePoint)
  }
  return fallback ?? glyph.name ?? ''
}

export const getStructureBodyBox = (
  source: BodyBoxSource | null | undefined
): StructureBodyBox => {
  const unitsPerEm = source?.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  const ascender = source?.lineMetricsHorizontalLayout?.ascender?.value
  const descender = source?.lineMetricsHorizontalLayout?.descender?.value
  const top =
    typeof ascender === 'number' && Number.isFinite(ascender) && ascender > 0
      ? ascender
      : Math.round(unitsPerEm * DEFAULT_ASCENDER_RATIO)
  const bottom =
    typeof descender === 'number' &&
    Number.isFinite(descender) &&
    descender <= 0
      ? descender
      : top - unitsPerEm
  return { top, bottom, unitsPerEm }
}
