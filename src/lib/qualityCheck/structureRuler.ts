import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import type { GeometryBounds } from 'src/lib/qualityCheck/polygonGeometry'
import type { StructureBodyBox } from 'src/lib/qualityCheck/hanClassification'
import {
  buildStructureBaseline,
  type StructureBaseline,
} from 'src/lib/qualityCheck/structureMetrics'

/**
 * 固定尺字組：從 3type 報告的「框架筆畫延伸性 / 對稱性」案例抽出
 * 小而穩定的參照字。它們不是完整字表，而是拿來估計這套字自己的
 * 外框決策，避免即時提示的尺完全跟著全體母體漂移。
 */
export interface StructureRulerGroupDefinition {
  id: string
  label: string
  characters: string[]
}

export interface StructureRulerBox {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  width: number
  height: number
}

export interface StructureRulerGroup {
  id: string
  label: string
  characters: string[]
  matchedCharacters: string[]
  missingCharacters: string[]
  sampleCount: number
  box: StructureRulerBox | null
}

export interface StructureRuler {
  bodyBox: StructureBodyBox
  sampleCount: number
  matchedCharacters: string[]
  missingCharacters: string[]
  baseline: StructureBaseline | null
  groups: StructureRulerGroup[]
}

const chars = (value: string) =>
  Array.from(value.replace(/\s+/g, '')).filter(Boolean)

export const STRUCTURE_RULER_GROUPS: StructureRulerGroupDefinition[] = [
  {
    id: 'enclosure',
    label: '四面框架字',
    characters: chars('口 日 目 田 回 因 固 国 國 圖 圆 圓 圍 園 圜'),
  },
  {
    id: 'horizontal-frame',
    label: '左右框架字',
    characters: chars('日 目 自 白 由 甲 申 冒 昌 晶 胄 胃 吕'),
  },
  {
    id: 'vertical-frame',
    label: '上下框架字',
    characters: chars('一 二 三 正 王 旦 且 亘 亞 量 墨 置'),
  },
  {
    id: 'branching-range',
    label: '樹枝外伸字',
    characters: chars('永 木 米 人 大 天 井 并 兴 羊 美 義'),
  },
]

const RULER_CHARACTER_SET = new Set(
  STRUCTURE_RULER_GROUPS.flatMap((group) => group.characters)
)

const MIN_RULER_SAMPLES = 6

export const isStructureRulerCharacter = (character: string) =>
  RULER_CHARACTER_SET.has(character)

const quantile = (values: number[], q: number) => {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * q
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const weight = position - lowerIndex
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
}

const median = (values: number[]) => quantile(values, 0.5)

const buildRulerBox = (
  bounds: Array<GeometryBounds>
): StructureRulerBox | null => {
  if (bounds.length === 0) {
    return null
  }
  const xMin = median(bounds.map((box) => box.xMin))
  const xMax = median(bounds.map((box) => box.xMax))
  const yMin = median(bounds.map((box) => box.yMin))
  const yMax = median(bounds.map((box) => box.yMax))
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    width: Math.max(0, xMax - xMin),
    height: Math.max(0, yMax - yMin),
  }
}

export const buildStructureRulerSamples = (
  samples: GlyphGeometrySample[]
): GlyphGeometrySample[] => {
  const seenCharacters = new Set<string>()
  const rulerSamples: GlyphGeometrySample[] = []
  for (const sample of samples) {
    if (
      !isStructureRulerCharacter(sample.character) ||
      seenCharacters.has(sample.character)
    ) {
      continue
    }
    seenCharacters.add(sample.character)
    rulerSamples.push(sample)
  }
  return rulerSamples
}

export const buildStructureRuler = (
  samples: GlyphGeometrySample[],
  bodyBox: StructureBodyBox
): StructureRuler | null => {
  const sampleByCharacter = new Map<string, GlyphGeometrySample>()
  for (const sample of samples) {
    if (!sampleByCharacter.has(sample.character)) {
      sampleByCharacter.set(sample.character, sample)
    }
  }

  const rulerSampleByCharacter = new Map<string, GlyphGeometrySample>()
  const groups = STRUCTURE_RULER_GROUPS.map((definition) => {
    const matchedCharacters: string[] = []
    const missingCharacters: string[] = []
    const groupSamples: GlyphGeometrySample[] = []
    for (const character of definition.characters) {
      const sample = sampleByCharacter.get(character)
      if (sample) {
        matchedCharacters.push(character)
        groupSamples.push(sample)
        rulerSampleByCharacter.set(character, sample)
      } else {
        missingCharacters.push(character)
      }
    }
    return {
      id: definition.id,
      label: definition.label,
      characters: definition.characters,
      matchedCharacters,
      missingCharacters,
      sampleCount: groupSamples.length,
      box: buildRulerBox(groupSamples.map((sample) => sample.bounds)),
    }
  })

  const rulerSamples = [...rulerSampleByCharacter.values()]
  if (rulerSamples.length < MIN_RULER_SAMPLES) {
    return null
  }

  const matchedCharacters = [...rulerSampleByCharacter.keys()]
  return {
    bodyBox,
    sampleCount: rulerSamples.length,
    matchedCharacters,
    missingCharacters: [...RULER_CHARACTER_SET].filter(
      (character) => !rulerSampleByCharacter.has(character)
    ),
    baseline: buildStructureBaseline(rulerSamples, bodyBox),
    groups,
  }
}
