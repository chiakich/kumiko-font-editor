import { BaseTool, type EventStream, type ToolEvent } from './BaseTool'
import { useStore, type PathData, type PathNode } from '../../../store'

interface CutCandidate {
  pathId: string
  startNodeId: string
  endNodeId: string
  startIndex: number
  endIndex: number
  t: number
  point: { x: number; y: number }
  segmentNodes: PathNode[]
  type: 'line' | 'quad' | 'cubic'
}

export class KnifeTool extends BaseTool {
  identifier = 'knife'

  override activate(): void {
    this.setCursor('crosshair')
  }

  override deactivate(): void {
    super.deactivate()
    this.sceneModel.knifeLine = undefined
    this.canvasController.requestUpdate()
  }

  handleHover(): void {
    this.setCursor('crosshair')
  }

  async handleDrag(
    eventStream: EventStream,
    initialEvent: ToolEvent
  ): Promise<void> {
    initialEvent.preventDefault()

    const glyphId = this.sceneModel.glyph?.glyphId
    if (!glyphId || !this.sceneModel.canEdit) {
      eventStream.done()
      return
    }

    const pointA = this.localPoint(initialEvent)
    let pointB = pointA
    let didDrag = false
    let intersections: CutCandidate[] = []

    for await (const event of asyncEventIterator(eventStream)) {
      event.preventDefault()
      const rawPoint = this.localPoint(event)
      pointB = event.shiftKey ? constrainHorVerDiag(pointA, rawPoint) : rawPoint
      if (!didDrag && BaseTool.shouldInitiateDrag(pointA, pointB)) {
        didDrag = true
      }
      intersections = this.findIntersections(glyphId, pointA, pointB)
      this.sceneModel.knifeLine = {
        x1: pointA.x,
        y1: pointA.y,
        x2: pointB.x,
        y2: pointB.y,
        intersections: intersections.map((cut) => cut.point),
      }
      this.canvasController.requestUpdate()
    }

    this.sceneModel.knifeLine = undefined
    if (didDrag && intersections.length > 0) {
      this.applyCuts(glyphId, intersections)
    }
    this.canvasController.requestUpdate()
  }

  private applyCuts(glyphId: string, cuts: CutCandidate[]) {
    const store = useStore.getState()
    const insertedSelections: string[] = []

    const orderedCuts = [...cuts]
      .filter((cut) => cut.endIndex > cut.startIndex)
      .sort((a, b) => b.startIndex - a.startIndex)

    for (const cut of orderedCuts) {
      const inserted = this.createNode(cut.point.x, cut.point.y, 'corner')
      const replacement =
        cut.type === 'line'
          ? [cut.segmentNodes[0], inserted, cut.segmentNodes.at(-1)!]
          : this.splitCurve(cut, inserted)

      store.replacePathNodes(
        glyphId,
        cut.pathId,
        cut.startNodeId,
        cut.endNodeId,
        replacement
      )
      insertedSelections.push(`${cut.pathId}:${inserted.id}`)
    }

    if (insertedSelections.length > 0) {
      store.setSelectedNodeIds(insertedSelections)
    }
  }

  private findIntersections(
    glyphId: string,
    pointA: { x: number; y: number },
    pointB: { x: number; y: number }
  ) {
    const glyph = useStore.getState().fontData?.glyphs[glyphId]
    if (!glyph) {
      return []
    }

    const cuts: CutCandidate[] = []
    for (const path of glyph.paths) {
      for (const segment of iterPathSegments(path)) {
        const cut = this.findSegmentIntersection(segment, pointA, pointB)
        if (cut) {
          cuts.push(cut)
        }
      }
    }

    return cuts
  }

  private findSegmentIntersection(
    segment: PathSegment,
    lineA: { x: number; y: number },
    lineB: { x: number; y: number }
  ): CutCandidate | null {
    if (segment.type === 'line') {
      const hit = lineIntersection(
        lineA,
        lineB,
        segment.nodes[0],
        segment.nodes[1]
      )
      if (!hit || hit.tSegment <= 0.02 || hit.tSegment >= 0.98) {
        return null
      }
      return {
        ...segment,
        t: hit.tSegment,
        point: hit.point,
        segmentNodes: segment.nodes,
      }
    }

    const samples = sampleCurve(segment.nodes, segment.type)
    let bestHit: { point: { x: number; y: number }; tSegment: number } | null =
      null
    let bestLineT = Number.POSITIVE_INFINITY

    for (let index = 0; index < samples.length - 1; index += 1) {
      const hit = lineIntersection(
        lineA,
        lineB,
        samples[index].point,
        samples[index + 1].point
      )
      if (!hit || hit.tSegment < 0 || hit.tSegment > 1) {
        continue
      }
      if (hit.tLine < bestLineT) {
        bestLineT = hit.tLine
        bestHit = {
          point: hit.point,
          tSegment:
            samples[index].t +
            (samples[index + 1].t - samples[index].t) * hit.tSegment,
        }
      }
    }

    if (!bestHit || bestHit.tSegment <= 0.02 || bestHit.tSegment >= 0.98) {
      return null
    }

    return {
      ...segment,
      t: bestHit.tSegment,
      point: bestHit.point,
      segmentNodes: segment.nodes,
    }
  }

  private splitCurve(cut: CutCandidate, inserted: PathNode): PathNode[] {
    const nodes = cut.segmentNodes
    const t = cut.t

    if (cut.type === 'quad' && nodes.length === 3) {
      const q0 = lerpPoint(nodes[0], nodes[1], t)
      const q1 = lerpPoint(nodes[1], nodes[2], t)
      return [
        { ...nodes[0], type: 'smooth' },
        this.createNode(q0.x, q0.y, 'qcurve'),
        {
          ...inserted,
          x: Math.round(cut.point.x),
          y: Math.round(cut.point.y),
          type: 'smooth',
        },
        this.createNode(q1.x, q1.y, 'qcurve'),
        { ...nodes[2], type: 'smooth' },
      ]
    }

    if (cut.type === 'cubic' && nodes.length === 4) {
      const q0 = lerpPoint(nodes[0], nodes[1], t)
      const q1 = lerpPoint(nodes[1], nodes[2], t)
      const q2 = lerpPoint(nodes[2], nodes[3], t)
      const r0 = lerpPoint(q0, q1, t)
      const r1 = lerpPoint(q1, q2, t)
      return [
        { ...nodes[0], type: 'smooth' },
        this.createNode(q0.x, q0.y, 'offcurve'),
        this.createNode(r0.x, r0.y, 'offcurve'),
        {
          ...inserted,
          x: Math.round(cut.point.x),
          y: Math.round(cut.point.y),
          type: 'smooth',
        },
        this.createNode(r1.x, r1.y, 'offcurve'),
        this.createNode(q2.x, q2.y, 'offcurve'),
        { ...nodes[3], type: 'smooth' },
      ]
    }

    return [nodes[0], inserted, nodes.at(-1)!]
  }

  private createNode(x: number, y: number, type: PathNode['type']): PathNode {
    return {
      id: `node_${Math.random().toString(36).slice(2, 10)}`,
      x: Math.round(x),
      y: Math.round(y),
      type,
    }
  }
}

interface PathSegment {
  pathId: string
  startNodeId: string
  endNodeId: string
  startIndex: number
  endIndex: number
  nodes: PathNode[]
  type: 'line' | 'quad' | 'cubic'
}

function* iterPathSegments(path: PathData): Generator<PathSegment> {
  const nodes = path.nodes
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const startNode = nodes[index]
    if (!isOnCurve(startNode)) {
      continue
    }

    let endIndex = index + 1
    while (endIndex < nodes.length && !isOnCurve(nodes[endIndex])) {
      endIndex += 1
    }
    if (endIndex >= nodes.length) {
      break
    }

    const segmentNodes = nodes.slice(index, endIndex + 1)
    const type =
      segmentNodes.length === 4
        ? 'cubic'
        : segmentNodes.length === 3
          ? 'quad'
          : 'line'

    yield {
      pathId: path.id,
      startNodeId: startNode.id,
      endNodeId: nodes[endIndex].id,
      startIndex: index,
      endIndex,
      nodes: segmentNodes,
      type,
    }
  }
}

function isOnCurve(node: PathNode) {
  return node.type === 'corner' || node.type === 'smooth'
}

function constrainHorVerDiag(
  origin: { x: number; y: number },
  point: { x: number; y: number }
) {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  if (Math.abs(dx) > Math.abs(dy) * 2) {
    return { x: point.x, y: origin.y }
  }
  if (Math.abs(dy) > Math.abs(dx) * 2) {
    return { x: origin.x, y: point.y }
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: origin.x + Math.sign(dx || 1) * size,
    y: origin.y + Math.sign(dy || 1) * size,
  }
}

function lineIntersection(
  lineA: { x: number; y: number },
  lineB: { x: number; y: number },
  segA: { x: number; y: number },
  segB: { x: number; y: number }
) {
  const lineDx = lineB.x - lineA.x
  const lineDy = lineB.y - lineA.y
  const segDx = segB.x - segA.x
  const segDy = segB.y - segA.y
  const denominator = lineDx * segDy - lineDy * segDx
  if (Math.abs(denominator) < 0.0001) {
    return null
  }

  const tLine =
    ((segA.x - lineA.x) * segDy - (segA.y - lineA.y) * segDx) / denominator
  const tSegment =
    ((segA.x - lineA.x) * lineDy - (segA.y - lineA.y) * lineDx) / denominator

  if (tLine < 0 || tLine > 1 || tSegment < 0 || tSegment > 1) {
    return null
  }

  return {
    tLine,
    tSegment,
    point: {
      x: lineA.x + lineDx * tLine,
      y: lineA.y + lineDy * tLine,
    },
  }
}

function sampleCurve(nodes: PathNode[], type: 'quad' | 'cubic') {
  const steps = type === 'quad' ? 32 : 48
  const samples: Array<{ t: number; point: { x: number; y: number } }> = []
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    samples.push({
      t,
      point:
        type === 'quad'
          ? quadraticAt(nodes[0], nodes[1], nodes[2], t)
          : cubicAt(nodes[0], nodes[1], nodes[2], nodes[3], t),
    })
  }
  return samples
}

function lerpPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number
) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

function quadraticAt(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
) {
  const q0 = lerpPoint(p0, p1, t)
  const q1 = lerpPoint(p1, p2, t)
  return lerpPoint(q0, q1, t)
}

function cubicAt(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) {
  const q0 = lerpPoint(p0, p1, t)
  const q1 = lerpPoint(p1, p2, t)
  const q2 = lerpPoint(p2, p3, t)
  const r0 = lerpPoint(q0, q1, t)
  const r1 = lerpPoint(q1, q2, t)
  return lerpPoint(r0, r1, t)
}

async function* asyncEventIterator(
  eventStream: EventStream
): AsyncGenerator<ToolEvent, void, unknown> {
  while (true) {
    const event = await eventStream.next()
    if (event === undefined) {
      break
    }
    yield event
  }
}
