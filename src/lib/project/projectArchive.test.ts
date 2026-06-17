import { describe, it, expect, beforeEach } from 'vitest'
import {
  ingestProjectData,
  hydrateProjectFontData,
  overlayHotFontData,
  clearProjectArchive,
} from './projectArchive'
import { getGlyphLayer } from 'src/store/glyphLayer'
import type { FontData, GlyphData, GlyphLayerData } from 'src/store'

// Characterization tests pinning the save/load content contract before the
// layers-as-truth migration. The functions exercised here are rewritten by the
// migration, but the CONTRACT they encode — glyph content survives a persist /
// load cycle, and per-layer content stays distinct — must not change. The
// concrete coordinate / metric values are the regression guard.

const backupLayer = (): GlyphLayerData => ({
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
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
  layers: { bk: backupLayer() },
  layerOrder: ['bk'],
})

const makeFontData = (): FontData => ({
  glyphs: { g1: makeGlyph() },
  glyphOrder: ['g1'],
})

describe('projectArchive content preservation', () => {
  beforeEach(() => {
    clearProjectArchive()
  })

  it('ingest keeps the active glyph content intact', () => {
    const ingested = ingestProjectData(makeFontData())
    const glyph = ingested.glyphs.g1
    expect(getGlyphLayer(glyph, 'public.default')?.paths[0].nodes[0].x).toBe(1)
    expect(getGlyphLayer(glyph, 'bk')?.paths[0].nodes[0].x).toBe(7)
  })

  it('hydrate populates the active layer from the editable content', () => {
    ingestProjectData(makeFontData())
    const hydrated = hydrateProjectFontData(makeFontData())
    const glyph = hydrated.glyphs.g1
    // active layer content == editable content
    expect(glyph.layers?.['public.default']?.paths[0].nodes[0].x).toBe(1)
    expect(glyph.layers?.['public.default']?.metrics.width).toBe(500)
    // backup preserved and distinct
    expect(glyph.layers?.bk?.paths[0].nodes[0].x).toBe(7)
    expect(glyph.layerOrder).toContain('bk')
  })

  it('overlay reflects a hot edit on the active layer and keeps backups', () => {
    const persisted = hydrateProjectFontData(makeFontData())
    const hot = makeFontData()
    // simulate an edit to the active (hot) content
    hot.glyphs.g1.paths[0].nodes[0].x = 42
    hot.glyphs.g1.metrics.width = 555

    const merged = overlayHotFontData(persisted, hot)
    const glyph = merged.glyphs.g1
    expect(getGlyphLayer(glyph, 'public.default')?.paths[0].nodes[0].x).toBe(42)
    expect(getGlyphLayer(glyph, 'public.default')?.metrics.width).toBe(555)
    // backup untouched by the active-layer edit
    expect(glyph.layers?.bk?.paths[0].nodes[0].x).toBe(7)
  })

  it('a save/load cycle preserves both active and backup content', () => {
    const original = makeFontData()
    ingestProjectData(original)
    const persisted = hydrateProjectFontData(original)
    const reloaded = overlayHotFontData(persisted, original)
    const glyph = reloaded.glyphs.g1
    expect(getGlyphLayer(glyph, 'public.default')?.paths[0].nodes[0].x).toBe(1)
    expect(getGlyphLayer(glyph, 'public.default')?.metrics.width).toBe(500)
    expect(getGlyphLayer(glyph, 'bk')?.paths[0].nodes[0].x).toBe(7)
    expect(getGlyphLayer(glyph, 'bk')?.metrics.width).toBe(700)
  })
})
