import { describe, it, expect } from 'vitest'
import {
  getGlyphLayer,
  getActiveLayer,
  syncGlyphTopLevelFromLayer,
} from './glyphLayer'
import type { GlyphData, GlyphLayerData } from './types'

// Characterization tests locking the layer-resolution contract before the
// layers-as-truth migration. getGlyphLayer / getActiveLayer survive the refactor
// (their content contract must not change); concrete content values are the
// regression guard.

const backup = (): GlyphLayerData => ({
  id: 'bk',
  name: 'bk',
  type: 'backup',
  associatedMasterId: 'public.default',
  paths: [
    {
      id: 'pb',
      closed: true,
      nodes: [{ id: 'nb', x: 7, y: 8, type: 'corner' }],
    },
  ],
  components: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 10, rsb: 10, width: 700 },
})

const makeGlyph = (): GlyphData => ({
  id: 'g1',
  name: 'a',
  activeLayerId: 'public.default',
  paths: [
    {
      id: 'p1',
      closed: true,
      nodes: [{ id: 'n1', x: 1, y: 2, type: 'corner' }],
    },
  ],
  components: [],
  componentRefs: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
  layers: { bk: backup() },
  layerOrder: ['bk'],
})

describe('getGlyphLayer', () => {
  it('resolves the active layer to the editable content', () => {
    const glyph = makeGlyph()
    const layer = getGlyphLayer(glyph, 'public.default')
    expect(layer?.paths[0].nodes[0].x).toBe(1)
    expect(layer?.metrics.width).toBe(500)
  })

  it('resolves null layerId to the active layer', () => {
    const layer = getGlyphLayer(makeGlyph(), null)
    expect(layer?.paths[0].nodes[0].x).toBe(1)
  })

  it('resolves a backup layer id to its own content', () => {
    const layer = getGlyphLayer(makeGlyph(), 'bk')
    expect(layer?.paths[0].nodes[0].x).toBe(7)
    expect(layer?.metrics.width).toBe(700)
  })
})

describe('getActiveLayer', () => {
  it('returns the active master for the matching master id', () => {
    const layer = getActiveLayer(makeGlyph(), 'public.default')
    expect(layer?.type).toBe('master')
    expect(layer?.paths[0].nodes[0].x).toBe(1)
  })

  it('returns null for a master id with no layer here (sparse)', () => {
    expect(getActiveLayer(makeGlyph(), 'other-master')).toBeNull()
  })

  it('falls back to the active layer when no master id is given', () => {
    const layer = getActiveLayer(makeGlyph(), null)
    expect(layer?.paths[0].nodes[0].x).toBe(1)
  })
})

describe('syncGlyphTopLevelFromLayer', () => {
  it('copies the chosen layer content onto the glyph and sets activeLayerId', () => {
    const glyph = makeGlyph()
    syncGlyphTopLevelFromLayer(glyph, 'bk')
    expect(glyph.activeLayerId).toBe('bk')
    expect(glyph.paths[0].nodes[0].x).toBe(7)
    expect(glyph.metrics.width).toBe(700)
  })
})
