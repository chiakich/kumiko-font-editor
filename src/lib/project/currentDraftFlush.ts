import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import type { FlushPendingDraftInput } from 'src/lib/project/flushPendingDraft'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import type { FontData, GlobalState, PersistenceQueueState } from 'src/store'

interface BuildCurrentDraftFlushInputOptions {
  activeMasterId: string | null
  deletedGlyphIds: string[]
  dirtyGlyphIds: string[]
  fontData: FontData
  glyphEditTimes: GlyphEditTimes
  markDraftSaved: FlushPendingDraftInput['markDraftSaved']
  overviewCustomFilters: GlobalState['overviewCustomFilters']
  overviewGridState: unknown | null
  overviewSectionId: string
  overviewTopGlyphId: string | null
  persistenceQueue: PersistenceQueueState
  projectId: string
  projectTitle: string
  selectedGlyphId: string | null
  selectedLayerId: string | null
  setPersistenceStatus: FlushPendingDraftInput['setPersistenceStatus']
}

export type CurrentDraftFlushState = Pick<
  GlobalState,
  | 'activeMasterId'
  | 'deletedGlyphIds'
  | 'dirtyGlyphIds'
  | 'fontData'
  | 'glyphEditTimes'
  | 'overviewCustomFilters'
  | 'overviewGridState'
  | 'overviewSectionId'
  | 'overviewTopGlyphId'
  | 'persistenceQueue'
  | 'projectId'
  | 'projectTitle'
  | 'selectedGlyphId'
  | 'selectedLayerId'
>

export const buildCurrentDraftFlushInput = ({
  activeMasterId,
  deletedGlyphIds,
  dirtyGlyphIds,
  fontData,
  glyphEditTimes,
  markDraftSaved,
  overviewCustomFilters,
  overviewGridState,
  overviewSectionId,
  overviewTopGlyphId,
  persistenceQueue,
  projectId,
  projectTitle,
  selectedGlyphId,
  selectedLayerId,
  setPersistenceStatus,
}: BuildCurrentDraftFlushInputOptions): FlushPendingDraftInput => ({
  projectId,
  projectTitle,
  fontData,
  projectQueued: persistenceQueue.projectQueued,
  uiStateQueued: persistenceQueue.uiStateQueued,
  projectUiState: createProjectUiStateSnapshot({
    selectedGlyphId,
    selectedLayerId,
    activeMasterId,
    overviewCustomFilters,
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
