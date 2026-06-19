import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from 'src/store'
import type { FontData, GlyphData } from 'src/store'

const makeGlyph = (id: string): GlyphData =>
  ({
    id,
    name: id,
    unicodes: [],
    activeLayerId: 'public.default',
    layerOrder: ['public.default'],
    layers: {
      'public.default': {
        id: 'public.default',
        name: 'public.default',
        paths: [
          {
            id: 'path-1',
            closed: false,
            nodes: [
              {
                id: 'node-1',
                kind: 'oncurve',
                segmentType: 'line',
                x: 0,
                y: 0,
              },
            ],
          },
        ],
        componentRefs: [],
        anchors: [],
        guidelines: [],
        metrics: { width: 1000, lsb: 0, rsb: 0 },
      },
    },
  }) as unknown as GlyphData

const loadFont = () => {
  const fontData: FontData = {
    glyphOrder: ['A', 'B'],
    glyphs: { A: makeGlyph('A'), B: makeGlyph('B') },
  }
  useStore.getState().loadProjectState('project-a', 'Project A', fontData)
}

describe('markDraftSaved', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('clears everything when called without saved ids', () => {
    loadFont()
    useStore.setState({
      isDirty: true,
      dirtyGlyphIds: ['A', 'B'],
      deletedGlyphIds: ['C'],
    })

    useStore.getState().markDraftSaved()

    expect(useStore.getState().isDirty).toBe(false)
    expect(useStore.getState().dirtyGlyphIds).toEqual([])
    expect(useStore.getState().deletedGlyphIds).toEqual([])
  })

  it('keeps edits made during an async save', () => {
    loadFont()
    // Snapshot saved [A]; B was edited and C deleted while the save was running.
    useStore.setState({
      isDirty: true,
      dirtyGlyphIds: ['A', 'B'],
      deletedGlyphIds: ['C', 'D'],
    })

    useStore.getState().markDraftSaved(['A'], ['C'])

    expect(useStore.getState().dirtyGlyphIds).toEqual(['B'])
    expect(useStore.getState().deletedGlyphIds).toEqual(['D'])
    expect(useStore.getState().isDirty).toBe(true)
  })

  it('keeps a glyph queued when it was edited after the saved revision', () => {
    loadFont()
    useStore
      .getState()
      .updateNodePosition('A', 'path-1', 'node-1', { x: 10, y: 0 })
    const savedRevision = useStore.getState().persistenceQueue.revision
    useStore
      .getState()
      .updateNodePosition('A', 'path-1', 'node-1', { x: 20, y: 0 })

    useStore.getState().markDraftSaved(['A'], [], savedRevision)

    expect(useStore.getState().dirtyGlyphIds).toEqual(['A'])
    expect(useStore.getState().isDirty).toBe(true)
    expect(useStore.getState().persistenceQueue.glyphIds).toEqual(['A'])
  })

  it('queues project-only changes separately from glyph edits', () => {
    loadFont()

    useStore.getState().updateFontInfo({
      fontInfo: { familyName: 'Renamed Project', customData: {} },
    })

    expect(useStore.getState().dirtyGlyphIds).toEqual([])
    expect(useStore.getState().persistenceQueue.projectQueued).toBe(true)
    expect(useStore.getState().isDirty).toBe(true)
  })

  it('queues UI state changes without marking local font changes', () => {
    loadFont()

    useStore.getState().setSelectedGlyphId('B')

    expect(useStore.getState().persistenceQueue.uiStateQueued).toBe(true)
    expect(useStore.getState().dirtyGlyphIds).toEqual([])
    expect(useStore.getState().hasLocalChanges).toBe(false)
    expect(useStore.getState().isDirty).toBe(true)
  })

  it('does not report saved while newer queued edits remain', () => {
    loadFont()
    useStore
      .getState()
      .updateNodePosition('A', 'path-1', 'node-1', { x: 10, y: 0 })
    const savedRevision = useStore.getState().persistenceQueue.revision
    useStore
      .getState()
      .updateNodePosition('A', 'path-1', 'node-1', { x: 20, y: 0 })

    useStore.getState().markDraftSaved(['A'], [], savedRevision)
    useStore.getState().setPersistenceStatus('saved')

    expect(useStore.getState().persistenceStatus).toBe('queued')
    expect(useStore.getState().persistenceQueue.status).toBe('queued')
  })

  it('clears the dirty flag when nothing remains', () => {
    loadFont()
    useStore.setState({
      isDirty: true,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: [],
    })

    useStore.getState().markDraftSaved(['A'], [])

    expect(useStore.getState().dirtyGlyphIds).toEqual([])
    expect(useStore.getState().isDirty).toBe(false)
  })

  it('tracks local persistence status separately from dirty ids', () => {
    loadFont()

    useStore.getState().updateFontInfo({
      fontInfo: { familyName: 'Project A', customData: {} },
    })

    expect(useStore.getState().persistenceStatus).toBe('queued')
    expect(useStore.getState().persistenceError).toBeNull()

    useStore.getState().setPersistenceStatus('error', 'boom')

    expect(useStore.getState().persistenceStatus).toBe('error')
    expect(useStore.getState().persistenceError).toBe('boom')
  })
})
