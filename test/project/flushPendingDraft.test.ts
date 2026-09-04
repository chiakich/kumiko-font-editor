import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPendingDraft } from '@/lib/project/flushPendingDraft'
import type { FontData } from '@/domain'

const mocks = vi.hoisted(() => ({
  saveDraftSnapshotInWorker: vi.fn(),
  saveProjectUiStateInWorker: vi.fn(),
  publishProjectDraftSaved: vi.fn(),
}))

vi.mock('@/lib/project/draftSaveWorkerClient', () => ({
  saveDraftSnapshotInWorker: mocks.saveDraftSnapshotInWorker,
  saveProjectUiStateInWorker: mocks.saveProjectUiStateInWorker,
}))

vi.mock('@/lib/project/projectBroadcast', () => ({
  publishProjectDraftSaved: mocks.publishProjectDraftSaved,
}))

const fontData: FontData = {
  glyphOrder: ['A', 'B'],
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
    B: {
      id: 'B',
      name: 'B',
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
    mocks.saveDraftSnapshotInWorker
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
    expect(mocks.saveDraftSnapshotInWorker).toHaveBeenCalledTimes(2)
  })

  it('sends only dirty glyphs to the worker while preserving glyph order', async () => {
    mocks.saveDraftSnapshotInWorker.mockResolvedValueOnce(undefined)

    await flushPendingDraft(makeFlushInput(1))

    expect(mocks.saveDraftSnapshotInWorker).toHaveBeenCalledTimes(1)
    const input = mocks.saveDraftSnapshotInWorker.mock.calls[0]?.[0]
    expect(input.fontData.glyphOrder).toEqual(['A', 'B'])
    expect(Object.keys(input.fontData.glyphs)).toEqual(['A'])
  })

  it('broadcasts the saved draft summary after persistence succeeds', async () => {
    mocks.saveDraftSnapshotInWorker.mockResolvedValueOnce(undefined)
    const input = {
      ...makeFlushInput(7),
      projectQueued: true,
      uiStateQueued: true,
      dirtyGlyphIds: ['A', 'B'],
      deletedGlyphIds: ['C'],
    }

    await flushPendingDraft(input)

    expect(mocks.publishProjectDraftSaved).toHaveBeenCalledWith({
      projectId: 'project-a',
      revision: 7,
      projectChanged: true,
      uiStateChanged: true,
      glyphIds: ['A', 'B'],
      deletedGlyphIds: ['C'],
    })
  })
})
