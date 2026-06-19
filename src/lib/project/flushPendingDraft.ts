import { saveDraftSnapshot } from 'src/lib/project/draftSave'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import type { FontData, PersistenceStatus } from 'src/store'
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'

interface FlushPendingDraftInput {
  projectId: string
  projectTitle: string
  fontData: FontData
  projectQueued?: boolean
  uiStateQueued?: boolean
  projectUiState?: KumikoProjectUiState | null
  dirtyGlyphIds: string[]
  deletedGlyphIds: string[]
  persistenceRevision?: number
  glyphEditTimes: GlyphEditTimes
  selectedLayerId: string | null
  setPersistenceStatus: (
    status: PersistenceStatus,
    error?: string | null
  ) => void
  markDraftSaved: (
    savedDirtyIds?: string[],
    savedDeletedIds?: string[],
    savedRevision?: number
  ) => void
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export const hasPendingDraftChanges = ({
  projectQueued,
  uiStateQueued,
  dirtyGlyphIds,
  deletedGlyphIds,
}: Pick<
  FlushPendingDraftInput,
  'projectQueued' | 'uiStateQueued' | 'dirtyGlyphIds' | 'deletedGlyphIds'
>) =>
  Boolean(projectQueued) ||
  Boolean(uiStateQueued) ||
  dirtyGlyphIds.length > 0 ||
  deletedGlyphIds.length > 0

export const flushPendingDraft = async ({
  projectId,
  projectTitle,
  fontData,
  projectQueued = false,
  uiStateQueued = false,
  projectUiState = null,
  dirtyGlyphIds,
  deletedGlyphIds,
  persistenceRevision,
  glyphEditTimes,
  selectedLayerId,
  setPersistenceStatus,
  markDraftSaved,
}: FlushPendingDraftInput) => {
  if (
    !hasPendingDraftChanges({
      projectQueued,
      uiStateQueued,
      dirtyGlyphIds,
      deletedGlyphIds,
    })
  ) {
    return false
  }

  try {
    setPersistenceStatus('saving')
    await saveDraftSnapshot({
      projectId,
      projectTitle,
      fontData,
      dirtyGlyphIds,
      deletedGlyphIds,
      projectQueued,
      projectUiState,
      glyphEditTimes,
      selectedLayerId,
    })
    markDraftSaved(dirtyGlyphIds, deletedGlyphIds, persistenceRevision)
    setPersistenceStatus('saved')
    return true
  } catch (error) {
    setPersistenceStatus(
      'error',
      getErrorMessage(error, 'Unable to save project draft.')
    )
    throw error
  }
}
