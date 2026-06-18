import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from 'src/store'
import type { FontData, GlyphData } from 'src/store'

const makeGlyph = (id: string): GlyphData =>
  ({
    id,
    name: id,
    unicode: null,
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: [],
    components: [],
    componentRefs: [],
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
