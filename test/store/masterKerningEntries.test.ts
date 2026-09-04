import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import type { FontData, KerningPair } from '@/domain'

const pair = (value: number): KerningPair => ({
  id: `p_${value}`,
  left: { kind: 'glyph', glyph: 'A' },
  right: { kind: 'glyph', glyph: 'V' },
  value,
})

const fontData = (): FontData => ({
  glyphs: {},
  glyphOrder: [],
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
  },
  kerningPairs: [pair(-10)],
})

describe('kerningPairsByMaster entries follow source CRUD', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('applyImportedMaster seeds an empty entry for a new non-default master', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().applyImportedMaster({
      source: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
      layersByGlyphId: {},
    })
    expect(useStore.getState().fontData?.kerningPairsByMaster?.Bold).toEqual([])
  })

  it('applyImportedMaster seeds provided pairs (copy-method masters)', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().applyImportedMaster({
      source: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
      layersByGlyphId: {},
      kerningPairs: [pair(-10)],
    })
    expect(
      useStore.getState().fontData?.kerningPairsByMaster?.Bold[0].value
    ).toBe(-10)
  })

  it('applyImportedMaster keeps an existing entry untouched', () => {
    const data = fontData()
    data.sources = {
      ...data.sources,
      Bold: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
    }
    data.kerningPairsByMaster = { Bold: [pair(-40)] }
    useStore.getState().loadProjectState('p', 'P', data)
    useStore.getState().applyImportedMaster({
      source: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
      layersByGlyphId: {},
    })
    expect(
      useStore.getState().fontData?.kerningPairsByMaster?.Bold[0].value
    ).toBe(-40)
  })

  it('applyImportedMaster adds no entry for the first (default) master', () => {
    const data = fontData()
    data.sources = {}
    useStore.getState().loadProjectState('p', 'P', data)
    useStore.getState().applyImportedMaster({
      source: { id: 'Light', name: 'Light', location: { Weight: 0 } },
      layersByGlyphId: {},
    })
    expect(
      useStore.getState().fontData?.kerningPairsByMaster?.Light
    ).toBeUndefined()
  })

  it('re-applying an existing entry-less source keeps it on canonical pairs', () => {
    const data = fontData()
    data.sources = {
      ...data.sources,
      Bold: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
    }
    useStore.getState().loadProjectState('p', 'P', data)
    useStore.getState().applyImportedMaster({
      source: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
      layersByGlyphId: {},
    })
    expect(
      useStore.getState().fontData?.kerningPairsByMaster?.Bold
    ).toBeUndefined()
  })

  it('updateFontSettings seeds an entry for a source it adds', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    useStore.getState().updateFontSettings({
      sources: {
        Light: { id: 'Light', name: 'Light', location: { Weight: 0 } },
        Bold: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
      },
    })
    expect(useStore.getState().fontData?.kerningPairsByMaster?.Bold).toEqual([])
  })

  it('updateFontSettings drops the entry of a removed source', () => {
    const data = fontData()
    data.sources = {
      ...data.sources,
      Bold: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
    }
    data.kerningPairsByMaster = { Bold: [pair(-40)] }
    useStore.getState().loadProjectState('p', 'P', data)
    useStore.getState().updateFontSettings({
      sources: {
        Light: { id: 'Light', name: 'Light', location: { Weight: 0 } },
      },
    })
    expect(
      useStore.getState().fontData?.kerningPairsByMaster?.Bold
    ).toBeUndefined()
  })
})
