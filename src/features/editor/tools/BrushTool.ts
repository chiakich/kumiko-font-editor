// Brush tool - freehand polyline drawing

import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from 'src/features/editor/tools/BaseTool'
import { useStore, type PathData, type PathNode } from 'src/store'

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
    const nodes: PathNode[] = points.map((point) => ({
      id: this.generateId('node'),
      x: Math.round(point.x),
      y: Math.round(point.y),
      type: 'corner',
    }))

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
