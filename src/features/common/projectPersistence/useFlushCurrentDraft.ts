import { useCallback } from 'react'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { useStore } from 'src/store'

export const useFlushCurrentDraft = () => {
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)

  return useCallback(async () => {
    const {
      projectId,
      projectTitle,
      fontData,
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

    if (!projectId || !projectTitle || !fontData) {
      return false
    }

    return flushPendingDraft({
      projectId,
      projectTitle,
      fontData,
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
  }, [markDraftSaved, setPersistenceStatus])
}
