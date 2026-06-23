import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from 'src/store'
import type { FontData, GlyphData } from 'src/store/types'

const twoMasterGlyph = (): GlyphData => ({
  id: 'A',
  name: 'A',
  activeLayerId: 'Light',
  layerOrder: ['Light', 'Bold'],
  layers: {
    Light: {
      id: 'Light',
      name: 'Light',
      type: 'master',
      associatedMasterId: 'Light',
      paths: [
        {
          id: 'p',
          closed: true,
          nodes: [
            { id: 'n', x: 10, y: 0, kind: 'oncurve', segmentType: 'line' },
          ],
        },
      ],
      components: [],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
    Bold: {
      id: 'Bold',
      name: 'Bold',
      type: 'master',
      associatedMasterId: 'Bold',
      paths: [
        {
          id: 'p',
          closed: true,
          nodes: [
            { id: 'n', x: 80, y: 0, kind: 'oncurve', segmentType: 'line' },
          ],
        },
      ],
      components: [],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 700 },
    },
  },
})

const fontData = (): FontData => ({
  glyphs: { A: twoMasterGlyph() },
  glyphOrder: ['A'],
  axes: {
    axes: [
      {
        name: 'Weight',
        label: 'Weight',
        tag: 'wght',
        minValue: 0,
        defaultValue: 0,
        maxValue: 100,
      },
    ],
    mappings: [],
  },
  sources: {
    Light: { id: 'Light', name: 'Light', location: { Weight: 0 } },
    Bold: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
  },
})

describe('setActiveMasterId convergence', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('initialises activeMasterId to the default source on load', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    expect(useStore.getState().activeMasterId).toBe('Light')
  })

  it('switching master converges selectedLayerId, editLocation, and glyph active layer', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().setActiveMasterId('Bold')

    const state = useStore.getState()
    expect(state.activeMasterId).toBe('Bold')
    expect(state.selectedLayerId).toBe('Bold')
    expect(state.editLocation).toEqual({ Weight: 100 })
    expect(state.fontData?.glyphs.A.activeLayerId).toBe('Bold')
  })

  it('setting an intermediate editLocation enters read-only instance mode', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().setEditLocation({ Weight: 50 })

    let state = useStore.getState()
    expect(state.activeMasterId).toBeNull()
    expect(state.selectedLayerId).toBe('Light')
    expect(state.editLocation).toEqual({ Weight: 50 })

    useStore.getState().setEditLocation({ Weight: 100 })
    state = useStore.getState()
    expect(state.activeMasterId).toBe('Bold')
    expect(state.selectedLayerId).toBe('Bold')
    expect(state.fontData?.glyphs.A.activeLayerId).toBe('Bold')
  })

  it('edits after switching target the new master layer', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().setActiveMasterId('Bold')
    useStore.getState().updateNodePosition('A', 'p', 'n', { x: 123, y: 0 })

    const layers = useStore.getState().fontData?.glyphs.A.layers
    expect(layers?.Bold.paths[0].nodes[0].x).toBe(123)
    // the other master is untouched
    expect(layers?.Light.paths[0].nodes[0].x).toBe(10)
  })
})

describe('createGlyphMasterLayer (sparse fill)', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  const sparseFontData = (): FontData => {
    const data = fontData()
    // Glyph A starts with only the Light master (Bold is sparse).
    delete data.glyphs.A.layers!.Bold
    data.glyphs.A.layerOrder = ['Light']
    return data
  }

  it('creates the missing master seeded from the active layer', () => {
    useStore.getState().loadProjectState('p', 'P', sparseFontData())
    useStore.getState().createGlyphMasterLayer('A', 'Bold')

    const glyph = useStore.getState().fontData?.glyphs.A
    expect(glyph?.layers?.Bold).toBeDefined()
    expect(glyph?.layers?.Bold.type).toBe('master')
    expect(glyph?.layers?.Bold.associatedMasterId).toBe('Bold')
    // seeded from the active (Light) layer
    expect(glyph?.layers?.Bold.paths[0].nodes[0].x).toBe(10)
    expect(glyph?.layerOrder).toContain('Bold')
  })

  it('does not overwrite an existing master layer', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().createGlyphMasterLayer('A', 'Bold')
    // Bold already existed (x=80) and must be left untouched.
    expect(
      useStore.getState().fontData?.glyphs.A.layers?.Bold.paths[0].nodes[0].x
    ).toBe(80)
  })
})

describe('updateFontSettings source CRUD consistency', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('drops per-glyph layers and fixes active refs when a source is removed', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().setActiveMasterId('Bold')
    // Remove the Bold source (keep only Light).
    useStore.getState().updateFontSettings({
      sources: {
        Light: { id: 'Light', name: 'Light', location: { Weight: 0 } },
      },
    })

    const state = useStore.getState()
    const glyph = state.fontData?.glyphs.A
    expect(glyph?.layers?.Bold).toBeUndefined()
    expect(glyph?.layerOrder).not.toContain('Bold')
    expect(glyph?.activeLayerId).toBe('Light')
    expect(state.activeMasterId).toBe('Light')
  })

  it('follows a source rename into the layer display name', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().updateFontSettings({
      sources: {
        Light: { id: 'Light', name: 'Light', location: { Weight: 0 } },
        Bold: { id: 'Bold', name: 'Black', location: { Weight: 100 } },
      },
    })
    expect(useStore.getState().fontData?.glyphs.A.layers?.Bold.name).toBe(
      'Black'
    )
  })
})
