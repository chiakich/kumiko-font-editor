import { describe, it, expect } from 'vitest'
import opentype from 'opentype.js'
import { exportGlyphListAsBinary } from './fontBinaryFormat'
import type { GlyphData, PathNode } from 'src/store'

const on = (
  x: number,
  y: number,
  segmentType: 'line' | 'cubic' | 'quadratic',
  id: string
): PathNode => ({ id, x, y, kind: 'oncurve', segmentType })

const off = (x: number, y: number, id: string): PathNode => ({
  id,
  x,
  y,
  kind: 'offcurve',
})

const makeGlyph = (nodes: PathNode[]): GlyphData => ({
  id: 'test',
  name: 'test',
  unicodes: ['0041'],
  activeLayerId: 'public.default',
  layerOrder: ['public.default'],
  layers: {
    'public.default': {
      id: 'public.default',
      name: 'public.default',
      type: 'master',
      associatedMasterId: 'public.default',
      paths: [{ id: 'p0', nodes, closed: true }],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
  },
})

const exportAndReadPath = async (glyph: GlyphData) => {
  const blob = await exportGlyphListAsBinary({
    fontData: { unitsPerEm: 1000 },
    glyphs: [glyph],
    format: 'otf',
  })
  const font = opentype.parse(await blob.arrayBuffer())
  const g = font.charToGlyph('A')
  return g.path.commands
}

describe('appendShapeToPath closed-contour wrap-around', () => {
  // Canonical (UFO-order) closed cubic contour: starts on-curve, and the
  // segment wrapping back to the start point keeps its two handles at the tail.
  it('draws the wrap-around segment as a curve, not a straight line', async () => {
    const nodes: PathNode[] = [
      on(100, 100, 'cubic', 'a'), // start; its segment wraps from the tail handles
      on(400, 100, 'line', 'b'),
      off(500, 200, 'h1'),
      off(500, 300, 'h2'),
      on(400, 400, 'cubic', 'c'),
      on(100, 400, 'line', 'd'),
      off(0, 300, 'h3'), // trailing handles: closing curve back to the start
      off(0, 200, 'h4'),
    ]
    const commands = await exportAndReadPath(makeGlyph(nodes))
    const curves = commands.filter((cmd) => cmd.type === 'C')
    // Two cubic segments: b->c and the wrap d->start. Before the fix the second
    // was dropped and the contour closed with a straight line.
    expect(curves.length).toBe(2)
  })
})
