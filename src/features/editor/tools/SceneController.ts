// 場景控制器 - 管理編輯狀態和互動

import { Bezier } from 'bezier-js'
import type { CanvasController } from '@/sceneView/CanvasController'
import type { PathHitInfo, Point, SceneModel } from '@/sceneView/SceneView'
import {
  getOnCurveContourPointSelection,
  parsePointSelection,
  pointSelectionKey,
} from '@/lib/glyph/glyphSelection'
import { PointerTool } from '@/features/editor/tools/PointerTool'
import { PenTool } from '@/features/editor/tools/PenTool'
import { BrushTool } from '@/features/editor/tools/BrushTool'
import { HandTool } from '@/features/editor/tools/HandTool'
import { TextTool } from '@/features/editor/tools/TextTool'
import { EllipseTool, RectangleTool } from '@/features/editor/tools/ShapeTool'
import { KnifeTool } from '@/features/editor/tools/KnifeTool'
import { PowerRulerTool } from '@/features/editor/tools/PowerRulerTool'
import type { BaseTool, ToolEvent } from '@/features/editor/tools/BaseTool'
import type { BrushSettings } from '@/features/editor/tools/vectorBrush'

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
  private readonly boundHandlePointerDown = this.handlePointerDown.bind(this)
  private readonly boundHandlePointerMove = this.handlePointerMove.bind(this)
  private readonly boundHandlePointerUp = this.handlePointerUp.bind(this)
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
  private activePointerId: number | null = null

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
      'ruler',
      new PowerRulerTool(this.canvasController, this, this.sceneModel)
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

  setBrushSettings(settings: Partial<BrushSettings>) {
    const brushTool = this.tools.get('brush')
    if (brushTool instanceof BrushTool) {
      brushTool.setSettings(settings)
      this.canvasController.requestUpdate()
    }
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
    canvas.addEventListener('pointerdown', this.boundHandlePointerDown)
    canvas.addEventListener('pointermove', this.boundHandlePointerMove)
    canvas.addEventListener('pointerup', this.boundHandlePointerUp)
    canvas.addEventListener('pointercancel', this.boundHandlePointerUp)
    canvas.addEventListener('dblclick', this.boundHandleDoubleClick)
    canvas.addEventListener('contextmenu', this.boundPreventContextMenu)
  }

  destroy() {
    const canvas = this.canvasController.canvas
    canvas.removeEventListener('pointerdown', this.boundHandlePointerDown)
    canvas.removeEventListener('pointermove', this.boundHandlePointerMove)
    canvas.removeEventListener('pointerup', this.boundHandlePointerUp)
    canvas.removeEventListener('pointercancel', this.boundHandlePointerUp)
    canvas.removeEventListener('dblclick', this.boundHandleDoubleClick)
    canvas.removeEventListener('contextmenu', this.boundPreventContextMenu)
    this._eventStream?.end()
    this._eventStream = null
  }

  private handlePointerDown(event: PointerEvent) {
    if (!this.activeTool) return
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      this.activePointerId !== null
    ) {
      return
    }

    event.preventDefault()
    this.activePointerId = event.pointerId
    this.canvasController.canvas.setPointerCapture(event.pointerId)
    const toolEvent = this.pointerEventToToolEvent(event)
    this._eventStream = new EventStreamImpl()
    this.activeTool
      .handleDrag(this._eventStream, toolEvent)
      .catch(console.error)
  }

  private handlePointerMove(event: PointerEvent) {
    if (!this.activeTool) return

    if (this._eventStream && !this._eventStream.done_) {
      if (event.pointerId !== this.activePointerId) return
      event.preventDefault()
      const coalesced = event.getCoalescedEvents?.() ?? []
      const events = coalesced.length > 0 ? coalesced : [event]
      for (const pointerEvent of events) {
        this._eventStream.push(this.pointerEventToToolEvent(pointerEvent))
      }
    } else {
      this.activeTool.handleHover(this.pointerEventToToolEvent(event))
    }
  }

  private handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== this.activePointerId) return
    event.preventDefault()
    if (this._eventStream) {
      this._eventStream.push(this.pointerEventToToolEvent(event))
      this._eventStream.end()
      this._eventStream = null
    }
    if (this.canvasController.canvas.hasPointerCapture(event.pointerId)) {
      this.canvasController.canvas.releasePointerCapture(event.pointerId)
    }
    this.activePointerId = null
  }

  private handleDoubleClick() {
    // handled in mousedown via detail
  }

  private pointerEventToToolEvent(event: PointerEvent): ToolEvent {
    const rect = this.canvasController.canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pageX: event.pageX,
      pageY: event.pageY,
      detail: event.detail,
      pressure: event.pressure,
      pointerType: event.pointerType,
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

    // Quadratic (3 points) or cubic (4 points) Bézier. bezier-js project()
    // does a coarse LUT scan plus local refinement, which is far more precise
    // than fixed-step sampling at high magnification.
    const projected = new Bezier(...points).project(point)
    return {
      point: { x: projected.x, y: projected.y },
      distance: distance(point, projected),
    }
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
