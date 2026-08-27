import type { StateCreator } from 'zustand'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'
import {
  buildKerningGroupMaps,
  findKerningPairIndex,
  normalizeKerningSelector,
} from 'src/lib/kerning/resolveKerning'
import type { GlobalState, KerningGroup, KerningPair } from 'src/store/types'
import { markProjectDirty } from 'src/store/dirtyState'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `kern-${Date.now()}-${Math.floor(Math.random() * 1e9)}`

export interface KerningGroupDraft {
  id?: string
  side: 'left' | 'right'
  name: string
  glyphs: string[]
}

// Pair edits land on the active master's set: non-default masters keep their
// own pairs in kerningPairsByMaster, everything else edits the canonical set.
const resolveKerningPairsDraft = (state: {
  fontData: GlobalState['fontData']
  activeMasterId: GlobalState['activeMasterId']
}): KerningPair[] => {
  const fontData = state.fontData!
  const masterId = state.activeMasterId
  if (masterId && fontData.kerningPairsByMaster?.[masterId]) {
    return fontData.kerningPairsByMaster[masterId]
  }
  fontData.kerningPairs ??= []
  return fontData.kerningPairs
}

export const buildKerningActions = (set: ImmerSet) => ({
  upsertKerningPair: (
    left: GlyphSelector,
    right: GlyphSelector,
    value: number
  ) =>
    set((state) => {
      if (!state.fontData) return
      if (!Number.isFinite(value)) return

      const maps = buildKerningGroupMaps(state.fontData.kerningGroups)
      const pairs = resolveKerningPairsDraft(state)
      const index = findKerningPairIndex(pairs, left, right, maps)

      if (index >= 0) {
        pairs[index].value = value
      } else {
        pairs.push({
          id: createId(),
          left: normalizeKerningSelector(left, maps),
          right: normalizeKerningSelector(right, maps),
          value,
        })
      }
      markProjectDirty(state)
    }),

  deleteKerningPair: (left: GlyphSelector, right: GlyphSelector) =>
    set((state) => {
      if (!state.fontData) return

      const maps = buildKerningGroupMaps(state.fontData.kerningGroups)
      const pairs = resolveKerningPairsDraft(state)
      const index = findKerningPairIndex(pairs, left, right, maps)
      if (index < 0) return

      pairs.splice(index, 1)
      markProjectDirty(state)
    }),

  upsertKerningGroup: (draft: KerningGroupDraft) =>
    set((state) => {
      if (!state.fontData) return

      const name = draft.name.trim()
      if (!name) return

      const groups = state.fontData.kerningGroups ?? []
      const glyphs = [...new Set(draft.glyphs.map((g) => g.trim()))].filter(
        Boolean
      )
      const existing = draft.id
        ? groups.find((group) => group.id === draft.id)
        : undefined

      if (existing) {
        if (existing.name !== name) {
          // Pairs may reference the group by name; repoint them to the stable id.
          const oldReferences = new Set([
            existing.name,
            existing.name.startsWith('@') ? existing.name : `@${existing.name}`,
          ])
          const allPairSets = [
            state.fontData.kerningPairs ?? [],
            ...Object.values(state.fontData.kerningPairsByMaster ?? {}),
          ]
          for (const pair of allPairSets.flat()) {
            for (const side of ['left', 'right'] as const) {
              const selector = pair[side]
              if (
                selector.kind === 'class' &&
                oldReferences.has(selector.classId)
              ) {
                pair[side] = { kind: 'class', classId: existing.id }
              }
            }
          }
        }
        existing.name = name
        existing.glyphs = glyphs
      } else {
        groups.push({ id: createId(), side: draft.side, name, glyphs })
      }
      state.fontData.kerningGroups = groups
      markProjectDirty(state)
    }),

  deleteKerningGroup: (groupId: string) =>
    set((state) => {
      if (!state.fontData?.kerningGroups) return

      const group = state.fontData.kerningGroups.find(
        (item) => item.id === groupId
      )
      if (!group) return

      const references = new Set([
        group.id,
        group.name,
        group.name.startsWith('@') ? group.name : `@${group.name}`,
      ])
      const referencesGroup = (selector: GlyphSelector) =>
        selector.kind === 'class' && references.has(selector.classId)

      state.fontData.kerningGroups = state.fontData.kerningGroups.filter(
        (item) => item.id !== groupId
      )
      // Pairs pointing at a deleted group would silently stop matching.
      const withoutGroup = (pairs: KerningPair[]) =>
        pairs.filter(
          (pair) => !referencesGroup(pair.left) && !referencesGroup(pair.right)
        )
      state.fontData.kerningPairs = withoutGroup(
        state.fontData.kerningPairs ?? []
      )
      for (const [masterId, pairs] of Object.entries(
        state.fontData.kerningPairsByMaster ?? {}
      )) {
        state.fontData.kerningPairsByMaster![masterId] = withoutGroup(pairs)
      }
      markProjectDirty(state)
    }),
})

export type KerningActions = ReturnType<typeof buildKerningActions>
export type { KerningGroup }
