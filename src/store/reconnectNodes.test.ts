import { describe, expect, it } from 'vitest'
import type { GlyphLayerData, PathData, PathNode } from 'src/store/types'
import {
  pairEndpointsByContinuity,
  performReconnect,
  type ReconnectEndpoint,
} from 'src/store/reconnectNodes'

let counter = 0
const node = (x: number, y: number): PathNode => ({
  id: `n${counter++}`,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'line',
  smooth: false,
})

const layerOf = (...paths: PathData[]): GlyphLayerData =>
  ({ paths }) as unknown as GlyphLayerData

const bbox = (path: PathData) => {
  const xs = path.nodes.map((n) => n.x)
  const ys = path.nodes.map((n) => n.y)
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  }
}

/** A clean rectangle whose bbox matches, regardless of node ordering/extras. */
const isRect = (
  path: PathData,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
) => {
  const b = bbox(path)
  return (
    path.closed &&
    b.xMin === xMin &&
    b.xMax === xMax &&
    b.yMin === yMin &&
    b.yMax === yMax
  )
}

const hasZeroLengthSegment = (path: PathData) =>
  path.nodes.some((n, i) => {
    const next = path.nodes[(i + 1) % path.nodes.length]
    return Math.hypot(n.x - next.x, n.y - next.y) < 0.001
  })

// 12-vertex single-contour cross (十), inner corners at indices 2,5,8,11.
const singleCross = () => {
  counter = 0
  const nodes = [
    node(-100, 300),
    node(100, 300),
    node(100, 100), // 2 inner
    node(300, 100),
    node(300, -100),
    node(100, -100), // 5 inner
    node(100, -300),
    node(-100, -300),
    node(-100, -100), // 8 inner
    node(-300, -100),
    node(-300, 100),
    node(-100, 100), // 11 inner
  ]
  return { path: { id: 'cross', closed: true, nodes } as PathData, nodes }
}

// 田's inner 十 as two overlapping closed bars that both carry nodes at the
// four central-square corners (±C) — genuinely multi-path.
const overlappingCross = (C = 50, E = 300) => {
  counter = 0
  const hNodes = [
    node(-E, C),
    node(-C, C),
    node(C, C),
    node(E, C),
    node(E, -C),
    node(C, -C),
    node(-C, -C),
    node(-E, -C),
  ]
  const vNodes = [
    node(-C, E),
    node(C, E),
    node(C, C),
    node(C, -C),
    node(C, -E),
    node(-C, -E),
    node(-C, -C),
    node(-C, C),
  ]
  return {
    hNodes,
    vNodes,
    C,
    layer: layerOf(
      { id: 'h', closed: true, nodes: hNodes },
      { id: 'v', closed: true, nodes: vNodes }
    ),
  }
}

describe('performReconnect — single-contour 十 (regression)', () => {
  it('splits a clean cross into one horizontal + one vertical bar', () => {
    const { path, nodes } = singleCross()
    const layer = layerOf(path)
    const sel = [nodes[2], nodes[5], nodes[8], nodes[11]].map(
      (n) => `cross:${n.id}`
    )

    const next = performReconnect(layer, sel)

    expect(layer.paths).toHaveLength(2)
    expect(layer.paths.some((p) => isRect(p, -300, 300, -100, 100))).toBe(true)
    expect(layer.paths.some((p) => isRect(p, -100, 100, -300, 300))).toBe(true)
    expect(next.length).toBeGreaterThan(0)
  })
})

describe('performReconnect — 田 inner 十 (multi-path crossing)', () => {
  it('selecting all central nodes yields a clean 一橫一豎', () => {
    const { layer, hNodes, vNodes, C } = overlappingCross()
    const central = (n: PathNode) => Math.abs(n.x) === C && Math.abs(n.y) === C
    const sel = [
      ...hNodes.filter(central).map((n) => `h:${n.id}`),
      ...vNodes.filter(central).map((n) => `v:${n.id}`),
    ]

    performReconnect(layer, sel)

    expect(layer.paths).toHaveLength(2)
    expect(layer.paths.some((p) => isRect(p, -300, 300, -50, 50))).toBe(true)
    expect(layer.paths.some((p) => isRect(p, -50, 50, -300, 300))).toBe(true)
    expect(layer.paths.every((p) => !hasZeroLengthSegment(p))).toBe(true)
  })

  it('produces straight-through strokes, never L-shapes / pinwheels', () => {
    const { layer, hNodes, vNodes, C } = overlappingCross()
    const central = (n: PathNode) => Math.abs(n.x) === C && Math.abs(n.y) === C
    const sel = [
      ...hNodes.filter(central).map((n) => `h:${n.id}`),
      ...vNodes.filter(central).map((n) => `v:${n.id}`),
    ]

    performReconnect(layer, sel)

    // An L-shape would span both a full axis AND only half the other.
    for (const p of layer.paths) {
      const b = bbox(p)
      const fullX = b.xMin === -300 && b.xMax === 300
      const fullY = b.yMin === -300 && b.yMax === 300
      expect(fullX && fullY).toBe(false) // no arm-spanning corner piece
    }
  })
})

describe('pairEndpointsByContinuity', () => {
  it('matches a 4-stub crossing straight-through (opposite tangents)', () => {
    // Four stubs meeting at the origin, pointing +x, -x, +y, -y.
    const mk = (
      chainId: number,
      endpoint: 'start' | 'end',
      dx: number,
      dy: number
    ): ReconnectEndpoint => ({
      pathId: 'multi',
      nodeId: `c${chainId}`,
      node: node(0, 0),
      endpoint,
      chainId,
      dir: { x: dx, y: dy },
    })
    const endpoints = [
      mk(0, 'end', 1, 0), // +x
      mk(1, 'start', -1, 0), // -x
      mk(2, 'end', 0, 1), // +y
      mk(3, 'start', 0, -1), // -y
    ]

    const pairs = pairEndpointsByContinuity(endpoints)
    const linked = new Set(
      pairs.map(([a, b]) => [a.chainId, b.chainId].sort().join('-'))
    )

    // +x pairs with -x, +y pairs with -y — straight through, never a turn.
    expect(linked.has('0-1')).toBe(true)
    expect(linked.has('2-3')).toBe(true)
  })
})

describe('performReconnect — merging two separate paths (fallback preserved)', () => {
  it('bridges two far-apart closed paths selected at one node each', () => {
    counter = 0
    const square = (cx: number): PathData => ({
      id: `s${cx}`,
      closed: true,
      nodes: [
        node(cx - 50, 50),
        node(cx + 50, 50),
        node(cx + 50, -50),
        node(cx - 50, -50),
      ],
    })
    const a = square(-200)
    const b = square(200)
    const layer = layerOf(a, b)
    // one node on each path -> distinct, far-apart cut points
    const sel = [`${a.id}:${a.nodes[1].id}`, `${b.id}:${b.nodes[0].id}`]

    performReconnect(layer, sel)

    // The two contours are bridged into a single combined path.
    expect(layer.paths).toHaveLength(1)
  })
})
