import { describe, it, expect, beforeEach } from 'vitest'
import { ingestProjectData, clearProjectArchive } from './projectArchive'
import { getGlyphLayer } from 'src/store/glyphLayer'
import type { FontData, GlyphData, GlyphLayerData } from 'src/store'

// Characterization tests pinning the load-time content contract. With
// layers-as-truth, ingestProjectData normalises each glyph (folding any legacy
// top-level content into a layer) and the saved fontData is already canonical.
// The concrete coordinate/metric values are the regression guard against data
// loss when loading existing projects.

const backupLayer = (): GlyphLayerData => ({
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

// A glyph in the current layers-as-truth shape.
const layerGlyph = (): GlyphData => ({
  id: 'g1',
  name: 'a',
  activeLayerId: 'public.default',
  layerOrder: ['public.default', 'bk'],
  layers: {
    'public.default': {
      id: 'public.default',
      name: 'public.default',
      type: 'master',
      associatedMasterId: 'public.default',
      paths: [
        {
          id: 'p1',
          closed: true,
          nodes: [
            { id: 'n1', x: 1, y: 2, kind: 'oncurve', segmentType: 'line' },
          ],
        },
      ],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
    bk: backupLayer(),
  },
})

// A legacy glyph that still carries content at the top level (pre-migration).
const legacyGlyph = (): GlyphData =>
  ({
    id: 'g2',
    name: 'b',
    activeLayerId: 'public.default',
    paths: [
      {
        id: 'p',
        closed: true,
        nodes: [{ id: 'n', x: 9, y: 4, kind: 'oncurve', segmentType: 'line' }],
      },
    ],
    componentRefs: [],
    anchors: [],
    guidelines: [],
    metrics: { lsb: 0, rsb: 0, width: 480 },
  }) as unknown as GlyphData

const makeFontData = (): FontData => ({
  glyphs: { g1: layerGlyph(), g2: legacyGlyph() },
  glyphOrder: ['g1', 'g2'],
})

describe('ingestProjectData content preservation', () => {
  beforeEach(() => {
    clearProjectArchive()
  })

  it('keeps layer-shaped glyph content (active + backup) intact', () => {
    const glyph = ingestProjectData(makeFontData()).glyphs.g1
    expect(getGlyphLayer(glyph, 'public.default')?.paths[0].nodes[0].x).toBe(1)
    expect(getGlyphLayer(glyph, 'public.default')?.metrics.width).toBe(500)
    expect(getGlyphLayer(glyph, 'bk')?.paths[0].nodes[0].x).toBe(7)
    expect(getGlyphLayer(glyph, 'bk')?.metrics.width).toBe(700)
  })

  it('migrates legacy top-level content into the active layer', () => {
    const glyph = ingestProjectData(makeFontData()).glyphs.g2
    expect(getGlyphLayer(glyph, 'public.default')?.paths[0].nodes[0].x).toBe(9)
    expect(getGlyphLayer(glyph, 'public.default')?.metrics.width).toBe(480)
    expect((glyph as unknown as Record<string, unknown>).paths).toBeUndefined()
  })

  it('is idempotent across a second ingest (no content drift)', () => {
    const once = ingestProjectData(makeFontData())
    const twice = ingestProjectData(once)
    expect(
      getGlyphLayer(twice.glyphs.g1, 'public.default')?.paths[0].nodes[0].x
    ).toBe(1)
    expect(
      getGlyphLayer(twice.glyphs.g2, 'public.default')?.paths[0].nodes[0].x
    ).toBe(9)
    expect(getGlyphLayer(twice.glyphs.g1, 'bk')?.paths[0].nodes[0].x).toBe(7)
  })
})
