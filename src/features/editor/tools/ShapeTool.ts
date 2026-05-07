import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from 'src/features/editor/tools/BaseTool'
import {
  useStore,
  type NodeType,
  type PathData,
  type PathNode,
} from 'src/store'

type ShapeKind = 'rect' | 'ellipse'

export class ShapeTool extends BaseTool {
  identifier = 'shape'
  kind: ShapeKind = 'rect'

  override activate(): void {
    this.setCursor('crosshair')
  }

  override deactivate(): void {
    super.deactivate()
    this.sceneModel.shapePreviewPath = undefined
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

    const anchorPoint = this.localPoint(initialEvent)
    let currentPoint = anchorPoint
    let didDrag = false
    let lastEvent = initialEvent

    for await (const event of asyncEventIterator(eventStream)) {
      event.preventDefault()
      lastEvent = event
      currentPoint = this.localPoint(event)
      if (!didDrag && BaseTool.shouldInitiateDrag(anchorPoint, currentPoint)) {
        didDrag = true
      }
      if (didDrag) {
        const rect = this.getRect(anchorPoint, currentPoint, event)
        this.sceneModel.shapePreviewPath = this.buildPreviewPath(rect)
        this.canvasController.requestUpdate()
      }
    }

    this.sceneModel.shapePreviewPath = undefined
    if (!didDrag) {
      this.canvasController.requestUpdate()
      return
    }

    const rect = this.getRect(anchorPoint, currentPoint, lastEvent)
    if (
      Math.abs(rect.xMax - rect.xMin) < 2 ||
      Math.abs(rect.yMax - rect.yMin) < 2
    ) {
      this.canvasController.requestUpdate()
      return
    }

    const path =
      this.kind === 'ellipse'
        ? this.buildEllipsePath(rect)
        : this.buildRectPath(rect)
    useStore.getState().createPath(glyphId, path)
    useStore
      .getState()
      .setSelectedNodeIds(path.nodes.map((node) => `${path.id}:${node.id}`))
    this.canvasController.requestUpdate()
  }

  private getRect(
    anchor: { x: number; y: number },
    pointer: { x: number; y: number },
    event: Pick<ToolEvent, 'shiftKey' | 'altKey'>
  ) {
    let dx = pointer.x - anchor.x
    let dy = pointer.y - anchor.y

    if (event.shiftKey) {
      const size = Math.max(Math.abs(dx), Math.abs(dy))
      dx = Math.sign(dx || 1) * size
      dy = Math.sign(dy || 1) * size
    }

    const x1 = event.altKey ? anchor.x - dx : anchor.x
    const y1 = event.altKey ? anchor.y - dy : anchor.y
    const x2 = event.altKey ? anchor.x + dx : anchor.x + dx
    const y2 = event.altKey ? anchor.y + dy : anchor.y + dy

    return {
      xMin: Math.round(Math.min(x1, x2)),
      yMin: Math.round(Math.min(y1, y2)),
      xMax: Math.round(Math.max(x1, x2)),
      yMax: Math.round(Math.max(y1, y2)),
    }
  }

  private buildPreviewPath(rect: Rect) {
    const path = new Path2D()
    if (this.kind === 'ellipse') {
      path.ellipse(
        rect.xMin + (rect.xMax - rect.xMin) / 2,
        rect.yMin + (rect.yMax - rect.yMin) / 2,
        Math.abs(rect.xMax - rect.xMin) / 2,
        Math.abs(rect.yMax - rect.yMin) / 2,
        0,
        0,
        Math.PI * 2
      )
    } else {
      path.rect(
        rect.xMin,
        rect.yMin,
        rect.xMax - rect.xMin,
        rect.yMax - rect.yMin
      )
    }
    return path
  }

  private buildRectPath(rect: Rect): PathData {
    const pathId = this.generateId('path')
    return {
      id: pathId,
      closed: true,
      nodes: [
        this.createNode(rect.xMin, rect.yMin, 'corner'),
        this.createNode(rect.xMax, rect.yMin, 'corner'),
        this.createNode(rect.xMax, rect.yMax, 'corner'),
        this.createNode(rect.xMin, rect.yMax, 'corner'),
      ],
    }
  }

  private buildEllipsePath(rect: Rect): PathData {
    const kappa = 0.5522847498307936
    const cx = rect.xMin + (rect.xMax - rect.xMin) / 2
    const cy = rect.yMin + (rect.yMax - rect.yMin) / 2
    const rx = Math.abs(rect.xMax - rect.xMin) / 2
    const ry = Math.abs(rect.yMax - rect.yMin) / 2
    const ox = rx * kappa
    const oy = ry * kappa

    return {
      id: this.generateId('path'),
      closed: true,
      nodes: [
        this.createNode(cx + rx, cy, 'smooth'),
        this.createNode(cx + rx, cy + oy, 'offcurve'),
        this.createNode(cx + ox, cy + ry, 'offcurve'),
        this.createNode(cx, cy + ry, 'smooth'),
        this.createNode(cx - ox, cy + ry, 'offcurve'),
        this.createNode(cx - rx, cy + oy, 'offcurve'),
        this.createNode(cx - rx, cy, 'smooth'),
        this.createNode(cx - rx, cy - oy, 'offcurve'),
        this.createNode(cx - ox, cy - ry, 'offcurve'),
        this.createNode(cx, cy - ry, 'smooth'),
        this.createNode(cx + ox, cy - ry, 'offcurve'),
        this.createNode(cx + rx, cy - oy, 'offcurve'),
      ],
    }
  }

  private createNode(x: number, y: number, type: NodeType): PathNode {
    return {
      id: this.generateId('node'),
      x: Math.round(x),
      y: Math.round(y),
      type,
    }
  }

  private generateId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
  }
}

export class RectangleTool extends ShapeTool {
  override identifier = 'shape-rect'
  override kind: ShapeKind = 'rect'
}

export class EllipseTool extends ShapeTool {
  override identifier = 'shape-ellipse'
  override kind: ShapeKind = 'ellipse'
}

interface Rect {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
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
