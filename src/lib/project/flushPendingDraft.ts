import {
  saveDraftSnapshotInWorker,
  saveProjectUiStateInWorker,
} from 'src/lib/project/draftSaveWorkerClient'
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

const projectFlushChains = new Map<string, Promise<unknown>>()

export const createDraftPersistenceFontDataSnapshot = (
  fontData: FontData,
  dirtyGlyphIds: readonly string[]
): FontData => {
  const glyphs: FontData['glyphs'] = {}
  for (const glyphId of new Set(dirtyGlyphIds)) {
    const glyph = fontData.glyphs[glyphId]
    if (glyph) {
      glyphs[glyphId] = glyph
    }
  }
  return {
    ...fontData,
    glyphOrder: fontData.glyphOrder ?? Object.keys(fontData.glyphs),
    glyphs,
  }
}

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

const flushPendingDraftNow = async ({
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
    if (
      uiStateQueued &&
      !projectQueued &&
      dirtyGlyphIds.length === 0 &&
      deletedGlyphIds.length === 0
    ) {
      await saveProjectUiStateInWorker({ projectId, projectUiState })
    } else {
      await saveDraftSnapshotInWorker({
        projectId,
        projectTitle,
        fontData: createDraftPersistenceFontDataSnapshot(
          fontData,
          dirtyGlyphIds
        ),
        dirtyGlyphIds,
        deletedGlyphIds,
        projectQueued,
        projectUiState,
        glyphEditTimes,
        selectedLayerId,
      })
    }
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

export const flushPendingDraft = async (input: FlushPendingDraftInput) => {
  const previous = projectFlushChains.get(input.projectId)
  const current = (async () => {
    await previous?.catch(() => {})
    return flushPendingDraftNow(input)
  })()
  projectFlushChains.set(input.projectId, current)

  try {
    return await current
  } finally {
    if (projectFlushChains.get(input.projectId) === current) {
      projectFlushChains.delete(input.projectId)
    }
  }
}
