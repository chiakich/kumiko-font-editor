/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import opentype from 'opentype.js'
import {
  exportGlyphListAsBinary,
  importBinaryFontFile,
} from './fontBinaryFormat'
import { activeLayer } from 'src/store/glyphLayer'
import { isOnCurveNode } from 'src/store'
import type { GlyphComponentRef, GlyphData, PathNode } from 'src/store'

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

describe('component decomposition on binary export', () => {
  const square = (offsetX: number): PathNode[] => [
    on(offsetX + 0, 0, 'line', 's0'),
    on(offsetX + 100, 0, 'line', 's1'),
    on(offsetX + 100, 100, 'line', 's2'),
    on(offsetX + 0, 100, 'line', 's3'),
  ]

  const makeGlyphWith = (
    id: string,
    unicodes: string[],
    nodes: PathNode[],
    componentRefs: GlyphComponentRef[] = []
  ): GlyphData => ({
    id,
    name: id,
    unicodes,
    activeLayerId: 'public.default',
    layerOrder: ['public.default'],
    layers: {
      'public.default': {
        id: 'public.default',
        name: 'public.default',
        type: 'master',
        associatedMasterId: 'public.default',
        paths: nodes.length ? [{ id: 'p0', nodes, closed: true }] : [],
        componentRefs,
        anchors: [],
        guidelines: [],
        metrics: { lsb: 0, rsb: 0, width: 500 },
      },
    },
  })

  it('decomposes component-only glyphs into outlines with the transform applied', async () => {
    const base = makeGlyphWith('base', [], square(0))
    // Glyph "A" has no paths, only a component referencing "base" shifted +200 x.
    const composed = makeGlyphWith(
      'A',
      ['0041'],
      [],
      [
        {
          id: 'c0',
          glyphId: 'base',
          x: 200,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      ]
    )
    const blob = await exportGlyphListAsBinary({
      fontData: { unitsPerEm: 1000 },
      glyphs: [base, composed],
      format: 'otf',
    })
    const font = opentype.parse(await blob.arrayBuffer())
    const bbox = font.charToGlyph('A').getBoundingBox()
    // Before the fix the glyph was empty; now it carries the shifted square.
    expect(bbox.x1).toBeCloseTo(200, 0)
    expect(bbox.x2).toBeCloseTo(300, 0)
    expect(bbox.y1).toBeCloseTo(0, 0)
    expect(bbox.y2).toBeCloseTo(100, 0)
  })
})

describe('TrueType import outline reconstruction', () => {
  const ttfPath = fileURLToPath(
    new URL('../../../test_glyphs/mutatorsans/MutatorSans.ttf', import.meta.url)
  )

  it('reconstructs glyf outlines without duplicate/zero-length nodes', async () => {
    const buffer = readFileSync(ttfPath)
    const file = new File([buffer], 'MutatorSans.ttf')
    const { fontData } = await importBinaryFontFile(file)

    const glyphO = Object.values(fontData.glyphs).find((glyph) =>
      glyph.unicodes?.includes('004F')
    )
    expect(glyphO).toBeTruthy()

    const paths = activeLayer(glyphO as GlyphData).paths
    expect(paths.length).toBeGreaterThan(0)

    for (const path of paths) {
      // No two consecutive coincident nodes (the opentype.js command stream
      // emitted duplicated start points and zero-length line segments).
      for (let i = 0; i < path.nodes.length; i += 1) {
        const a = path.nodes[i]
        const b = path.nodes[(i + 1) % path.nodes.length]
        expect(a.x === b.x && a.y === b.y).toBe(false)
      }
      // Every closed contour must begin on-curve.
      expect(isOnCurveNode(path.nodes[0])).toBe(true)
    }
  })
})

describe('exported OS/2 classification', () => {
  it('writes usWeightClass / usWidthClass for a static instance', async () => {
    const blob = await exportGlyphListAsBinary({
      fontData: { unitsPerEm: 1000 },
      glyphs: [
        makeGlyph([
          on(0, 0, 'line', 'a'),
          on(100, 0, 'line', 'b'),
          on(100, 100, 'line', 'c'),
        ]),
      ],
      format: 'otf',
      styleName: 'SemiBold',
      weightClass: 600,
      widthClass: 5,
    })
    const font = opentype.parse(await blob.arrayBuffer())
    const os2 = (font as unknown as { tables: { os2: Record<string, number> } })
      .tables.os2
    expect(os2.usWeightClass).toBe(600)
    expect(os2.usWidthClass).toBe(5)
  })

  it('writes explicit fsSelection bits for style linking', async () => {
    const blob = await exportGlyphListAsBinary({
      fontData: { unitsPerEm: 1000 },
      glyphs: [
        makeGlyph([
          on(0, 0, 'line', 'a'),
          on(100, 0, 'line', 'b'),
          on(100, 100, 'line', 'c'),
        ]),
      ],
      format: 'otf',
      styleName: 'Bold Italic',
      fsSelection: 0x01 | 0x20, // ITALIC | BOLD
    })
    const font = opentype.parse(await blob.arrayBuffer())
    const os2 = (font as unknown as { tables: { os2: Record<string, number> } })
      .tables.os2
    expect(os2.fsSelection & 0x20).toBe(0x20) // bold bit
    expect(os2.fsSelection & 0x01).toBe(0x01) // italic bit
  })
})
