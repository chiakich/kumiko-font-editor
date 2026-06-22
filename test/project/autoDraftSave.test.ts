import { describe, expect, it } from 'vitest'
import {
  AUTO_DRAFT_SAVE_DELAY_MS,
  shouldBlockBeforeUnload,
} from 'src/hooks/useAutoDraftSave'
import type { PersistenceQueueState } from 'src/store'

const makeQueue = (
  update: Partial<PersistenceQueueState> = {}
): PersistenceQueueState => ({
  projectQueued: false,
  uiStateQueued: false,
  glyphIds: [],
  deletedGlyphIds: [],
  revision: 1,
  projectRevision: null,
  uiStateRevision: null,
  glyphRevisions: {},
  deletedGlyphRevisions: {},
  status: 'queued',
  lastError: null,
  ...update,
})

describe('auto draft save timing', () => {
  it('uses a short debounce window for canonical draft persistence', () => {
    expect(AUTO_DRAFT_SAVE_DELAY_MS).toBeGreaterThanOrEqual(1_000)
    expect(AUTO_DRAFT_SAVE_DELAY_MS).toBeLessThanOrEqual(10_000)
  })

  it('does not block reload for saved or UI-only pending changes', () => {
    expect(
      shouldBlockBeforeUnload({
        isDirty: false,
        persistenceStatus: 'saved',
        persistenceQueue: makeQueue(),
      })
    ).toBe(false)

    expect(
      shouldBlockBeforeUnload({
        isDirty: true,
        persistenceStatus: 'queued',
        persistenceQueue: makeQueue({ uiStateQueued: true }),
      })
    ).toBe(false)
  })

  it('blocks reload while content changes are still pending', () => {
    expect(
      shouldBlockBeforeUnload({
        isDirty: true,
        persistenceStatus: 'queued',
        persistenceQueue: makeQueue({ glyphIds: ['A'] }),
      })
    ).toBe(true)

    expect(
      shouldBlockBeforeUnload({
        isDirty: true,
        persistenceStatus: 'error',
        persistenceQueue: makeQueue({ projectQueued: true }),
      })
    ).toBe(true)
  })
})
