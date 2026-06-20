import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import type { FontData } from 'src/store'

const mocks = vi.hoisted(() => ({
  saveDraftSnapshot: vi.fn(),
  saveProjectUiState: vi.fn(),
}))

vi.mock('src/lib/project/draftSave', () => ({
  saveDraftSnapshot: mocks.saveDraftSnapshot,
}))

vi.mock('src/lib/project/projectRepository', () => ({
  saveProjectUiState: mocks.saveProjectUiState,
}))

const fontData: FontData = {
  glyphOrder: ['A'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicodes: [],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
      layers: {
        'public.default': {
          id: 'public.default',
          name: 'public.default',
          paths: [],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics: { width: 1000, lsb: 0, rsb: 1000 },
        },
      },
    },
  },
}

const makeFlushInput = (revision: number) => ({
  projectId: 'project-a',
  projectTitle: 'Project A',
  fontData,
  dirtyGlyphIds: ['A'],
  deletedGlyphIds: [],
  persistenceRevision: revision,
  glyphEditTimes: {},
  selectedLayerId: 'public.default',
  setPersistenceStatus: vi.fn(),
  markDraftSaved: vi.fn(),
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('flushPendingDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serializes writes for the same project so older flushes finish first', async () => {
    const events: string[] = []
    let releaseFirst: (() => void) | null = null
    mocks.saveDraftSnapshot
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            events.push('first-start')
            releaseFirst = () => {
              events.push('first-end')
              resolve()
            }
          })
      )
      .mockImplementationOnce(async () => {
        events.push('second-start')
      })

    const first = flushPendingDraft(makeFlushInput(1))
    await tick()
    const second = flushPendingDraft(makeFlushInput(2))
    await tick()

    expect(events).toEqual(['first-start'])
    releaseFirst?.()

    await first
    await second

    expect(events).toEqual(['first-start', 'first-end', 'second-start'])
    expect(mocks.saveDraftSnapshot).toHaveBeenCalledTimes(2)
  })
})
