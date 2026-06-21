import { useCallback } from 'react'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
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

    return flushPendingDraft({
      projectId: currentDraft.projectId,
      projectTitle: currentDraft.projectTitle,
      fontData: currentDraft.fontData,
      projectQueued: persistenceQueue.projectQueued,
      uiStateQueued: persistenceQueue.uiStateQueued,
      projectUiState: createProjectUiStateSnapshot({
        selectedGlyphId,
        selectedLayerId,
        activeMasterId,
        overviewSectionId,
        overviewTopGlyphId,
        overviewGridState,
      }),
      dirtyGlyphIds,
      deletedGlyphIds,
      persistenceRevision: persistenceQueue.revision,
      glyphEditTimes,
      selectedLayerId,
      setPersistenceStatus,
      markDraftSaved,
    })
  }, [allowErrorRetry, markDraftSaved, setPersistenceStatus])
}
