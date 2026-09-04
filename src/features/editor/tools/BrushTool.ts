// Brush tool - pressure-sensitive freehand drawing as editable vector outlines.

import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from '@/features/editor/tools/BaseTool'
import { asyncEventIterator } from '@/features/editor/tools/toolPrimitives'
import {
  appendBrushSample,
  buildVectorBrushOutline,
  clampPressure,
  DEFAULT_BRUSH_SETTINGS,
  normalizeBrushSettings,
  type BrushPoint,
  type BrushSample,
  type BrushSettings,
} from '@/features/editor/tools/vectorBrush'
import type { PathData, PathNode } from '@/domain'
import { useStore } from '@/store'

export class BrushTool extends BaseTool {
  identifier = 'brush'
  private settings: BrushSettings = DEFAULT_BRUSH_SETTINGS

  setSettings(settings: Partial<BrushSettings>): void {
    this.settings = normalizeBrushSettings({ ...this.settings, ...settings })
  }

  override activate(): void {
    this.setCursor('crosshair')
    this.canvasController.requestUpdate()
  }

  override deactivate(): void {
    super.deactivate()
    this.sceneModel.brushPreviewPath = undefined
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

    const glyphId = this.sceneModel.glyph?.glyphId
    if (!this.sceneModel.canEdit || !glyphId) {
      eventStream.done()
      return
    }

    let samples = [this.toSample(initialEvent)]
    this.updatePreview(samples)

    for await (const event of asyncEventIterator(eventStream)) {
      event.preventDefault()
      samples = appendBrushSample(samples, this.toSample(event))
      this.updatePreview(samples)
    }

    this.sceneModel.brushPreviewPath = undefined
    const path = this.buildPath(samples)
    const store = useStore.getState()
    store.createPath(glyphId, path)
    store.setSelectedNodeIds(path.nodes.map((node) => `${path.id}:${node.id}`))
    this.canvasController.requestUpdate()
  }

  private toSample(event: ToolEvent): BrushSample {
    const point = this.localPoint(event)
    return {
      ...point,
      // Mouse pointer events conventionally report 0.5. This provides a
      // predictable medium stroke while pen events preserve their real value.
      pressure: this.settings.pressureEnabled
        ? clampPressure(event.pressure)
        : 0.5,
    }
  }

  private updatePreview(samples: BrushSample[]) {
    const path = this.buildPath(samples)
    this.sceneModel.brushPreviewPath = this.toPath2D(path.nodes)
    this.canvasController.requestUpdate()
  }

  private buildPath(samples: BrushSample[]): PathData {
    const pathId = this.generateId('path')
    if (samples.length < 2) {
      return {
        id: pathId,
        closed: true,
        nodes: this.buildDotNodes(samples[0]!),
      }
    }

    const outline = buildVectorBrushOutline(
      samples,
      this.settings.size,
      this.settings.style
    )
    return {
      id: pathId,
      closed: true,
      nodes: outline.map((point) => this.createLineNode(point)),
    }
  }

  private buildDotNodes(sample: BrushSample): PathNode[] {
    const radius =
      (this.settings.size / 2) * (0.2 + clampPressure(sample.pressure) * 0.8)
    const kappa = 0.5522847498307936
    const handle = radius * kappa
    const smoothNode = (x: number, y: number): PathNode => ({
      id: this.generateId('node'),
      x: Math.round(x),
      y: Math.round(y),
      kind: 'oncurve',
      segmentType: 'cubic',
      smooth: true,
    })
    const handleNode = (x: number, y: number): PathNode => ({
      id: this.generateId('node'),
      x: Math.round(x),
      y: Math.round(y),
      kind: 'offcurve',
    })
    const { x, y } = sample
    return [
      smoothNode(x + radius, y),
      handleNode(x + radius, y + handle),
      handleNode(x + handle, y + radius),
      smoothNode(x, y + radius),
      handleNode(x - handle, y + radius),
      handleNode(x - radius, y + handle),
      smoothNode(x - radius, y),
      handleNode(x - radius, y - handle),
      handleNode(x - handle, y - radius),
      smoothNode(x, y - radius),
      handleNode(x + handle, y - radius),
      handleNode(x + radius, y - handle),
    ]
  }

  private createLineNode(point: BrushPoint): PathNode {
    return {
      id: this.generateId('node'),
      x: Math.round(point.x),
      y: Math.round(point.y),
      kind: 'oncurve',
      segmentType: 'line',
      smooth: false,
    }
  }

  private toPath2D(nodes: PathNode[]): Path2D {
    const path = new Path2D()
    const first = nodes.find((node) => node.kind === 'oncurve')
    if (!first) return path

    path.moveTo(first.x, first.y)
    const firstIndex = nodes.indexOf(first)
    const orderedNodes = [
      ...nodes.slice(firstIndex + 1),
      ...nodes.slice(0, firstIndex + 1),
    ]
    let handles: PathNode[] = []
    for (const node of orderedNodes) {
      if (node.kind === 'offcurve') {
        handles.push(node)
        continue
      }
      if (handles.length === 2) {
        path.bezierCurveTo(
          handles[0]!.x,
          handles[0]!.y,
          handles[1]!.x,
          handles[1]!.y,
          node.x,
          node.y
        )
      } else {
        path.lineTo(node.x, node.y)
      }
      handles = []
    }
    path.closePath()
    return path
  }

  private generateId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
  }
}
