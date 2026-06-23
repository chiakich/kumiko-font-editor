import { useCallback } from 'react'
import { buildCurrentDraftFlushInput } from 'src/lib/project/currentDraftFlush'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { useStore, type FontData, type PersistenceStatus } from 'src/store'

interface FlushCurrentDraftOptions {
  allowErrorRetry?: boolean
}

interface CurrentDraftFlushState {
  projectId: string | null
  projectTitle: string
  fontData: FontData | null
  persistenceStatus: PersistenceStatus
}

interface FlushableCurrentDraftState extends CurrentDraftFlushState {
  projectId: string
  fontData: FontData
}

export const canFlushCurrentDraft = (
  state: CurrentDraftFlushState,
  options: FlushCurrentDraftOptions = {}
): state is FlushableCurrentDraftState =>
  Boolean(state.projectId) &&
  Boolean(state.projectTitle) &&
  Boolean(state.fontData) &&
  (state.persistenceStatus !== 'error' || options.allowErrorRetry === true)

export const useFlushCurrentDraft = (
  options: FlushCurrentDraftOptions = {}
) => {
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const allowErrorRetry = options.allowErrorRetry === true

  return useCallback(async () => {
    const {
      projectId,
      projectTitle,
      fontData,
      persistenceStatus,
      persistenceQueue,
      dirtyGlyphIds,
      deletedGlyphIds,
      glyphEditTimes,
      selectedLayerId,
      selectedGlyphId,
      activeMasterId,
      editLocation,
      overviewSectionId,
      overviewTopGlyphId,
      overviewGridState,
    } = useStore.getState()

    const currentDraft = {
      projectId,
      projectTitle,
      fontData,
      persistenceStatus,
    }

    if (!canFlushCurrentDraft(currentDraft, { allowErrorRetry })) {
      return false
    }

    return flushPendingDraft(
      buildCurrentDraftFlushInput({
        activeMasterId,
        deletedGlyphIds,
        dirtyGlyphIds,
        editLocation,
        fontData: currentDraft.fontData,
        glyphEditTimes,
        markDraftSaved,
        overviewGridState,
        overviewSectionId,
        overviewTopGlyphId,
        persistenceQueue,
        projectId: currentDraft.projectId,
        projectTitle: currentDraft.projectTitle,
        selectedGlyphId,
        selectedLayerId,
        setPersistenceStatus,
      })
    )
  }, [allowErrorRetry, markDraftSaved, setPersistenceStatus])
}
