// 場景控制器 - 管理編輯狀態和互動

import type { CanvasController } from 'src/canvas/CanvasController'
import type { PathHitInfo, Point, SceneModel } from 'src/canvas/SceneView'
import {
  getOnCurveContourPointSelection,
  parsePointSelection,
  pointSelectionKey,
} from 'src/lib/glyphSelection'
import { PointerTool } from 'src/features/editor/tools/PointerTool'
import { PenTool } from 'src/features/editor/tools/PenTool'
import { BrushTool } from 'src/features/editor/tools/BrushTool'
import { HandTool } from 'src/features/editor/tools/HandTool'
import { TextTool } from 'src/features/editor/tools/TextTool'
import { EllipseTool, RectangleTool } from 'src/features/editor/tools/ShapeTool'
import { KnifeTool } from 'src/features/editor/tools/KnifeTool'
import type { BaseTool, ToolEvent } from 'src/features/editor/tools/BaseTool'

export interface SceneControllerOptions {
  canvasController: CanvasController
  model: SceneModel
  onSelectionChange?: (selection: Set<string>) => void
  onSelectedPathHitChange?: (pathHit?: PathHitInfo) => void
  onUpdateNodePosition?: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    newPos: { x: number; y: number }
  ) => void
  onCommitNodePositions?: (
    glyphId: string,
    updates: Array<{
      pathId: string
      nodeId: string
      newPos: { x: number; y: number }
    }>
  ) => void
  onUpdateNodeType?: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    type: 'corner' | 'smooth'
  ) => void
  onPreviewGlyphMetrics?: (
    glyphId: string,
    metrics: { lsb: number; rsb: number; width: number }
  ) => void
  onClearPreviewGlyphMetrics?: (glyphId?: string) => void
}

export type HitTestResult =
  | { type: 'point' | 'handle'; pointIndex: number; selection: Set<string> }
  | {
      type: 'line-segment' | 'curve-segment'
      pathHit: PathHitInfo
      selection: Set<string>
    }
  | { type: 'contour-interior'; contourIndex: number; selection: Set<string> }
  | { type: 'empty'; selection: Set<string> }

type IndexedPoint = Point & { index: number }
export class SceneController {
  canvasController: CanvasController
  sceneModel: SceneModel

  selection: Set<string> = new Set()
  hoverSelection: Set<string> = new Set()
  selectedPathHit?: PathHitInfo
  hoverPathHit?: PathHitInfo

  mouseClickMargin = 10

  private tools: Map<string, BaseTool> = new Map()
  private activeTool: BaseTool | null = null
  activeToolIdentifier = 'pointer'
  private _eventStream: EventStreamImpl | null = null
  private readonly boundHandleMouseDown = this.handleMouseDown.bind(this)
  private readonly boundHandleMouseMove = this.handleMouseMove.bind(this)
  private readonly boundHandleMouseUp = this.handleMouseUp.bind(this)
  private readonly boundHandleDoubleClick = this.handleDoubleClick.bind(this)
  private readonly boundPreventContextMenu = (e: MouseEvent) =>
    e.preventDefault()
  private onSelectionChange: SceneControllerOptions['onSelectionChange']
  private onSelectedPathHitChange: SceneControllerOptions['onSelectedPathHitChange']
  onUpdateNodePosition: SceneControllerOptions['onUpdateNodePosition']
  onCommitNodePositions: SceneControllerOptions['onCommitNodePositions']
  onUpdateNodeType: SceneControllerOptions['onUpdateNodeType']
  onPreviewGlyphMetrics: SceneControllerOptions['onPreviewGlyphMetrics']
  onClearPreviewGlyphMetrics: SceneControllerOptions['onClearPreviewGlyphMetrics']

  constructor(options: SceneControllerOptions) {
    this.canvasController = options.canvasController
    this.sceneModel = options.model
    this.onSelectionChange = options.onSelectionChange
    this.onSelectedPathHitChange = options.onSelectedPathHitChange
    this.onUpdateNodePosition = options.onUpdateNodePosition
    this.onCommitNodePositions = options.onCommitNodePositions
    this.onUpdateNodeType = options.onUpdateNodeType
    this.onPreviewGlyphMetrics = options.onPreviewGlyphMetrics
    this.onClearPreviewGlyphMetrics = options.onClearPreviewGlyphMetrics

    this.tools.set(
      'pointer',
      new PointerTool(this.canvasController, this, this.sceneModel)
    )
    this.tools.set(
      'pen',
      new PenTool(this.canvasController, this, this.sceneModel)
    )
    this.tools.set(
      'brush',
      new BrushTool(this.canvasController, this, this.sceneModel)
    )
    this.tools.set(
      'shape-rect',
      new RectangleTool(this.canvasController, this, this.sceneModel)
    )
    this.tools.set(
      'shape-ellipse',
      new EllipseTool(this.canvasController, this, this.sceneModel)
    )
    this.tools.set(
      'knife',
      new KnifeTool(this.canvasController, this, this.sceneModel)
    )
    this.tools.set(
      'hand',
      new HandTool(this.canvasController, this, this.sceneModel)
    )
    this.tools.set(
      'text',
      new TextTool(this.canvasController, this, this.sceneModel)
    )

    this.sceneModel.activeToolIdentifier = 'pointer'
    this.setActiveTool('pointer')
    this.bindEvents()
  }

  setActiveTool(toolName: string) {
    if (this.activeTool) {
      this.activeTool.deactivate()
    }

    this.sceneModel.selectionRect = undefined
    this.sceneModel.selectionTransformBounds = undefined
    this.setHoverSelection(new Set())
    this.setHoverPathHit(undefined)

    this.activeTool = this.tools.get(toolName) || null
    if (this.activeTool) {
      this.activeToolIdentifier = toolName
      this.sceneModel.activeToolIdentifier = toolName
      this.activeTool.activate()
    }
    this.canvasController.requestUpdate()
  }

  setSelection(selection: Set<string>) {
    this.selection = new Set(selection)
    this.sceneModel.selection = new Set(selection)
    this.onSelectionChange?.(selection)
  }

  previewSelection(selection: Set<string>) {
    this.selection = new Set(selection)
    this.sceneModel.selection = new Set(selection)
  }

  setHoverSelection(selection: Set<string>) {
    this.hoverSelection = new Set(selection)
    this.sceneModel.hoverSelection = new Set(selection)
  }

  setSelectedPathHit(pathHit?: PathHitInfo) {
    this.selectedPathHit = pathHit
    this.sceneModel.selectedPathHit = pathHit
    this.onSelectedPathHitChange?.(pathHit)
  }

  setHoverPathHit(pathHit?: PathHitInfo) {
    this.hoverPathHit = pathHit
    this.sceneModel.hoverPathHit = pathHit
  }

  private bindEvents() {
    const canvas = this.canvasController.canvas
    canvas.addEventListener('mousedown', this.boundHandleMouseDown)
    canvas.addEventListener('mousemove', this.boundHandleMouseMove)
    canvas.addEventListener('mouseup', this.boundHandleMouseUp)
    canvas.addEventListener('dblclick', this.boundHandleDoubleClick)
    canvas.addEventListener('contextmenu', this.boundPreventContextMenu)
  }

  destroy() {
    const canvas = this.canvasController.canvas
    canvas.removeEventListener('mousedown', this.boundHandleMouseDown)
    canvas.removeEventListener('mousemove', this.boundHandleMouseMove)
    canvas.removeEventListener('mouseup', this.boundHandleMouseUp)
    canvas.removeEventListener('dblclick', this.boundHandleDoubleClick)
    canvas.removeEventListener('contextmenu', this.boundPreventContextMenu)
    this._eventStream?.end()
    this._eventStream = null
  }

  private handleMouseDown(event: MouseEvent) {
    if (!this.activeTool) return
    if (event.button !== 0) return

    const toolEvent = this.mouseEventToToolEvent(event)
    this._eventStream = new EventStreamImpl()
    this.activeTool
      .handleDrag(this._eventStream, toolEvent)
      .catch(console.error)
  }

  private handleMouseMove(event: MouseEvent) {
    if (!this.activeTool) return

    const toolEvent = this.mouseEventToToolEvent(event)
    if (this._eventStream && !this._eventStream.done_) {
      this._eventStream.push(toolEvent)
    } else {
      this.activeTool.handleHover(toolEvent)
    }
  }

  private handleMouseUp() {
    if (this._eventStream) {
      this._eventStream.end()
      this._eventStream = null
    }
  }

  private handleDoubleClick() {
    // handled in mousedown via detail
  }

  private mouseEventToToolEvent(event: MouseEvent): ToolEvent {
    const rect = this.canvasController.canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pageX: event.pageX,
      pageY: event.pageY,
      detail: event.detail,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      preventDefault: () => event.preventDefault(),
    }
  }

  localPoint(event: { pageX: number; pageY: number }): {
    x: number
    y: number
  } {
    return this.canvasController.localPoint({ x: event.pageX, y: event.pageY })
  }

  hitTestAtPoint(
    point: { x: number; y: number },
    size: number,
    currentSelection: Set<string> = this.selection
  ): HitTestResult {
    const glyph = this.sceneModel.glyph
    const path = glyph?.glyph.path
    if (!path) {
      return { type: 'empty', selection: new Set() }
    }
    const threshold = size / this.canvasController.magnification
    const selectedPointHit = this.findPointHit(
      point,
      threshold,
      currentSelection,
      path
    )
    if (selectedPointHit) {
      return selectedPointHit
    }

    const anyPointHit = this.findPointHit(point, threshold, undefined, path)
    if (anyPointHit) {
      return anyPointHit
    }

    const pathHit = this.pathHitAtPoint(point, size)
    if (pathHit) {
      return {
        type:
          pathHit.segment.type === 'line' ? 'line-segment' : 'curve-segment',
        pathHit,
        selection: new Set(),
      }
    }

    const contourInterior = this.contourSelectionAtPoint(point)
    if (contourInterior) {
      return contourInterior
    }

    return { type: 'empty', selection: new Set() }
  }

  selectionAtPoint(
    point: { x: number; y: number },
    size: number,
    currentSelection: Set<string>
  ): { selection: Set<string>; pathHit?: PathHitInfo } {
    const hit = this.hitTestAtPoint(point, size, currentSelection)
    if (hit.type === 'line-segment' || hit.type === 'curve-segment') {
      return { selection: hit.selection, pathHit: hit.pathHit }
    }
    return { selection: hit.selection }
  }

  pathHitAtPoint(
    point: { x: number; y: number },
    size: number
  ): PathHitInfo | null {
    const glyph = this.sceneModel.glyph
    const path = glyph?.glyph.path
    if (!path?.iterContourSegments) {
      return null
    }

    const threshold = size / this.canvasController.magnification
    let bestHit: PathHitInfo | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (
      let contourIndex = 0;
      contourIndex < path.numContours;
      contourIndex += 1
    ) {
      for (const segment of path.iterContourSegments(contourIndex)) {
        const nearest = this.nearestPointOnSegment(point, segment.points)
        if (
          !nearest ||
          nearest.distance > threshold ||
          nearest.distance >= bestDistance
        ) {
          continue
        }

        bestDistance = nearest.distance
        bestHit = {
          segment: {
            points: segment.points,
            pointIndices: segment.pointIndices,
            type: segment.type,
            contourIndex,
            key: this.segmentKey(contourIndex, segment.pointIndices),
          },
          x: nearest.point.x,
          y: nearest.point.y,
        }
      }
    }

    return bestHit
  }

  private contourSelectionAtPoint(point: {
    x: number
    y: number
  }): Extract<HitTestResult, { type: 'contour-interior' }> | null {
    const path = this.sceneModel.glyph?.glyph.path
    if (
      !path ||
      !this.canvasController.context ||
      !path.contourInfo ||
      !path.contourToPath2D
    ) {
      return null
    }

    for (
      let contourIndex = path.numContours - 1;
      contourIndex >= 0;
      contourIndex -= 1
    ) {
      const contourPath = path.contourToPath2D(contourIndex)
      if (
        !this.canvasController.context.isPointInPath(
          contourPath,
          point.x,
          point.y
        )
      ) {
        continue
      }

      const selection = new Set<string>()
      const contourSelection = getOnCurveContourPointSelection(
        path,
        contourIndex
      )
      for (const key of contourSelection) {
        selection.add(key)
      }

      return { type: 'contour-interior', contourIndex, selection }
    }

    return null
  }

  private findPointHit(
    point: { x: number; y: number },
    threshold: number,
    selection: Set<string> | undefined,
    path: { iterPoints(): Generator<IndexedPoint, void> }
  ): Extract<HitTestResult, { type: 'point' | 'handle' }> | null {
    if (selection?.size) {
      for (const index of parsePointSelection(selection)) {
        const hitPoint = this.getPointByIndex(path, index)
        if (!hitPoint) continue
        if (distance(point, hitPoint) <= threshold) {
          return {
            type: hitPoint.type === 'onCurve' ? 'point' : 'handle',
            pointIndex: hitPoint.index,
            selection: new Set([pointSelectionKey(hitPoint.index)]),
          }
        }
      }
    }

    for (const hitPoint of path.iterPoints()) {
      if (distance(point, hitPoint) <= threshold) {
        return {
          type: hitPoint.type === 'onCurve' ? 'point' : 'handle',
          pointIndex: hitPoint.index,
          selection: new Set([pointSelectionKey(hitPoint.index)]),
        }
      }
    }

    return null
  }

  private nearestPointOnSegment(
    point: { x: number; y: number },
    points: { x: number; y: number }[]
  ): { point: { x: number; y: number }; distance: number } | null {
    if (points.length < 2) {
      return null
    }
    if (points.length === 2) {
      return this.projectPointToLineSegment(point, points[0], points[1])
    }

    const steps = points.length === 3 ? 24 : 32
    let bestPoint = points[0]
    let bestDistance = Number.POSITIVE_INFINITY

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const sample =
        points.length === 3
          ? quadraticAt(points[0], points[1], points[2], t)
          : cubicAt(points[0], points[1], points[2], points[3], t)
      const sampleDistance = distance(point, sample)
      if (sampleDistance < bestDistance) {
        bestDistance = sampleDistance
        bestPoint = sample
      }
    }

    return { point: bestPoint, distance: bestDistance }
  }

  private projectPointToLineSegment(
    point: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ) {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    if (dx === 0 && dy === 0) {
      return { point: p1, distance: distance(point, p1) }
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (dx * dx + dy * dy)
      )
    )
    const projected = { x: p1.x + t * dx, y: p1.y + t * dy }
    return { point: projected, distance: distance(point, projected) }
  }

  private segmentKey(contourIndex: number, pointIndices: number[]): string {
    return `${contourIndex}:${pointIndices.join('-')}`
  }

  private getPointByIndex(
    path: { iterPoints(): Generator<IndexedPoint, void> },
    index: number
  ): IndexedPoint | null {
    for (const pt of path.iterPoints()) {
      if (pt.index === index) {
        return pt
      }
    }
    return null
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function quadraticAt(p0: Point, p1: Point, p2: Point, t: number) {
  const inv = 1 - t
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  }
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number) {
  const inv = 1 - t
  return {
    x:
      inv * inv * inv * p0.x +
      3 * inv * inv * t * p1.x +
      3 * inv * t * t * p2.x +
      t * t * t * p3.x,
    y:
      inv * inv * inv * p0.y +
      3 * inv * inv * t * p1.y +
      3 * inv * t * t * p2.y +
      t * t * t * p3.y,
  }
}

class EventStreamImpl {
  private events: ToolEvent[] = []
  private resolvers: ((event: ToolEvent | undefined) => void)[] = []
  done_ = false

  push(event: ToolEvent) {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!
      resolve(event)
    } else {
      this.events.push(event)
    }
  }

  end() {
    this.done_ = true
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!
      resolve(undefined)
    }
  }

  async next(): Promise<ToolEvent | undefined> {
    if (this.events.length > 0) {
      return this.events.shift()
    }
    if (this.done_) {
      return undefined
    }
    return new Promise((resolve) => {
      this.resolvers.push(resolve)
    })
  }

  done() {
    this.end()
  }
}
