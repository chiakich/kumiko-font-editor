import { describe, it, expect } from 'vitest'
import {
  getGlyphLayer,
  getActiveLayer,
  setGlyphActiveLayer,
  normalizeGlyphToLayers,
} from './glyphLayer'
import type { GlyphData, GlyphLayerData } from './types'

// Characterization tests for the layers-as-truth model: layer resolution,
// active-layer switching (a pointer move, no content copy), and migration of
// legacy top-level content. Concrete coordinate/metric values are the guard.

const master = (): GlyphLayerData => ({
  id: 'public.default',
  name: 'public.default',
  type: 'master',
  associatedMasterId: 'public.default',
  paths: [
    {
      id: 'p1',
      closed: true,
      nodes: [{ id: 'n1', x: 1, y: 2, kind: 'oncurve', segmentType: 'line' }],
    },
  ],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
})

const backup = (): GlyphLayerData => ({
  id: 'bk',
  name: 'bk',
  type: 'backup',
  associatedMasterId: 'public.default',
  paths: [
    {
      id: 'pb',
      closed: true,
      nodes: [{ id: 'nb', x: 7, y: 8, kind: 'oncurve', segmentType: 'line' }],
    },
  ],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 10, rsb: 10, width: 700 },
})

const makeGlyph = (): GlyphData => ({
  id: 'g1',
  name: 'a',
  activeLayerId: 'public.default',
  layerOrder: ['public.default', 'bk'],
  layers: { 'public.default': master(), bk: backup() },
})

describe('getGlyphLayer', () => {
  it('resolves the active layer content', () => {
    const layer = getGlyphLayer(makeGlyph(), 'public.default')
    expect(layer?.paths[0].nodes[0].x).toBe(1)
    expect(layer?.metrics.width).toBe(500)
  })

  it('resolves null layerId to the active layer', () => {
    expect(getGlyphLayer(makeGlyph(), null)?.paths[0].nodes[0].x).toBe(1)
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
    expect(getActiveLayer(makeGlyph(), null)?.paths[0].nodes[0].x).toBe(1)
  })
})

describe('setGlyphActiveLayer', () => {
  it('switches the active layer by pointer move (no content copy)', () => {
    const glyph = makeGlyph()
    setGlyphActiveLayer(glyph, 'bk')
    expect(glyph.activeLayerId).toBe('bk')
    // resolving the active layer now yields the backup content
    expect(getGlyphLayer(glyph, null)?.paths[0].nodes[0].x).toBe(7)
    // the original master layer is untouched (no copy happened)
    expect(glyph.layers?.['public.default']?.paths[0].nodes[0].x).toBe(1)
  })

  it('is a no-op for a layer that does not exist here', () => {
    const glyph = makeGlyph()
    setGlyphActiveLayer(glyph, 'missing')
    expect(glyph.activeLayerId).toBe('public.default')
  })
})

describe('normalizeGlyphToLayers', () => {
  it('folds legacy top-level content into the active layer', () => {
    const legacy = {
      id: 'g2',
      name: 'b',
      activeLayerId: 'public.default',
      paths: [
        {
          id: 'p',
          closed: true,
          nodes: [
            { id: 'n', x: 5, y: 6, kind: 'oncurve', segmentType: 'line' },
          ],
        },
      ],
      components: [],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 333 },
    } as unknown as GlyphData

    const normalized = normalizeGlyphToLayers(legacy)
    expect(normalized.layers?.['public.default']?.paths[0].nodes[0].x).toBe(5)
    expect(normalized.layers?.['public.default']?.metrics.width).toBe(333)
    expect(normalized.layerOrder).toContain('public.default')
    // top-level content stripped
    expect(
      (normalized as unknown as Record<string, unknown>).paths
    ).toBeUndefined()
  })

  it('passes through a glyph already in layer shape', () => {
    const normalized = normalizeGlyphToLayers(makeGlyph())
    expect(normalized.layers?.['public.default']?.paths[0].nodes[0].x).toBe(1)
    expect(normalized.layers?.bk?.paths[0].nodes[0].x).toBe(7)
  })
})
