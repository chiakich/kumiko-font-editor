/**
 * Typography behavior actions bridge glyph-centric UI edits back into the
 * canonical OpenType feature IR.
 */
import type { StateCreator } from 'zustand'
import {
  canCommitAlternateBehavior,
  canCommitAnchorBehavior,
  canCommitCombinationBehavior,
  canCommitContextualBehavior,
  canCommitSpacingBehavior,
  createEmptyOpenTypeFeaturesState,
  deleteAlternateBehavior,
  deleteAnchorBehavior,
  deleteCombinationBehavior,
  deleteContextualBehavior,
  deleteSpacingBehavior,
  makeEditableGlyphCopy,
  makeCompositeGlyphFromComponents,
  parseCombinationInput,
  upsertAlternateBehavior,
  upsertAnchorBehavior,
  upsertCombinationBehavior,
  upsertContextualBehavior,
  upsertSpacingBehavior,
  type AlternateBehaviorDraft,
  type AnchorBehaviorDraft,
  type CombinationBehaviorDraft,
  type ContextualBehaviorDraft,
  type SpacingBehaviorDraft,
} from 'src/lib/openTypeFeatures'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import type { GlobalState } from 'src/store/types'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

export const buildBehaviorActions = (set: ImmerSet) => ({
  upsertCombinationBehavior: (draft: CombinationBehaviorDraft) =>
    set((state) => {
      if (!state.fontData) return
      if (!canCommitCombinationBehavior(draft)) return

      const currentFeatures =
        state.fontData.openTypeFeatures ?? createEmptyOpenTypeFeaturesState()
      state.fontData.openTypeFeatures = upsertCombinationBehavior(
        currentFeatures,
        draft
      )

      const outputGlyphId = draft.output.trim()
      const components = parseCombinationInput(draft.input)
      const compositeGlyph = makeCompositeGlyphFromComponents(
        state.fontData,
        outputGlyphId,
        components
      )

      if (compositeGlyph) {
        state.fontData.glyphs[outputGlyphId] = compositeGlyph
        if (
          state.fontData.glyphOrder &&
          !state.fontData.glyphOrder.includes(outputGlyphId)
        ) {
          state.fontData.glyphOrder = [
            ...state.fontData.glyphOrder,
            outputGlyphId,
          ]
        }
        markGlyphDirty(state, outputGlyphId)
        syncFilteredGlyphList(state)
      }

      state.isDirty = true
      state.hasLocalChanges = true
    }),

  upsertAlternateBehavior: (draft: AlternateBehaviorDraft) =>
    set((state) => {
      if (!state.fontData) return
      if (!canCommitAlternateBehavior(draft)) return

      const currentFeatures =
        state.fontData.openTypeFeatures ?? createEmptyOpenTypeFeaturesState()
      state.fontData.openTypeFeatures = upsertAlternateBehavior(
        currentFeatures,
        draft
      )

      const alternateGlyphId = draft.alternate.trim()
      const sourceGlyphId = draft.source.trim()
      const alternateGlyph = makeEditableGlyphCopy(
        state.fontData,
        alternateGlyphId,
        sourceGlyphId
      )

      if (alternateGlyph) {
        state.fontData.glyphs[alternateGlyphId] = alternateGlyph
        if (
          state.fontData.glyphOrder &&
          !state.fontData.glyphOrder.includes(alternateGlyphId)
        ) {
          state.fontData.glyphOrder = [
            ...state.fontData.glyphOrder,
            alternateGlyphId,
          ]
        }
        markGlyphDirty(state, alternateGlyphId)
        syncFilteredGlyphList(state)
      }

      state.isDirty = true
      state.hasLocalChanges = true
    }),

  deleteCombinationBehavior: (lookupId: string, ruleId: string) =>
    set((state) => {
      if (!state.fontData?.openTypeFeatures) return

      state.fontData.openTypeFeatures = deleteCombinationBehavior(
        state.fontData.openTypeFeatures,
        { lookupId, ruleId }
      )
      state.isDirty = true
      state.hasLocalChanges = true
    }),

  deleteAlternateBehavior: (
    lookupId: string,
    ruleId: string,
    alternate: string
  ) =>
    set((state) => {
      if (!state.fontData?.openTypeFeatures) return

      state.fontData.openTypeFeatures = deleteAlternateBehavior(
        state.fontData.openTypeFeatures,
        { lookupId, ruleId, alternate }
      )
      state.isDirty = true
      state.hasLocalChanges = true
    }),

  upsertSpacingBehavior: (draft: SpacingBehaviorDraft) =>
    set((state) => {
      if (!state.fontData) return
      if (!canCommitSpacingBehavior(draft)) return

      const currentFeatures =
        state.fontData.openTypeFeatures ?? createEmptyOpenTypeFeaturesState()
      state.fontData.openTypeFeatures = upsertSpacingBehavior(
        currentFeatures,
        draft
      )
      state.isDirty = true
      state.hasLocalChanges = true
    }),

  deleteSpacingBehavior: (lookupId: string, ruleId: string) =>
    set((state) => {
      if (!state.fontData?.openTypeFeatures) return

      state.fontData.openTypeFeatures = deleteSpacingBehavior(
        state.fontData.openTypeFeatures,
        { lookupId, ruleId }
      )
      state.isDirty = true
      state.hasLocalChanges = true
    }),

  upsertContextualBehavior: (draft: ContextualBehaviorDraft) =>
    set((state) => {
      if (!state.fontData) return
      if (!canCommitContextualBehavior(draft)) return

      const currentFeatures =
        state.fontData.openTypeFeatures ?? createEmptyOpenTypeFeaturesState()
      state.fontData.openTypeFeatures = upsertContextualBehavior(
        currentFeatures,
        draft
      )
      state.isDirty = true
      state.hasLocalChanges = true
    }),

  deleteContextualBehavior: (lookupId: string, ruleId: string) =>
    set((state) => {
      if (!state.fontData?.openTypeFeatures) return

      state.fontData.openTypeFeatures = deleteContextualBehavior(
        state.fontData.openTypeFeatures,
        { lookupId, ruleId }
      )
      state.isDirty = true
      state.hasLocalChanges = true
    }),

  upsertAnchorBehavior: (draft: AnchorBehaviorDraft) =>
    set((state) => {
      if (!state.fontData) return
      if (!canCommitAnchorBehavior(draft)) return

      state.fontData = upsertAnchorBehavior(state.fontData, draft)
      markGlyphDirty(state, draft.glyphId)
      state.isDirty = true
      state.hasLocalChanges = true
    }),

  deleteAnchorBehavior: (glyphId: string, anchorId: string) =>
    set((state) => {
      if (!state.fontData) return

      state.fontData = deleteAnchorBehavior(state.fontData, glyphId, anchorId)
      markGlyphDirty(state, glyphId)
      state.isDirty = true
      state.hasLocalChanges = true
    }),
})

function markGlyphDirty(state: GlobalState, glyphId: string) {
  const editedAt = Date.now()
  state.glyphEditTimes[glyphId] = editedAt
  if (!state.dirtyGlyphIds.includes(glyphId)) {
    state.dirtyGlyphIds.push(glyphId)
  }
  if (!state.localDirtyGlyphIds.includes(glyphId)) {
    state.localDirtyGlyphIds.push(glyphId)
  }
  state.deletedGlyphIds = state.deletedGlyphIds.filter((id) => id !== glyphId)
  state.localDeletedGlyphIds = state.localDeletedGlyphIds.filter(
    (id) => id !== glyphId
  )
}
