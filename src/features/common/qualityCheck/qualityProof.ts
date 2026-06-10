import { buildGlyphPreviewData } from 'src/lib/glyphOverview'
import { getGlyphLayer, type FontData, type GlyphData } from 'src/store'
import { getGlyphInkMetrics } from 'src/features/common/qualityCheck/glyphGeometry'
import {
  getGlyphCodePoint,
  isHanCodePoint,
} from 'src/features/common/qualityCheck/structureMetrics'

export interface ProofShape {
  d: string
  transform?: string
}

export interface ProofGlyph {
  key: string
  character: string
  advance: number
  glyphId?: string
  glyphName?: string
  shapes: ProofShape[]
  /** 墨水面積 /（advance × UPM）：對版面灰度的貢獻 */
  inkRatio: number | null
  isSpace: boolean
  isMissing: boolean
  isHan: boolean
}

export interface ProofRun {
  glyphs: ProofGlyph[]
  totalAdvance: number
  matchedCount: number
  missingCount: number
  averageInkRatio: number | null
}

export interface GlyphInkSample {
  glyphId: string
  glyphName: string
  character: string
  /** 對版面灰度的貢獻（ink / em area） */
  inkRatio: number | null
  /** 單字黑度（ink / 真實字面框面積） */
  faceInkRatio: number | null
}

export interface GrayOutlier extends GlyphInkSample {
  /** 與整段平均灰度的差（百分比點數） */
  deviation: number
}

export interface GrayStats {
  /** 整段文字的平均灰度（版面墨量比例） */
  meanInkRatio: number | null
  stdInkRatio: number | null
  sampleCount: number
  /** 與整段灰度差異顯著的字 */
  outliers: GrayOutlier[]
}

export const mixedProofPresets = [
  '排版時 Typography 與 123 數字、英文 mixing 在同一段落，觀察大小與基線是否協調。',
  '中文字體設計 ABC abc 0123456789，標點：、。「」（）—— and the quick brown fox。',
  '版本 v1.2 於 2025/06 發布，詳見 Kumiko Font Editor 的 PR #128 與 README 文件。',
]

/** 灰度檢查用的長文章：整段排出來觀察整體明暗密度 */
export const grayArticlePresets = [
  '字體設計是一項需要長期投入的工作，設計師必須在數千個字符之間維持一致的筆畫粗細與空間節奏。當一大段文字排印出來，讀者雖然不會逐字端詳，卻能立即感受到版面的整體明暗，這種視覺密度一旦不均勻，個別過黑或過淡的字就會在閱讀時跳出來，干擾文字的連續性。因此在造字過程中，除了單字的造形之外，也要定期將完成的字混排成段落，檢查灰度是否平穩、行氣是否通順，並針對筆畫繁簡懸殊的字調整粗細與字面大小。',
  '城市的清晨總是從街角的早餐店開始，蒸籠裡冒出白色的熱氣，騎樓下人們提著公事包匆匆走過。報攤的老闆把當天的新聞攤開排好，廣播裡播著天氣預報，說午後山區可能出現短暫雷陣雨。學生們背著書包在站牌前排隊，公車進站時發出低沉的聲音，車窗上映著整條街道緩慢甦醒的樣子。這樣平凡的景色日復一日，卻構成了生活裡最安穩的節奏，也提醒著我們時間正以同樣的速度向前推進。',
  '山徑沿著溪谷蜿蜒而上，兩旁的樹影隨風搖晃，偶爾傳來幾聲鳥鳴。越往高處走，霧氣越濃，岩石上的青苔顯得格外鮮綠。同行的友人停下腳步，指著遠方雲層裂開的縫隙，陽光正好落在對面的山脊上，像一條金色的線把整片森林分成明暗兩半。我們在涼亭裡休息，喝著熱茶，聊起多年前第一次登山的情景，那些細節如今依然清晰，彷彿昨日才發生一樣。',
]

const DEFAULT_UNITS_PER_EM = 1000
const SPACE_ADVANCE_RATIO = 0.5
const MISSING_ADVANCE_RATIO = 0.6
export const DEFAULT_PROOF_CHARACTER_LIMIT = 140
export const GRAY_PROOF_CHARACTER_LIMIT = 320

export const getGlyphCharacter = (glyph: GlyphData) => {
  const codePoint = getGlyphCodePoint(glyph)
  return codePoint === null
    ? glyph.name.slice(0, 2)
    : String.fromCodePoint(codePoint)
}

const buildUnicodeGlyphMap = (fontData: FontData) => {
  const glyphByCharacter = new Map<string, GlyphData>()
  for (const glyph of Object.values(fontData.glyphs)) {
    const codePoint = getGlyphCodePoint(glyph)
    if (codePoint !== null) {
      glyphByCharacter.set(String.fromCodePoint(codePoint), glyph)
    }
  }
  return glyphByCharacter
}

const getAverage = (values: number[]) =>
  values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null

/** 確定性的偽隨機數（同一 seed 結果固定，proof 才能穩定重現） */
const createSeededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 「選取的字」模式：把指定字符多次混入隨機文章中，
 * 檢查它們的灰度是否與周圍的字不同。
 */
export const buildGrayProofText = (
  article: string,
  mixinCharacters: string[],
  options: { repeats?: number; seed?: number } = {}
) => {
  const characters = mixinCharacters.filter((character) => character.trim())
  if (characters.length === 0) {
    return article
  }

  const repeats = options.repeats ?? 3
  const random = createSeededRandom(options.seed ?? 7)
  const articleCharacters = Array.from(article)
  const requiredPrefix = characters.join('')
  const insertions: Array<{ position: number; character: string }> = []
  for (const character of characters) {
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      insertions.push({
        position: Math.floor(random() * articleCharacters.length),
        character,
      })
    }
  }
  insertions.sort((left, right) => right.position - left.position)
  for (const insertion of insertions) {
    articleCharacters.splice(insertion.position, 0, insertion.character)
  }
  return `${requiredPrefix} ${articleCharacters.join('')}`
}

/** 「選取的字」模式：把選取字符與拉丁、數字穿插成混排測試句 */
export const buildMixedProofText = (
  selectedCharacters: string[],
  baseText: string
) => {
  const characters = selectedCharacters.filter((character) => character.trim())
  if (characters.length === 0) {
    return baseText
  }

  const fillers = ['Ag', '09', 'Hk', '24', 'xp', '57']
  const segments: string[] = []
  characters.forEach((character, index) => {
    segments.push(character, fillers[index % fillers.length])
  })
  return `${segments.join('')} ${baseText}`
}

export const buildProofText = (glyphs: GlyphData[], proofText: string) => {
  const scopedCharacters = glyphs.map(getGlyphCharacter).join('')
  return scopedCharacters ? `${scopedCharacters} ${proofText}` : proofText
}

export const buildProofRun = (
  fontData: FontData | null | undefined,
  text: string,
  characterLimit = DEFAULT_PROOF_CHARACTER_LIMIT
): ProofRun => {
  const unitsPerEm = fontData?.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  const glyphByCharacter = fontData
    ? buildUnicodeGlyphMap(fontData)
    : new Map<string, GlyphData>()
  const glyphs: ProofGlyph[] = []
  let cursor = 0
  let matchedCount = 0
  let missingCount = 0
  const inkRatios: number[] = []

  for (const [index, character] of Array.from(text)
    .slice(0, characterLimit)
    .entries()) {
    const isSpace = /\s/u.test(character)
    const glyph = glyphByCharacter.get(character)
    const activeLayer = glyph
      ? (getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph)
      : null
    const advance = glyph
      ? Math.max(
          activeLayer?.metrics.width ?? glyph.metrics.width,
          unitsPerEm * 0.2
        )
      : unitsPerEm * (isSpace ? SPACE_ADVANCE_RATIO : MISSING_ADVANCE_RATIO)
    const inkRatio =
      glyph && fontData
        ? getGlyphInkMetrics(glyph, fontData.glyphs, unitsPerEm).inkToEmRatio
        : null
    if (inkRatio !== null) {
      inkRatios.push(inkRatio)
    }
    if (glyph) {
      matchedCount += 1
    } else if (!isSpace) {
      missingCount += 1
    }

    const codePoint = character.codePointAt(0)

    glyphs.push({
      key: `${index}-${character}-${cursor}`,
      character,
      advance,
      glyphId: glyph?.id,
      glyphName: glyph?.name,
      shapes:
        glyph && fontData
          ? buildGlyphPreviewData(glyph, fontData.glyphs).shapes
          : [],
      inkRatio,
      isSpace,
      isMissing: !glyph && !isSpace,
      isHan: codePoint !== undefined && isHanCodePoint(codePoint),
    })
    cursor += advance
  }

  return {
    glyphs,
    totalAdvance: Math.max(cursor, unitsPerEm),
    matchedCount,
    missingCount,
    averageInkRatio: getAverage(inkRatios),
  }
}

/**
 * 灰度統計：整段文字的平均明暗密度與離群字。
 * 灰度指「一大段文字排出來後，在視覺上形成的整體明暗密度」，
 * 因此以漢字（同為全形字身）為母體計算平均與標準差。
 */
export const buildGrayStats = (
  proofRun: ProofRun,
  fontData: FontData | null | undefined
): GrayStats => {
  const unitsPerEm = fontData?.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  const occurrenceRatios = proofRun.glyphs
    .filter(
      (proofGlyph) =>
        proofGlyph.glyphId && proofGlyph.isHan && proofGlyph.inkRatio !== null
    )
    .map((proofGlyph) => proofGlyph.inkRatio)
    .filter((ratio): ratio is number => ratio !== null)
  const uniqueSamples = new Map<string, GlyphInkSample>()
  for (const proofGlyph of proofRun.glyphs) {
    if (
      !proofGlyph.glyphId ||
      !proofGlyph.isHan ||
      proofGlyph.inkRatio === null ||
      uniqueSamples.has(proofGlyph.glyphId)
    ) {
      continue
    }
    const glyph = fontData?.glyphs[proofGlyph.glyphId]
    const faceInkRatio =
      glyph && fontData
        ? getGlyphInkMetrics(glyph, fontData.glyphs, unitsPerEm).inkToFaceRatio
        : null
    uniqueSamples.set(proofGlyph.glyphId, {
      glyphId: proofGlyph.glyphId,
      glyphName: proofGlyph.glyphName ?? proofGlyph.character,
      character: proofGlyph.character,
      inkRatio: proofGlyph.inkRatio,
      faceInkRatio,
    })
  }

  const samples = [...uniqueSamples.values()]
  const mean = getAverage(occurrenceRatios)
  if (mean === null || occurrenceRatios.length < 2) {
    return {
      meanInkRatio: mean,
      stdInkRatio: null,
      sampleCount: occurrenceRatios.length,
      outliers: [],
    }
  }

  const variance =
    occurrenceRatios.reduce((total, ratio) => total + (ratio - mean) ** 2, 0) /
    occurrenceRatios.length
  const std = Math.sqrt(variance)
  const threshold = Math.max(std * 2, 0.03)

  const outliers = samples
    .filter(
      (sample) =>
        sample.inkRatio !== null && Math.abs(sample.inkRatio - mean) > threshold
    )
    .map((sample) => ({
      ...sample,
      deviation: Math.round(((sample.inkRatio ?? 0) - mean) * 100),
    }))
    .sort((left, right) => Math.abs(right.deviation) - Math.abs(left.deviation))
    .slice(0, 16)

  return {
    meanInkRatio: mean,
    stdInkRatio: std,
    sampleCount: occurrenceRatios.length,
    outliers,
  }
}

export const buildGlyphInkSamples = (
  glyphs: GlyphData[],
  fontData: FontData | null | undefined
): GlyphInkSample[] => {
  if (!fontData) {
    return []
  }

  const unitsPerEm = fontData.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  return glyphs
    .map((glyph) => {
      const metrics = getGlyphInkMetrics(glyph, fontData.glyphs, unitsPerEm)
      return {
        glyphId: glyph.id,
        glyphName: glyph.name,
        character: getGlyphCharacter(glyph),
        inkRatio: metrics.inkToEmRatio,
        faceInkRatio: metrics.inkToFaceRatio,
      }
    })
    .sort(
      (left, right) =>
        (right.inkRatio ?? -1) - (left.inkRatio ?? -1) ||
        left.glyphName.localeCompare(right.glyphName)
    )
    .slice(0, 24)
}

export interface MixedScriptMetrics {
  hanFaceHeight: number | null
  latinCapHeight: number | null
  latinXHeight: number | null
  digitHeight: number | null
}

const measureAverageHeight = (
  fontData: FontData,
  characters: string,
  unitsPerEm: number
) => {
  const glyphByCharacter = buildUnicodeGlyphMap(fontData)
  const heights: number[] = []
  for (const character of characters) {
    const glyph = glyphByCharacter.get(character)
    if (!glyph) {
      continue
    }
    const bounds = getGlyphInkMetrics(glyph, fontData.glyphs, unitsPerEm).bounds
    if (bounds) {
      heights.push(bounds.yMax - bounds.yMin)
    }
  }
  return getAverage(heights)
}

/**
 * 混排度量：不同文字系統同段出現時，互相之間的尺寸關係。
 */
export const buildMixedScriptMetrics = (
  fontData: FontData | null | undefined
): MixedScriptMetrics => {
  if (!fontData) {
    return {
      hanFaceHeight: null,
      latinCapHeight: null,
      latinXHeight: null,
      digitHeight: null,
    }
  }

  const unitsPerEm = fontData.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  const hanCharacters = Object.values(fontData.glyphs)
    .map((glyph) => getGlyphCodePoint(glyph))
    .filter(
      (codePoint): codePoint is number =>
        codePoint !== null && isHanCodePoint(codePoint)
    )
    .slice(0, 60)
    .map((codePoint) => String.fromCodePoint(codePoint))
    .join('')

  return {
    hanFaceHeight: measureAverageHeight(fontData, hanCharacters, unitsPerEm),
    latinCapHeight: measureAverageHeight(fontData, 'HIONEM', unitsPerEm),
    latinXHeight: measureAverageHeight(fontData, 'xnoumv', unitsPerEm),
    digitHeight: measureAverageHeight(fontData, '0123456789', unitsPerEm),
  }
}
