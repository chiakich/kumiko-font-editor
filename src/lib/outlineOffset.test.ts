import { describe, expect, it } from 'vitest'
import type { PathData, PathNode } from '@/domain'
import { offsetGlyphPaths } from '@/lib/outlineOffset'

let nodeSeq = 0

const corner = (x: number, y: number): PathNode => ({
  id: `n${nodeSeq++}`,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'line',
  smooth: false,
})

const smooth = (x: number, y: number): PathNode => ({
  id: `n${nodeSeq++}`,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'cubic',
  smooth: true,
})

const offHandle = (x: number, y: number): PathNode => ({
  id: `n${nodeSeq++}`,
  x,
  y,
  kind: 'offcurve',
})

// Build a closed polygon from corner points (in the given winding order).
const polygon = (
  points: Array<[number, number]>,
  id = `p${nodeSeq++}`
): PathData => ({
  id,
  closed: true,
  nodes: points.map(([x, y]) => corner(x, y)),
})

const bounds = (path: PathData) => {
  const xs = path.nodes.map((node) => node.x)
  const ys = path.nodes.map((node) => node.y)
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  }
}

// CCW square in y-up coordinates.
const ccwSquare = (size = 100) =>
  polygon([
    [0, 0],
    [size, 0],
    [size, size],
    [0, size],
  ])

// CW square (reversed winding).
const cwSquare = (size = 100) =>
  polygon([
    [0, 0],
    [0, size],
    [size, size],
    [size, 0],
  ])

describe('offsetGlyphPaths', () => {
  it('embolden grows a CCW outer square by the offset on every side', () => {
    const { paths, rebuilt } = offsetGlyphPaths([ccwSquare(100)], 10)
    expect(rebuilt).toBe(false)
    expect(bounds(paths[0])).toEqual({
      xMin: -10,
      xMax: 110,
      yMin: -10,
      yMax: 110,
    })
  })

  it('embolden grows ink regardless of winding convention (CW outer)', () => {
    const { paths } = offsetGlyphPaths([cwSquare(100)], 10)
    // Positive distance must still expand the outline, not shrink it.
    expect(bounds(paths[0])).toEqual({
      xMin: -10,
      xMax: 110,
      yMin: -10,
      yMax: 110,
    })
  })

  it('thin shrinks the outline for negative distance', () => {
    const { paths } = offsetGlyphPaths([ccwSquare(100)], -10)
    expect(bounds(paths[0])).toEqual({
      xMin: 10,
      xMax: 90,
      yMin: 10,
      yMax: 90,
    })
  })

  it('grows the outer contour and shrinks the counter (uniform ink growth)', () => {
    const outer = ccwSquare(300)
    // Counter wound opposite to the outer contour.
    const counter = polygon([
      [100, 100],
      [100, 200],
      [200, 200],
      [200, 100],
    ])

    const { paths } = offsetGlyphPaths([outer, counter], 10)

    // Outer expands outward.
    expect(bounds(paths[0]).xMin).toBe(-10)
    expect(bounds(paths[0]).xMax).toBe(310)
    // Counter shrinks inward, enlarging the ink ring.
    expect(bounds(paths[1]).xMin).toBe(110)
    expect(bounds(paths[1]).xMax).toBe(190)
  })

  it('offsets only the contours named in pathIds', () => {
    const outer = ccwSquare(300)
    const counter = polygon([
      [100, 100],
      [100, 200],
      [200, 200],
      [200, 100],
    ])

    const { paths } = offsetGlyphPaths([outer, counter], 10, {
      pathIds: [counter.id],
    })

    // Outer is untouched...
    expect(bounds(paths[0])).toEqual(bounds(outer))
    expect(paths[0]).toBe(outer)
    // ...while the counter still shrinks (sign from the whole glyph).
    expect(bounds(paths[1]).xMin).toBe(110)
    expect(bounds(paths[1]).xMax).toBe(190)
  })

  it('grows a circle radially and scales its handles (true arc offset)', () => {
    // CCW circle, radius 100, centre (200, 200), as four cubic arcs.
    const k = 55.23
    const circle: PathData = {
      id: 'circle',
      closed: true,
      nodes: [
        smooth(300, 200),
        offHandle(300, 200 + k),
        offHandle(200 + k, 300),
        smooth(200, 300),
        offHandle(200 - k, 300),
        offHandle(100, 200 + k),
        smooth(100, 200),
        offHandle(100, 200 - k),
        offHandle(200 - k, 100),
        smooth(200, 100),
        offHandle(200 + k, 100),
        offHandle(300, 200 - k),
      ],
    }

    const { paths, rebuilt } = offsetGlyphPaths([circle], 10)
    expect(rebuilt).toBe(false)
    // Same node structure → interpolation-safe.
    expect(paths[0].nodes).toHaveLength(circle.nodes.length)

    // On-curve extremes move out radially by ~10 (radius 100 → 110).
    const b = bounds(paths[0])
    expect(Math.abs(b.xMin - 90)).toBeLessThan(6)
    expect(Math.abs(b.xMax - 310)).toBeLessThan(6)

    // Handle of the right node lengthens with the radius: its offset from the
    // (moved) on-curve point must grow, not stay at the original 55.23.
    const rightOn = paths[0].nodes[0]
    const rightHandle = paths[0].nodes[1]
    const handleLength = Math.hypot(
      rightHandle.x - rightOn.x,
      rightHandle.y - rightOn.y
    )
    expect(handleLength).toBeGreaterThan(k + 2)
  })

  it('keeps handles stable on near-straight curve segments', () => {
    // The top edge is a cubic whose handles sit almost on the chord — the case
    // that previously flung handles to a blown-up Tiller–Hanson intersection.
    const h1 = offHandle(100, 101)
    const h2 = offHandle(200, 101)
    const path: PathData = {
      id: 'near-straight',
      closed: true,
      nodes: [
        corner(0, 100),
        h1,
        h2,
        corner(300, 100),
        corner(300, 0),
        corner(0, 0),
      ],
    }

    const { paths } = offsetGlyphPaths([path], 10)
    const newH1 = paths[0].nodes[1]
    const newH2 = paths[0].nodes[2]
    // Each handle moves by ~delta, never flung far.
    expect(Math.hypot(newH1.x - h1.x, newH1.y - h1.y)).toBeLessThan(30)
    expect(Math.hypot(newH2.x - h2.x, newH2.y - h2.y)).toBeLessThan(30)
  })

  it('shrinks a rounded corner without collapsing its two handles', () => {
    // A rounded-corner contour thinned hard (the counter case in "口"): the two
    // arc handles must keep a true smaller arc, not fuse onto the sharp corner.
    const r = 40
    const k = r * 0.5523
    const arc: PathData = {
      id: 'rounded',
      closed: true,
      nodes: [
        smooth(0, 40), // H: top of bottom-left arc, on the left edge
        offHandle(0, 40 - k),
        offHandle(40 - k, 0),
        smooth(40, 0), // A: start of bottom edge
        corner(200, 0),
        corner(200, 200),
        corner(0, 200),
      ],
    }

    const { paths } = offsetGlyphPaths([arc], -30) // radius 40 → 10
    const h1 = paths[0].nodes[1]
    const h2 = paths[0].nodes[2]

    // Handles stay distinct (not fused into one point).
    expect(Math.hypot(h2.x - h1.x, h2.y - h1.y)).toBeGreaterThan(4)
    // ...and shrink with the radius (~0.5523 * 10 ≈ 5.5 from each on-curve end).
    const onH = paths[0].nodes[0]
    const onA = paths[0].nodes[3]
    expect(Math.hypot(h1.x - onH.x, h1.y - onH.y)).toBeLessThan(12)
    expect(Math.hypot(h2.x - onA.x, h2.y - onA.y)).toBeLessThan(12)
  })

  it('degrades collapsed corners without inverting handles (heavy offset)', () => {
    // Rounded square thinned far past its corner radius: corners over-collapse.
    // No cubic segment may end up with a handle pointing backward (a spike).
    const r = 40
    const k = r * 0.5523
    const rounded: PathData = {
      id: 'rsq',
      closed: true,
      nodes: [
        smooth(40, 0),
        corner(160, 0),
        offHandle(160 + k, 0),
        offHandle(200, 0 + k),
        smooth(200, 40),
        smooth(200, 160),
        offHandle(200, 160 + k),
        offHandle(160 + k, 200),
        smooth(160, 200),
        smooth(40, 200),
        offHandle(40 - k, 200),
        offHandle(0, 160 + k),
        smooth(0, 160),
        smooth(0, 40),
        offHandle(0, 40 - k),
        offHandle(40 - k, 0),
      ],
    }

    const { paths } = offsetGlyphPaths([rounded], -60) // well past r = 40
    const nodes = paths[0].nodes
    const n = nodes.length
    for (let i = 0; i < n; i += 1) {
      if (nodes[i].kind !== 'oncurve') continue
      // walk to the next on-curve, collecting handles
      const handles: PathNode[] = []
      let j = (i + 1) % n
      while (nodes[j].kind === 'offcurve') {
        handles.push(nodes[j])
        j = (j + 1) % n
      }
      if (handles.length === 0) continue
      const a = nodes[i]
      const b = nodes[j]
      const chordX = b.x - a.x
      const chordY = b.y - a.y
      const h1 = handles[0]
      const h2 = handles[handles.length - 1]
      const dot1 = chordX * (h1.x - a.x) + chordY * (h1.y - a.y)
      const dot2 = chordX * (b.x - h2.x) + chordY * (b.y - h2.y)
      // Handles never point backward along the (degraded) chord.
      expect(dot1).toBeGreaterThanOrEqual(0)
      expect(dot2).toBeGreaterThanOrEqual(0)
    }
  })

  it('leaves paths untouched for zero distance', () => {
    const input = [ccwSquare(100)]
    expect(offsetGlyphPaths(input, 0).paths).toBe(input)
  })

  it('passes open paths through unchanged', () => {
    const open: PathData = { ...ccwSquare(100), closed: false }
    const { paths } = offsetGlyphPaths([open], 10)
    expect(paths[0]).toBe(open)
  })

  it('skips the rebuild when cleanup finds no crossings', () => {
    const square = ccwSquare(100)
    const { paths, rebuilt } = offsetGlyphPaths([square], 10, { cleanup: true })
    // A convex square stays simple, so nodes are preserved.
    expect(rebuilt).toBe(false)
    expect(paths[0].nodes.map((node) => node.id)).toEqual(
      square.nodes.map((node) => node.id)
    )
  })

  it('rebuilds a contour that self-intersects', () => {
    // A bow-tie self-intersects, so cleanup resolves it.
    const bowtie = polygon([
      [0, 0],
      [100, 100],
      [100, 0],
      [0, 100],
    ])
    const { paths, rebuilt } = offsetGlyphPaths([bowtie], 5, { cleanup: true })
    expect(rebuilt).toBe(true)
    expect(paths.every((path) => path.closed)).toBe(true)
  })

  it('keeps overlapping separate contours intact under cleanup', () => {
    // Two separate overlapping contours must NOT be merged/sliced — a stroke
    // crossing a box is intentional in CJK and renders fine with non-zero fill.
    const a = ccwSquare(100)
    const b = polygon([
      [50, 50],
      [150, 50],
      [150, 150],
      [50, 150],
    ])
    const { paths, rebuilt } = offsetGlyphPaths([a, b], 5, { cleanup: true })
    expect(rebuilt).toBe(false)
    expect(paths).toHaveLength(2)
  })
})
