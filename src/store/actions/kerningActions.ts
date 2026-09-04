import type { StateCreator } from 'zustand'
import type { GlyphSelector } from '@/lib/openTypeFeatures'
import {
  buildKerningGroupMaps,
  findKerningPairIndex,
  normalizeKerningSelector,
} from '@/lib/kerning/resolveKerning'
import {
  filterAllKerningPairs,
  listAllKerningPairs,
} from '@/lib/kerning/kerningPairSets'
import type { GlobalState, KerningGroup, KerningPair } from '@/store/types'
import { markProjectDirty } from '@/store/dirtyState'

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

export type KerningOrientation = 'horizontal' | 'vertical'

// Pair edits land on the active master's set for the given orientation:
// non-default masters keep their own pairs in the by-master records,
// everything else edits the canonical set.
const resolveKerningPairsDraft = (
  state: {
    fontData: GlobalState['fontData']
    activeMasterId: GlobalState['activeMasterId']
  },
  orientation: KerningOrientation
): KerningPair[] => {
  const fontData = state.fontData!
  const masterId = state.activeMasterId
  if (orientation === 'vertical') {
    if (masterId && fontData.verticalKerningPairsByMaster?.[masterId]) {
      return fontData.verticalKerningPairsByMaster[masterId]
    }
    fontData.verticalKerningPairs ??= []
    return fontData.verticalKerningPairs
  }
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
    value: number,
    orientation: KerningOrientation = 'horizontal'
  ) =>
    set((state) => {
      if (!state.fontData) return
      if (!Number.isFinite(value)) return

      const maps = buildKerningGroupMaps(state.fontData.kerningGroups)
      const pairs = resolveKerningPairsDraft(state, orientation)
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

  deleteKerningPair: (
    left: GlyphSelector,
    right: GlyphSelector,
    orientation: KerningOrientation = 'horizontal'
  ) =>
    set((state) => {
      if (!state.fontData) return

      const maps = buildKerningGroupMaps(state.fontData.kerningGroups)
      const pairs = resolveKerningPairsDraft(state, orientation)
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
          for (const pair of listAllKerningPairs(state.fontData)) {
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
      filterAllKerningPairs(
        state.fontData,
        (pair) => !referencesGroup(pair.left) && !referencesGroup(pair.right)
      )
      markProjectDirty(state)
    }),
})

export type KerningActions = ReturnType<typeof buildKerningActions>
export type { KerningGroup }
