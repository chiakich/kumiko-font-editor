import type { FontData } from '@/domain'
import type {
  LookupRecord,
  OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures'

export interface TextGlyphRun {
  glyphId: string
  sourceGlyphIds: string[]
  sourceStartIndex: number
  sourceLength: number
}

interface LigatureCandidate {
  components: string[]
  replacement: string
  order: number
}

const COMBINATION_FEATURE_TAGS = new Set([
  'liga',
  'dlig',
  'rlig',
  'frac',
  'numr',
  'dnom',
])

export function shapeGlyphRuns(fontData: FontData, glyphIds: string[]) {
  const candidates = getLigatureCandidates(fontData)
  const runs: TextGlyphRun[] = []
  let index = 0

  while (index < glyphIds.length) {
    const match = findLigatureMatch(fontData, glyphIds, index, candidates)
    if (match) {
      runs.push({
        glyphId: match.replacement,
        sourceGlyphIds: glyphIds.slice(index, index + match.components.length),
        sourceStartIndex: index,
        sourceLength: match.components.length,
      })
      index += match.components.length
      continue
    }

    runs.push({
      glyphId: glyphIds[index],
      sourceGlyphIds: [glyphIds[index]],
      sourceStartIndex: index,
      sourceLength: 1,
    })
    index += 1
  }

  return runs
}

function getLigatureCandidates(fontData: FontData) {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  return getCombinationLookupIds(state)
    .flatMap((lookupId, order) =>
      getLookupLigatureCandidates(lookupById.get(lookupId), order)
    )
    .sort(
      (a, b) => b.components.length - a.components.length || a.order - b.order
    )
}

function getCombinationLookupIds(state: OpenTypeFeaturesState) {
  return state.features
    .filter(
      (feature) => feature.isActive && COMBINATION_FEATURE_TAGS.has(feature.tag)
    )
    .flatMap((feature) => feature.entries.flatMap((entry) => entry.lookupIds))
}

function getLookupLigatureCandidates(
  lookup: LookupRecord | undefined,
  order: number
) {
  if (lookup?.table !== 'GSUB' || lookup.lookupType !== 'ligatureSubst') {
    return []
  }

  return lookup.rules.flatMap((rule): LigatureCandidate[] => {
    if (rule.kind !== 'ligatureSubstitution') return []
    return [
      {
        components: rule.components,
        replacement: rule.replacement,
        order,
      },
    ]
  })
}

function findLigatureMatch(
  fontData: FontData,
  glyphIds: string[],
  index: number,
  candidates: LigatureCandidate[]
) {
  return candidates.find((candidate) => {
    if (!fontData.glyphs[candidate.replacement]) return false
    return candidate.components.every(
      (component, offset) => glyphIds[index + offset] === component
    )
  })
}
