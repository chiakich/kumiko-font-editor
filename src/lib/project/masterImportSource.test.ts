import { describe, it, expect } from 'vitest'
import { extractMasterGlyphs } from './masterImportSource'
import { activeLayer } from 'src/store/glyphLayer'
import type { FontData, GlyphData, PathNode } from 'src/store'

const on = (x: number, y: number, id: string): PathNode => ({
  id,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'line',
})

// A glyph with two master layers (keyed by source id), as multi-master imports
// produce.
const makeMultiMasterGlyph = (id: string): GlyphData => ({
  id,
  name: id,
  unicodes: ['0041'],
  activeLayerId: 'thin',
  layerOrder: ['thin', 'bold'],
  layers: {
    thin: {
      id: 'thin',
      name: 'Thin',
      type: 'master',
      associatedMasterId: 'thin',
      paths: [{ id: 'p0', nodes: [on(10, 0, 'a')], closed: true }],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 400 },
    },
    bold: {
      id: 'bold',
      name: 'Bold',
      type: 'master',
      associatedMasterId: 'bold',
      paths: [{ id: 'p0', nodes: [on(99, 0, 'a')], closed: true }],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 600 },
    },
  },
})

describe('extractMasterGlyphs', () => {
  it('flattens a chosen master into single-default-layer glyphs', () => {
    const fontData: Pick<FontData, 'glyphs'> = {
      glyphs: { A: makeMultiMasterGlyph('A') },
    }
    const extracted = extractMasterGlyphs(fontData, 'bold')
    const glyph = extracted.A
    expect(Object.keys(glyph.layers ?? {})).toEqual(['public.default'])
    expect(glyph.activeLayerId).toBe('public.default')
    // activeLayer resolves the flattened outline from the 'bold' master.
    expect(activeLayer(glyph).paths[0].nodes[0].x).toBe(99)
    expect(activeLayer(glyph).metrics.width).toBe(600)
  })

  it('skips glyphs that lack a layer for the requested master', () => {
    const glyph = makeMultiMasterGlyph('A')
    delete glyph.layers!.bold
    const extracted = extractMasterGlyphs({ glyphs: { A: glyph } }, 'bold')
    expect(extracted.A).toBeUndefined()
  })
})
