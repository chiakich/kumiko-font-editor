import { toaster } from '@/components/ui/toaster'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { useStore } from 'src/store'

export function useCloseProjectWithDraftSave() {
  const { t } = useTranslation()
  const closeProjectState = useStore((state) => state.closeProjectState)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const persistenceStatus = useStore((state) => state.persistenceStatus)
  const isDirty = useStore((state) => state.isDirty)
  const projectId = useStore((state) => state.projectId)
  const projectTitle = useStore((state) => state.projectTitle)
  const fontData = useStore((state) => state.fontData)
  const dirtyGlyphIds = useStore((state) => state.dirtyGlyphIds)
  const deletedGlyphIds = useStore((state) => state.deletedGlyphIds)
  const persistenceQueue = useStore((state) => state.persistenceQueue)
  const glyphEditTimes = useStore((state) => state.glyphEditTimes)
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const editLocation = useStore((state) => state.editLocation)
  const overviewSectionId = useStore((state) => state.overviewSectionId)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const overviewGridState = useStore((state) => state.overviewGridState)
  const [isClosingProject, setIsClosingProject] = useState(false)

  const closeProject = useCallback(async () => {
    if (isClosingProject) {
      return
    }

    if (!isDirty) {
      closeProjectState()
      return
    }

    if (!fontData || !projectId || !projectTitle) {
      closeProjectState()
      return
    }

    if (persistenceStatus === 'error') {
      toaster.create({
        title: t('fontOverview.closeProjectSaveFailed'),
        description:
          'This project has a pending save conflict. Reload or resolve it before closing.',
        type: 'warning',
        duration: 3200,
        closable: true,
      })
      return
    }

    setIsClosingProject(true)
    try {
      await flushPendingDraft({
        projectId,
        projectTitle,
        fontData,
        projectQueued: persistenceQueue.projectQueued,
        uiStateQueued: persistenceQueue.uiStateQueued,
        projectUiState: createProjectUiStateSnapshot({
          selectedGlyphId,
          selectedLayerId,
          activeMasterId,
          editLocation,
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
      closeProjectState()
    } catch (error) {
      console.warn('Save before closing project failed.', error)
      toaster.create({
        title: t('fontOverview.closeProjectSaveFailed'),
        description: t('fontOverview.closeProjectSaveFailedDescription'),
        type: 'error',
        duration: 3200,
        closable: true,
      })
    } finally {
      setIsClosingProject(false)
    }
  }, [
    closeProjectState,
    deletedGlyphIds,
    dirtyGlyphIds,
    editLocation,
    fontData,
    glyphEditTimes,
    isClosingProject,
    isDirty,
    markDraftSaved,
    activeMasterId,
    overviewGridState,
    overviewSectionId,
    overviewTopGlyphId,
    persistenceStatus,
    persistenceQueue.projectQueued,
    persistenceQueue.revision,
    persistenceQueue.uiStateQueued,
    projectId,
    projectTitle,
    selectedGlyphId,
    selectedLayerId,
    setPersistenceStatus,
    t,
  ])

  return { closeProject, isClosingProject }
}
