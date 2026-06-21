// Brush tool - freehand drawing, smoothed into cubic Béziers

import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from 'src/features/editor/tools/BaseTool'
import { asyncEventIterator } from 'src/features/editor/tools/toolPrimitives'
import {
  useStore,
  type PathData,
  type PathNode,
  type PathSegmentType,
} from 'src/store'
import { fitCurve } from 'src/font/fitCurve'

// Squared distance tolerance (font units) for the freehand curve fit.
const FIT_TOLERANCE = 10
type NodeRole = 'corner' | 'smooth' | 'offcurve'

export class BrushTool extends BaseTool {
  identifier = 'brush'

  override activate(): void {
    this.setCursor('crosshair')
    this.canvasController.requestUpdate()
  }

  handleHover(event: ToolEvent): void {
    void event
    this.setCursor('crosshair')
  }

  async handleDrag(
    eventStream: EventStream,
    initialEvent: ToolEvent
  ): Promise<void> {
    initialEvent.preventDefault()

    if (!this.sceneModel.canEdit || !this.sceneModel.glyph?.glyphId) {
      eventStream.done()
      return
    }

    const glyphId = this.sceneModel.glyph.glyphId
    const points = [this.localPoint(initialEvent)]

    for await (const event of asyncEventIterator(eventStream)) {
      const point = this.localPoint(event)
      const previous = points.at(-1)!
      if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 8) {
        points.push(point)
      }
    }

    if (points.length === 1) {
      points.push({ ...points[0] })
    }

    const pathId = this.generateId('path')
    const node = (
      point: { x: number; y: number },
      type: NodeRole,
      segmentType: PathSegmentType = 'line'
    ): PathNode => {
      const base = {
        id: this.generateId('node'),
        x: Math.round(point.x),
        y: Math.round(point.y),
      }
      if (type === 'offcurve') {
        return { ...base, kind: 'offcurve' }
      }
      return {
        ...base,
        kind: 'oncurve',
        segmentType,
        smooth: type === 'smooth',
      }
    }

    const segments = fitCurve(points, FIT_TOLERANCE * FIT_TOLERANCE)
    const nodes: PathNode[] = []
    if (segments.length) {
      nodes.push(node(segments[0].points[0], 'corner'))
      segments.forEach((segment, index) => {
        const [, control1, control2, end] = segment.points
        // Joins between segments are tangent-continuous, so mark them smooth;
        // the two outer endpoints stay corners.
        const isLast = index === segments.length - 1
        nodes.push(node(control1, 'offcurve'))
        nodes.push(node(control2, 'offcurve'))
        nodes.push(node(end, isLast ? 'corner' : 'smooth', 'cubic'))
      })
    } else {
      nodes.push(node(points[0], 'corner'))
    }

    const path: PathData = {
      id: pathId,
      closed: false,
      nodes,
    }

    const store = useStore.getState()
    store.createPath(glyphId, path)
    store.setSelectedNodeIds([`${pathId}:${nodes.at(-1)!.id}`])
    this.canvasController.requestUpdate()
  }

  private generateId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
  }
}
