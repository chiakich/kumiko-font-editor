import {
  getGlyphwikiCompositionMap,
  type GlyphwikiPartPlacement,
} from 'src/lib/glyph/glyphwikiComposition'

/**
 * 語意結構分類：從 GlyphWiki 組成資料判斷「全包圍/門框」字。
 * 幾何 framing 分型是從使用者畫出的輪廓推斷的，字畫壞時分型可能
 * 跟著跑掉、把字分進錯的比較群組而遮蔽錯誤；組成資料則是與繪製
 * 無關的 ground truth。但資料只涵蓋可分解字（日/田/回 等原子字
 * 與部分簡化字缺席），故只作為 override，查不到的字仍走幾何分型。
 */

/** 全包圍/門框部件：作為直接部件且框住大半畫布時，整字視為包圍結構 */
const ENCLOSURE_PART_CHARS = new Set(['囗', '門', '鬥'])
/** 部件框需覆蓋畫布兩軸各 60%，排除包圍部件只當普通部件用的情況 */
const ENCLOSURE_COVERAGE = 0.6
/** GlyphWiki 設計畫布邊長 */
const GLYPHWIKI_CANVAS = 200

export const buildEnclosureCharacterSet = (
  compositionMap: ReadonlyMap<string, GlyphwikiPartPlacement[]>
): Set<string> => {
  const minSpan = GLYPHWIKI_CANVAS * ENCLOSURE_COVERAGE
  const result = new Set<string>()
  for (const [target, parts] of compositionMap) {
    const enclosed = parts.some(
      (part) =>
        ENCLOSURE_PART_CHARS.has(part.char) &&
        part.box.x2 - part.box.x1 >= minSpan &&
        part.box.y2 - part.box.y1 >= minSpan
    )
    if (enclosed) {
      result.add(target)
    }
  }
  return result
}

let enclosureSetPromise: Promise<ReadonlySet<string>> | null = null

/**
 * 載入失敗回空集合（品質分析照常跑、只是少了語意 override），
 * 並允許下次呼叫重試。
 */
export const getEnclosureCharacterSet = (): Promise<ReadonlySet<string>> => {
  if (!enclosureSetPromise) {
    enclosureSetPromise = getGlyphwikiCompositionMap()
      .then(buildEnclosureCharacterSet)
      .catch(() => {
        enclosureSetPromise = null
        return new Set<string>()
      })
  }
  return enclosureSetPromise
}
