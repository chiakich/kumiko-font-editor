import type { FontData, KerningGroup, KerningPair } from 'src/store/types'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'

// UFO lookup order: more specific pairs override class pairs.
export type KerningPairPriority =
  | 'glyph-glyph'
  | 'glyph-group'
  | 'group-glyph'
  | 'group-group'
  | 'none'

const PRIORITY_RANK: Record<Exclude<KerningPairPriority, 'none'>, number> = {
  'glyph-glyph': 0,
  'glyph-group': 1,
  'group-glyph': 2,
  'group-group': 3,
}

export interface ResolvedKerningPair {
  value: number
  priority: KerningPairPriority
  pair: KerningPair | null
  // Groups matched by the winning pair's selectors (null on the glyph side).
  leftGroup: KerningGroup | null
  rightGroup: KerningGroup | null
  // Class pair shadowed by a more specific pair, if any.
  overriddenPair: KerningPair | null
  overriddenPriority: KerningPairPriority
}

export interface KerningGroupMaps {
  // Group referenced by id, name, or "@name" — pairs from different import
  // paths use different conventions, so accept all of them.
  groupByReference: Map<string, KerningGroup>
  leftGroupByGlyph: Map<string, KerningGroup>
  rightGroupByGlyph: Map<string, KerningGroup>
}

const classReferenceKeys = (group: KerningGroup) => [
  group.id,
  group.name,
  group.name.startsWith('@') ? group.name : `@${group.name}`,
]

export function buildKerningGroupMaps(
  groups: KerningGroup[] | undefined
): KerningGroupMaps {
  const groupByReference = new Map<string, KerningGroup>()
  const leftGroupByGlyph = new Map<string, KerningGroup>()
  const rightGroupByGlyph = new Map<string, KerningGroup>()

  for (const group of groups ?? []) {
    for (const key of classReferenceKeys(group)) {
      if (!groupByReference.has(key)) {
        groupByReference.set(key, group)
      }
    }
    const byGlyph = group.side === 'left' ? leftGroupByGlyph : rightGroupByGlyph
    for (const glyphId of group.glyphs) {
      if (!byGlyph.has(glyphId)) {
        byGlyph.set(glyphId, group)
      }
    }
  }

  return { groupByReference, leftGroupByGlyph, rightGroupByGlyph }
}

export function resolveSelectorGroup(
  selector: GlyphSelector,
  maps: KerningGroupMaps
): KerningGroup | null {
  if (selector.kind !== 'class') return null
  return maps.groupByReference.get(selector.classId) ?? null
}

type SelectorMatch =
  | { kind: 'glyph' }
  | { kind: 'group'; group: KerningGroup }
  | null

function matchSelector(
  selector: GlyphSelector,
  glyphId: string,
  maps: KerningGroupMaps
): SelectorMatch {
  if (selector.kind === 'glyph') {
    return selector.glyph === glyphId ? { kind: 'glyph' } : null
  }
  const group = maps.groupByReference.get(selector.classId)
  if (!group || !group.glyphs.includes(glyphId)) return null
  return { kind: 'group', group }
}

export interface ResolveKerningOptions {
  // Skip the glyph+glyph pair, e.g. to preview the class value an exception hides.
  ignoreGlyphPair?: boolean
}

export function resolveKerningPair(
  fontData: Pick<FontData, 'kerningGroups' | 'kerningPairs'>,
  leftGlyphId: string,
  rightGlyphId: string,
  options?: ResolveKerningOptions
): ResolvedKerningPair {
  const maps = buildKerningGroupMaps(fontData.kerningGroups)

  interface Candidate {
    rank: number
    pair: KerningPair
    priority: KerningPairPriority
    leftGroup: KerningGroup | null
    rightGroup: KerningGroup | null
  }
  let best: Candidate | null = null
  let secondBest: Candidate | null = null

  for (const pair of fontData.kerningPairs ?? []) {
    const leftMatch = matchSelector(pair.left, leftGlyphId, maps)
    if (!leftMatch) continue
    const rightMatch = matchSelector(pair.right, rightGlyphId, maps)
    if (!rightMatch) continue

    const priority: KerningPairPriority =
      leftMatch.kind === 'glyph'
        ? rightMatch.kind === 'glyph'
          ? 'glyph-glyph'
          : 'glyph-group'
        : rightMatch.kind === 'glyph'
          ? 'group-glyph'
          : 'group-group'

    if (options?.ignoreGlyphPair && priority === 'glyph-glyph') continue

    const candidate = {
      rank: PRIORITY_RANK[priority],
      pair,
      priority,
      leftGroup: leftMatch.kind === 'group' ? leftMatch.group : null,
      rightGroup: rightMatch.kind === 'group' ? rightMatch.group : null,
    }
    if (!best || candidate.rank < best.rank) {
      secondBest = best
      best = candidate
    } else if (!secondBest || candidate.rank < secondBest.rank) {
      secondBest = candidate
    }
  }

  if (!best) {
    return {
      value: 0,
      priority: 'none',
      pair: null,
      leftGroup: null,
      rightGroup: null,
      overriddenPair: null,
      overriddenPriority: 'none',
    }
  }

  return {
    value: best.pair.value,
    priority: best.priority,
    pair: best.pair,
    leftGroup: best.leftGroup,
    rightGroup: best.rightGroup,
    overriddenPair:
      secondBest && secondBest.rank > best.rank ? secondBest.pair : null,
    overriddenPriority:
      secondBest && secondBest.rank > best.rank ? secondBest.priority : 'none',
  }
}

// Normalise class references to group ids so pair identity is stable.
export function normalizeKerningSelector(
  selector: GlyphSelector,
  maps: KerningGroupMaps
): GlyphSelector {
  if (selector.kind === 'glyph') return selector
  const group = maps.groupByReference.get(selector.classId)
  return group ? { kind: 'class', classId: group.id } : selector
}

export function kerningSelectorsEqual(
  a: GlyphSelector,
  b: GlyphSelector,
  maps: KerningGroupMaps
): boolean {
  const na = normalizeKerningSelector(a, maps)
  const nb = normalizeKerningSelector(b, maps)
  if (na.kind === 'glyph' && nb.kind === 'glyph') return na.glyph === nb.glyph
  if (na.kind === 'class' && nb.kind === 'class') {
    return na.classId === nb.classId
  }
  return false
}

export function findKerningPairIndex(
  pairs: KerningPair[],
  left: GlyphSelector,
  right: GlyphSelector,
  maps: KerningGroupMaps
): number {
  return pairs.findIndex(
    (pair) =>
      kerningSelectorsEqual(pair.left, left, maps) &&
      kerningSelectorsEqual(pair.right, right, maps)
  )
}

// Glyphs that belong to more than one group on the same side (invalid in UFO).
export function findDuplicateMembershipGlyphs(
  groups: KerningGroup[] | undefined,
  side: 'left' | 'right'
): Map<string, KerningGroup[]> {
  const membership = new Map<string, KerningGroup[]>()
  for (const group of groups ?? []) {
    if (group.side !== side) continue
    for (const glyphId of group.glyphs) {
      const list = membership.get(glyphId) ?? []
      list.push(group)
      membership.set(glyphId, list)
    }
  }
  return new Map(
    [...membership.entries()].filter(([, list]) => list.length > 1)
  )
}

export type KerningValidationIssueKind =
  | 'empty-group'
  | 'missing-glyph'
  | 'duplicate-membership'
  | 'missing-group-reference'

export interface KerningValidationIssue {
  kind: KerningValidationIssueKind
  message: string
  groupId?: string
  glyphId?: string
}

export function validateKerning(
  fontData: Pick<FontData, 'glyphs' | 'kerningGroups' | 'kerningPairs'>
): KerningValidationIssue[] {
  const issues: KerningValidationIssue[] = []
  const groups = fontData.kerningGroups ?? []
  const maps = buildKerningGroupMaps(groups)

  for (const group of groups) {
    if (group.glyphs.length === 0) {
      issues.push({
        kind: 'empty-group',
        message: `@${group.name.replace(/^@/, '')}`,
        groupId: group.id,
      })
    }
    for (const glyphId of group.glyphs) {
      if (!fontData.glyphs[glyphId]) {
        issues.push({
          kind: 'missing-glyph',
          message: `@${group.name.replace(/^@/, '')}: ${glyphId}`,
          groupId: group.id,
          glyphId,
        })
      }
    }
  }

  for (const side of ['left', 'right'] as const) {
    for (const [glyphId, memberships] of findDuplicateMembershipGlyphs(
      groups,
      side
    )) {
      issues.push({
        kind: 'duplicate-membership',
        message: `${glyphId}: ${memberships
          .map((group) => `@${group.name.replace(/^@/, '')}`)
          .join(', ')}`,
        glyphId,
      })
    }
  }

  for (const pair of fontData.kerningPairs ?? []) {
    for (const selector of [pair.left, pair.right]) {
      if (selector.kind === 'class' && !resolveSelectorGroup(selector, maps)) {
        issues.push({
          kind: 'missing-group-reference',
          message: selector.classId,
        })
      } else if (
        selector.kind === 'glyph' &&
        !fontData.glyphs[selector.glyph]
      ) {
        issues.push({
          kind: 'missing-glyph',
          message: selector.glyph,
          glyphId: selector.glyph,
        })
      }
    }
  }

  return issues
}

export function describeKerningSelector(
  selector: GlyphSelector,
  maps: KerningGroupMaps
): string {
  if (selector.kind === 'glyph') return selector.glyph
  const group = maps.groupByReference.get(selector.classId)
  const name = group?.name ?? selector.classId
  return name.startsWith('@') ? name : `@${name}`
}
