import { describe, expect, it, vi } from 'vitest'
import { buildCurrentDraftFlushInput } from '@/lib/project/currentDraftFlush'
import type { FontData, PersistenceQueueState } from '@/store'

const fontData = {
  glyphs: {},
  glyphOrder: [],
} satisfies FontData

const persistenceQueue: PersistenceQueueState = {
  projectQueued: true,
  uiStateQueued: true,
  glyphIds: ['a'],
  deletedGlyphIds: ['old'],
  revision: 7,
  projectRevision: 3,
  uiStateRevision: 5,
  glyphRevisions: { a: 6 },
  deletedGlyphRevisions: { old: 4 },
  status: 'queued',
  lastError: null,
}

describe('buildCurrentDraftFlushInput', () => {
  it('centralizes draft flush payload assembly', () => {
    const setPersistenceStatus = vi.fn()
    const markDraftSaved = vi.fn()
    const input = buildCurrentDraftFlushInput({
      activeMasterId: 'master-a',
      deletedGlyphIds: ['old'],
      dirtyGlyphIds: ['a'],
      fontData,
      glyphEditTimes: { a: 12 },
      markDraftSaved,
      overviewGridState: { topIndex: 10 },
      overviewSectionId: 'latin',
      overviewTopGlyphId: 'A',
      persistenceQueue,
      projectId: 'project-a',
      projectTitle: 'Project A',
      selectedGlyphId: 'a',
      selectedLayerId: 'foreground',
      setPersistenceStatus,
    })

    expect(input).toMatchObject({
      projectId: 'project-a',
      projectTitle: 'Project A',
      fontData,
      projectQueued: true,
      uiStateQueued: true,
      dirtyGlyphIds: ['a'],
      deletedGlyphIds: ['old'],
      persistenceRevision: 7,
      glyphEditTimes: { a: 12 },
      selectedLayerId: 'foreground',
      setPersistenceStatus,
      markDraftSaved,
    })
    expect(input.projectUiState).toMatchObject({
      selectedGlyphId: 'a',
      selectedLayerId: 'foreground',
      activeMasterId: 'master-a',
      overviewSectionId: 'latin',
      overviewTopGlyphId: 'A',
      overviewGridState: { topIndex: 10 },
    })
  })
})
