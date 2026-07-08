import type { FontData, KerningGroup, KerningPair } from 'src/store/types'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'
import { buildKerningGroupMaps } from 'src/lib/kerning/resolveKerning'

const KERN1_PREFIX = 'public.kern1.'
const KERN2_PREFIX = 'public.kern2.'

export interface ParsedUfoKerning {
  kerningGroups: KerningGroup[]
  kerningPairs: KerningPair[]
  warnings: string[]
}

const isKerningGroupName = (name: string) =>
  name.startsWith(KERN1_PREFIX) || name.startsWith(KERN2_PREFIX)

// UFO group keys double as stable KerningGroup ids so kerning.plist references
// resolve without a rename pass.
export const parseUfoKerning = (
  groups: Record<string, unknown> | null | undefined,
  kerning: Record<string, unknown> | null | undefined
): ParsedUfoKerning => {
  const warnings: string[] = []
  const kerningGroups: KerningGroup[] = []
  const groupNames = new Set<string>()

  for (const [name, members] of Object.entries(groups ?? {})) {
    if (!isKerningGroupName(name)) continue
    if (!Array.isArray(members)) {
      warnings.push(`groups.plist: "${name}" is not an array of glyph names`)
      continue
    }

    const side = name.startsWith(KERN1_PREFIX) ? 'left' : 'right'
    const prefixLength =
      side === 'left' ? KERN1_PREFIX.length : KERN2_PREFIX.length
    kerningGroups.push({
      id: name,
      side,
      name: name.slice(prefixLength) || name,
      glyphs: members.filter(
        (member): member is string => typeof member === 'string'
      ),
    })
    groupNames.add(name)
  }

  const toSelector = (
    key: string,
    side: 'left' | 'right',
    pairLabel: string
  ): GlyphSelector => {
    if (!isKerningGroupName(key)) {
      return { kind: 'glyph', glyph: key }
    }
    const expectedPrefix = side === 'left' ? KERN1_PREFIX : KERN2_PREFIX
    if (!key.startsWith(expectedPrefix)) {
      warnings.push(
        `kerning.plist: pair ${pairLabel} uses ${key} on the ${side} side`
      )
    }
    if (!groupNames.has(key)) {
      warnings.push(
        `kerning.plist: pair ${pairLabel} references missing group ${key}`
      )
    }
    return { kind: 'class', classId: key }
  }

  const kerningPairs: KerningPair[] = []
  for (const [first, seconds] of Object.entries(kerning ?? {})) {
    if (typeof seconds !== 'object' || seconds === null) {
      warnings.push(`kerning.plist: "${first}" is not a dict`)
      continue
    }
    for (const [second, value] of Object.entries(
      seconds as Record<string, unknown>
    )) {
      const pairLabel = `${first} + ${second}`
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        warnings.push(`kerning.plist: pair ${pairLabel} has non-numeric value`)
        continue
      }
      kerningPairs.push({
        id: `ufo:${first}:${second}`,
        left: toSelector(first, 'left', pairLabel),
        right: toSelector(second, 'right', pairLabel),
        value,
      })
    }
  }

  return { kerningGroups, kerningPairs, warnings }
}

export interface SerializedUfoKerning {
  groups: Record<string, unknown>
  kerning: Record<string, Record<string, number>>
  warnings: string[]
}

const ufoGroupKey = (group: KerningGroup, usedKeys: Set<string>) => {
  const prefix = group.side === 'left' ? KERN1_PREFIX : KERN2_PREFIX
  const base =
    group.id.startsWith(prefix) && !usedKeys.has(group.id)
      ? group.id
      : `${prefix}${group.name.replace(/^@/, '') || group.id}`

  let key = base
  let counter = 2
  while (usedKeys.has(key)) {
    key = `${base}.${counter}`
    counter += 1
  }
  usedKeys.add(key)
  return key
}

// Non-kerning groups from the imported UFO are preserved; kern1/kern2 entries
// are regenerated from canonical kerning data so edits and deletions stick.
export const serializeUfoKerning = (
  fontData: Pick<FontData, 'kerningGroups' | 'kerningPairs'>,
  extras?: { groups?: Record<string, unknown> | null }
): SerializedUfoKerning => {
  const warnings: string[] = []
  const groups: Record<string, unknown> = {}

  for (const [name, members] of Object.entries(extras?.groups ?? {})) {
    if (!isKerningGroupName(name)) {
      groups[name] = members
    }
  }

  const usedKeys = new Set(Object.keys(groups))
  const keyByGroupId = new Map<string, string>()
  for (const group of fontData.kerningGroups ?? []) {
    const key = ufoGroupKey(group, usedKeys)
    keyByGroupId.set(group.id, key)
    groups[key] = [...group.glyphs]
  }

  const maps = buildKerningGroupMaps(fontData.kerningGroups)
  const selectorKey = (selector: GlyphSelector): string | null => {
    if (selector.kind === 'glyph') return selector.glyph
    const group = maps.groupByReference.get(selector.classId)
    return group ? (keyByGroupId.get(group.id) ?? null) : null
  }

  const kerning: Record<string, Record<string, number>> = {}
  for (const pair of fontData.kerningPairs ?? []) {
    const first = selectorKey(pair.left)
    const second = selectorKey(pair.right)
    if (!first || !second || !Number.isFinite(pair.value)) {
      warnings.push('kerning pair skipped: unresolved group reference')
      continue
    }
    kerning[first] = kerning[first] ?? {}
    kerning[first][second] = pair.value
  }

  return { groups, kerning, warnings }
}
