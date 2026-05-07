// 指標工具 - 節點、線段與框選互動

import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from 'src/features/editor/tools/BaseTool'
import type { PathHitInfo, Point } from 'src/canvas/SceneView'
import {
  getIndexedPointSelectionInRect,
  pointSelectionKey,
} from 'src/lib/glyphSelection'
import type { HitTestResult } from 'src/features/editor/tools/SceneController'
import { useStore } from 'src/store'
import {
  applyPointerSelectionMode,
  buildPointSelectionFromSelection,
  getContourSelection,
  getPointByIndex,
  getPointerSelectionMode,
  getSegmentEndpointSelection,
  isOpenContourEndpoint,
  isSameSegment,
  type PointerSelectionMode,
} from 'src/features/editor/tools/PointerTool/selection'
import {
  capturePointSnapshot,
  createInitialPointerDragState,
  type DragMode,
  type PointerDragState,
} from 'src/features/editor/tools/PointerTool/state'
import { getSnappedDelta } from 'src/features/editor/tools/PointerTool/snap'
import {
  buildSelectionTransformBounds,
  getTransformCursor,
  getTransformHandleAtPoint,
  getTransformScaleUpdate,
} from 'src/features/editor/tools/PointerTool/transform'
import { asyncEventIterator } from 'src/features/editor/tools/PointerTool/events'
import {
  getLinkedHandleDrag,
  getLinkedSmoothHandlePosition,
} from 'src/features/editor/tools/PointerTool/handles'
import {
  deformDraggedSegment,
  expandPointIndicesForMove,
  getPreviewGlyphMetrics,
  invalidateGlyphPathCache,
  toggleSmoothFlag,
  updatePointPosition,
} from 'src/features/editor/tools/PointerTool/pathEditing'
import { commitMovedPoints } from 'src/features/editor/tools/PointerTool/commit'

export class PointerTool extends BaseTool {
  identifier = 'pointer-tool'

  private dragState: PointerDragState = createInitialPointerDragState()

  handleHover(event: ToolEvent): void {
    this.updateSelectionTransformBounds()
    const transformHandle = getTransformHandleAtPoint(
      this.localPoint(event),
      this.sceneModel.selectionTransformBounds,
      this.canvasController.magnification
    )
    if (transformHandle) {
      this.sceneController.setHoverSelection(new Set())
      this.sceneController.setHoverPathHit(undefined)
      this.setCursor(getTransformCursor(transformHandle))
      this.canvasController.requestUpdate()
      return
    }

    const hit = this.sceneController.hitTestAtPoint(
      this.localPoint(event),
      this.sceneController.mouseClickMargin,
      this.sceneController.selection
    )

    if (hit.type === 'point' || hit.type === 'handle') {
      this.sceneController.setHoverSelection(hit.selection)
      this.sceneController.setHoverPathHit(undefined)
      this.setCursor('pointer')
    } else if (hit.type === 'line-segment' || hit.type === 'curve-segment') {
      this.sceneController.setHoverSelection(new Set())
      this.sceneController.setHoverPathHit(hit.pathHit)
      this.setCursor('pointer')
    } else {
      this.sceneController.setHoverSelection(new Set())
      this.sceneController.setHoverPathHit(undefined)
      this.setCursor()
    }

    this.canvasController.requestUpdate()
  }

  async handleDrag(
    eventStream: EventStream,
    initialEvent: ToolEvent
  ): Promise<void> {
    initialEvent.preventDefault()

    const point = this.localPoint(initialEvent)
    const transformHandle = getTransformHandleAtPoint(
      point,
      this.sceneModel.selectionTransformBounds,
      this.canvasController.magnification
    )
    const hit = this.sceneController.hitTestAtPoint(
      point,
      this.sceneController.mouseClickMargin,
      this.sceneController.selection
    )

    if (initialEvent.detail === 2 || initialEvent.myTapCount === 2) {
      initialEvent.preventDefault()
      eventStream.done()
      this.handleDoubleClick(hit)
      return
    }

    const selectionMode = getPointerSelectionMode(initialEvent)

    this.dragState = {
      mode: 'pending',
      anchorPoint: point,
      currentPoint: point,
      pendingHit: hit,
      selectionMode,
      initialSelection: new Set(this.sceneController.selection),
      initialSelectedPathHit: this.sceneController.selectedPathHit,
      selectionToRestore: new Set(),
      activePointIndices: [],
      pathSnapshot: new Map(),
      snappedDelta: { x: 0, y: 0, guides: [] },
      didMove: false,
      altKey: initialEvent.altKey,
      transformHandle,
      transformBounds: this.sceneModel.selectionTransformBounds
        ? {
            xMin: this.sceneModel.selectionTransformBounds.xMin,
            yMin: this.sceneModel.selectionTransformBounds.yMin,
            xMax: this.sceneModel.selectionTransformBounds.xMax,
            yMax: this.sceneModel.selectionTransformBounds.yMax,
          }
        : undefined,
      pointToggleOnClick: undefined,
    }

    if (!transformHandle && (hit.type === 'point' || hit.type === 'handle')) {
      this.preparePointInteraction(hit)
    }

    let lastEvent: ToolEvent | undefined
    for await (const event of asyncEventIterator(eventStream)) {
      lastEvent = event
      this.handleDragMove(event)
    }

    this.handleDragEnd(lastEvent)
    this.dragState = createInitialPointerDragState()
  }

  private handleDragMove(event: ToolEvent) {
    const currentPoint = this.localPoint(event)
    this.dragState.currentPoint = currentPoint

    if (
      this.dragState.mode === 'pending' &&
      BaseTool.shouldInitiateDrag(this.dragState.anchorPoint, currentPoint)
    ) {
      this.dragState.mode = this.resolveDragMode(this.dragState.pendingHit)
      this.dragState.didMove = true
      this.beginResolvedMode(event)
    }

    if (this.dragState.mode === 'pending') {
      return
    }

    this.dragState.didMove = true

    if (this.dragState.mode === 'rect-select') {
      this.updateRectSelection(currentPoint)
      this.canvasController.requestUpdate()
      return
    }

    const path = this.sceneModel.glyph?.glyph.path
    if (!path) {
      return
    }

    const dx = currentPoint.x - this.dragState.anchorPoint.x
    const dy = currentPoint.y - this.dragState.anchorPoint.y
    const snappedDelta = getSnappedDelta(path, {
      activePointIndices: this.dragState.activePointIndices,
      mode: this.dragState.mode,
      pathSnapshot: this.dragState.pathSnapshot,
      magnification: this.canvasController.magnification,
      dx,
      dy,
    })
    this.dragState.snappedDelta = snappedDelta
    this.sceneModel.alignmentGuides = snappedDelta.guides

    if (
      this.dragState.mode === 'point-drag' ||
      this.dragState.mode === 'line-segment-drag' ||
      this.dragState.mode === 'curve-segment-drag'
    ) {
      for (const index of this.dragState.activePointIndices) {
        const snapshotPoint = this.dragState.pathSnapshot.get(index)
        if (!snapshotPoint) continue
        updatePointPosition(path, {
          index,
          x: snapshotPoint.x + snappedDelta.x,
          y: snapshotPoint.y + snappedDelta.y,
          magnification: this.canvasController.magnification,
        })
      }

      if (this.dragState.mode === 'point-drag' && this.dragState.linkedHandle) {
        this.updateLinkedSmoothHandle(path, snappedDelta.x, snappedDelta.y)
      }
    } else if (this.dragState.mode === 'curve-segment-deform') {
      deformDraggedSegment(path, {
        pointIndices: this.dragState.activePointIndices,
        pathSnapshot: this.dragState.pathSnapshot,
        dx,
        dy,
      })
      this.sceneModel.alignmentGuides = []
    } else if (this.dragState.mode === 'transform-scale') {
      this.updateTransformScale(path, currentPoint)
      this.sceneModel.alignmentGuides = []
    }

    this.updateSelectionTransformBounds()
    this.updatePreviewGlyphMetrics(path)
    invalidateGlyphPathCache(this.sceneModel.glyph?.glyph)
    this.canvasController.requestUpdate()
  }

  private handleDragEnd(event?: ToolEvent) {
    void event
    let finalRectSelection: Set<string> | undefined
    if (this.dragState.mode === 'rect-select') {
      finalRectSelection = this.getSelectionInRect(this.dragState.currentPoint)
      this.sceneModel.selectionRect = undefined
    }

    if (!this.dragState.didMove) {
      this.sceneController.onClearPreviewGlyphMetrics?.(
        this.sceneModel.glyph?.glyphId
      )
      this.handleClick(this.dragState.pendingHit)
      this.canvasController.requestUpdate()
      return
    }

    if (!this.sceneModel.glyph?.glyph.path) {
      return
    }

    commitMovedPoints(
      this.sceneModel.glyph,
      this.sceneController,
      this.dragState
    )
    this.restoreSelectionAfterDrag(finalRectSelection)
    this.sceneController.onClearPreviewGlyphMetrics?.(
      this.sceneModel.glyph?.glyphId
    )
    this.sceneController.setHoverSelection(new Set())
    this.sceneController.setHoverPathHit(undefined)
    this.sceneModel.alignmentGuides = []
    this.updateSelectionTransformBounds()
    this.canvasController.requestUpdate()
  }

  private handleClick(hit: HitTestResult) {
    const glyphId = this.sceneModel.glyph?.glyphId
    if (hit.type === 'point' || hit.type === 'handle') {
      const selectionKey = pointSelectionKey(hit.pointIndex)
      if (this.dragState.pointToggleOnClick) {
        const nextSelection = new Set(this.dragState.initialSelection)
        if (this.dragState.pointToggleOnClick.remove) {
          nextSelection.delete(this.dragState.pointToggleOnClick.selectionKey)
        } else {
          nextSelection.add(this.dragState.pointToggleOnClick.selectionKey)
        }
        this.sceneController.setSelection(nextSelection)
      } else {
        this.sceneController.setSelection(
          this.applySelectionMode(new Set([selectionKey]))
        )
      }
      this.sceneController.setSelectedPathHit(undefined)
      this.updateSelectionTransformBounds()
      return
    }

    if (hit.type === 'line-segment' || hit.type === 'curve-segment') {
      if (this.dragState.altKey && hit.type === 'line-segment') {
        const pointRefs = this.sceneModel.glyph?.pointRefs ?? []
        const [startIndex, endIndex] = hit.pathHit.segment.pointIndices
        const startRef = pointRefs[startIndex]
        const endRef = pointRefs[endIndex]
        if (
          glyphId &&
          startRef &&
          endRef &&
          startRef.pathId === endRef.pathId
        ) {
          useStore
            .getState()
            .convertLineSegmentToCurve(
              glyphId,
              startRef.pathId,
              startRef.nodeId,
              endRef.nodeId
            )
          this.sceneController.setSelection(new Set())
          this.sceneController.setSelectedPathHit(undefined)
          return
        }
      }
      this.sceneController.setSelectedPathHit(hit.pathHit)
      this.sceneController.setSelection(
        this.applySelectionMode(getSegmentEndpointSelection(hit))
      )
      this.updateSelectionTransformBounds()
      return
    }

    if (hit.type === 'empty') {
      this.sceneController.setSelection(new Set())
      this.sceneController.setSelectedPathHit(undefined)
      this.updateSelectionTransformBounds()
      return
    }

    if (hit.type === 'contour-interior') {
      this.sceneController.setSelection(new Set())
      this.sceneController.setSelectedPathHit(undefined)
      this.updateSelectionTransformBounds()
    }
  }

  private handleDoubleClick(hit: HitTestResult) {
    if (
      (hit.type === 'point' || hit.type === 'handle') &&
      this.sceneModel.glyph?.glyph.path
    ) {
      const idx = hit.pointIndex
      const path = this.sceneModel.glyph.glyph.path
      const pt = getPointByIndex(path, idx)

      if (pt?.type === 'onCurve' && !isOpenContourEndpoint(path, idx)) {
        toggleSmoothFlag(path, idx)
        const pointRef = this.sceneModel.glyph.pointRefs?.[idx]
        const glyphId = this.sceneModel.glyph.glyphId
        if (glyphId && pointRef && this.sceneController.onUpdateNodeType) {
          this.sceneController.onUpdateNodeType(
            glyphId,
            pointRef.pathId,
            pointRef.nodeId,
            pt.smooth ? 'corner' : 'smooth'
          )
        }
        invalidateGlyphPathCache(this.sceneModel.glyph?.glyph)
        this.canvasController.requestUpdate()
      }
      return
    }

    if (hit.type === 'line-segment' || hit.type === 'curve-segment') {
      this.sceneController.setSelectedPathHit(undefined)
      this.sceneController.setSelection(
        this.applySelectionMode(
          getContourSelection(hit, this.sceneModel.glyph?.glyph.path)
        )
      )
      this.updateSelectionTransformBounds()
      this.canvasController.requestUpdate()
      return
    }

    if (hit.type === 'contour-interior') {
      this.sceneController.setSelection(this.applySelectionMode(hit.selection))
      this.sceneController.setSelectedPathHit(undefined)
      this.updateSelectionTransformBounds()
      this.canvasController.requestUpdate()
    }
  }

  private preparePointInteraction(
    hit: Extract<HitTestResult, { type: 'point' | 'handle' }>
  ) {
    const normalizedSelectionKey = pointSelectionKey(hit.pointIndex)
    const currentSelection = new Set(this.sceneController.selection)
    const isAlreadySelected = currentSelection.has(normalizedSelectionKey)

    if (this.dragState.selectionMode === 'replace') {
      if (!isAlreadySelected) {
        this.sceneController.setSelection(new Set([normalizedSelectionKey]))
      }
      this.sceneController.setSelectedPathHit(undefined)
      return
    }

    if (!isAlreadySelected) {
      currentSelection.add(normalizedSelectionKey)
      this.sceneController.setSelection(currentSelection)
      this.sceneController.setSelectedPathHit(undefined)
      return
    }

    this.dragState.pointToggleOnClick = {
      selectionKey: normalizedSelectionKey,
      remove: true,
    }
  }

  private resolveDragMode(hit: HitTestResult): DragMode {
    if (this.dragState.transformHandle) {
      return 'transform-scale'
    }

    if (hit.type === 'point' || hit.type === 'handle') {
      return 'point-drag'
    }

    if (hit.type === 'line-segment') {
      if (this.shouldDragCurrentSelection(hit.pathHit)) {
        return 'point-drag'
      }
      return isSameSegment(hit.pathHit, this.dragState.initialSelectedPathHit)
        ? 'line-segment-drag'
        : 'rect-select'
    }

    if (hit.type === 'curve-segment') {
      if (this.shouldDragCurrentSelection(hit.pathHit)) {
        return 'point-drag'
      }
      return isSameSegment(hit.pathHit, this.dragState.initialSelectedPathHit)
        ? 'curve-segment-drag'
        : 'curve-segment-deform'
    }

    return 'rect-select'
  }

  private beginResolvedMode(event: ToolEvent) {
    void event
    const hit = this.dragState.pendingHit
    const path = this.sceneModel.glyph?.glyph.path

    if (this.dragState.mode === 'rect-select') {
      this.sceneController.setSelectedPathHit(undefined)
      this.sceneModel.selectionTransformBounds = undefined
      this.updateRectSelection(this.dragState.currentPoint)
      return
    }

    if (!path) {
      return
    }

    if (this.dragState.mode === 'transform-scale') {
      const baseSelection = new Set(this.sceneController.selection)
      this.dragState.selectionToRestore = new Set(baseSelection)
      this.dragState.activePointIndices = expandPointIndicesForMove(
        path,
        buildPointSelectionFromSelection(baseSelection)
      )
      this.dragState.pathSnapshot = capturePointSnapshot(
        path,
        this.dragState.activePointIndices
      )
      this.sceneController.setSelectedPathHit(undefined)
      return
    }

    if (this.dragState.mode === 'point-drag') {
      const baseSelection = new Set(this.sceneController.selection)
      this.dragState.selectionToRestore = new Set(baseSelection)
      this.dragState.activePointIndices = expandPointIndicesForMove(
        path,
        buildPointSelectionFromSelection(baseSelection)
      )
      this.dragState.linkedHandle = getLinkedHandleDrag(path, hit)
      this.dragState.pathSnapshot = capturePointSnapshot(path, [
        ...this.dragState.activePointIndices,
        ...(this.dragState.linkedHandle
          ? [
              this.dragState.linkedHandle.anchorIndex,
              this.dragState.linkedHandle.oppositeHandleIndex,
            ]
          : []),
      ])
      this.sceneController.setSelectedPathHit(undefined)
      this.dragState.pointToggleOnClick = undefined
      return
    }

    if (hit.type !== 'line-segment' && hit.type !== 'curve-segment') {
      return
    }

    this.dragState.activePointIndices = expandPointIndicesForMove(
      path,
      hit.pathHit.segment.pointIndices
    )
    this.dragState.pathSnapshot = capturePointSnapshot(
      path,
      this.dragState.activePointIndices
    )

    if (
      this.dragState.mode === 'line-segment-drag' ||
      this.dragState.mode === 'curve-segment-drag'
    ) {
      this.sceneController.setSelectedPathHit(hit.pathHit)
      return
    }

    this.sceneController.setSelectedPathHit(undefined)
  }

  private updateRectSelection(
    currentPoint: { x: number; y: number },
    event?: ToolEvent
  ) {
    const selection = this.getSelectionInRect(currentPoint)
    if (!selection) {
      return
    }

    const selectionRect = {
      xMin: Math.min(this.dragState.anchorPoint.x, currentPoint.x),
      yMin: Math.min(this.dragState.anchorPoint.y, currentPoint.y),
      xMax: Math.max(this.dragState.anchorPoint.x, currentPoint.x),
      yMax: Math.max(this.dragState.anchorPoint.y, currentPoint.y),
      owner: 'pointer' as const,
    }
    this.sceneModel.selectionRect = selectionRect

    const selectionMode = event
      ? getPointerSelectionMode(event)
      : this.dragState.selectionMode
    this.sceneController.previewSelection(
      this.applySelectionMode(selection, selectionMode)
    )
    this.sceneModel.selectionTransformBounds = undefined
  }

  private getSelectionInRect(currentPoint: {
    x: number
    y: number
  }): Set<string> | undefined {
    if (!this.sceneModel.glyph?.glyph.path) {
      return undefined
    }

    const selectionRect = {
      xMin: Math.min(this.dragState.anchorPoint.x, currentPoint.x),
      yMin: Math.min(this.dragState.anchorPoint.y, currentPoint.y),
      xMax: Math.max(this.dragState.anchorPoint.x, currentPoint.x),
      yMax: Math.max(this.dragState.anchorPoint.y, currentPoint.y),
    }

    return getIndexedPointSelectionInRect(
      this.sceneModel.glyph.glyph.path.iterPoints(),
      selectionRect
    )
  }

  private updatePreviewGlyphMetrics(path: {
    getControlBounds?(): { xMin: number; xMax: number } | undefined
  }) {
    const glyphId = this.sceneModel.glyph?.glyphId
    const metrics = getPreviewGlyphMetrics(
      path,
      this.sceneModel.glyph?.glyph.xAdvance
    )
    if (!glyphId || !metrics) {
      return
    }

    this.sceneController.onPreviewGlyphMetrics?.(glyphId, metrics)
  }

  private restoreSelectionAfterDrag(finalRectSelection?: Set<string>) {
    if (this.dragState.mode === 'rect-select') {
      this.sceneController.setSelection(
        finalRectSelection
          ? this.applySelectionMode(finalRectSelection)
          : new Set()
      )
      return
    }

    if (this.dragState.mode === 'point-drag') {
      if (this.dragState.selectionToRestore.size > 0) {
        this.sceneController.setSelection(
          new Set(this.dragState.selectionToRestore)
        )
        return
      }

      if (
        this.dragState.pendingHit.type === 'point' ||
        this.dragState.pendingHit.type === 'handle'
      ) {
        this.sceneController.setSelection(
          new Set([pointSelectionKey(this.dragState.pendingHit.pointIndex)])
        )
        return
      }

      this.sceneController.setSelection(
        new Set(this.dragState.initialSelection)
      )
      return
    }

    if (
      (this.dragState.mode === 'line-segment-drag' ||
        this.dragState.mode === 'curve-segment-drag') &&
      this.sceneController.selectedPathHit
    ) {
      this.sceneController.setSelectedPathHit(
        this.sceneController.selectedPathHit
      )
    }
  }

  private shouldDragCurrentSelection(pathHit: PathHitInfo) {
    if (!this.sceneController.selection.size) {
      return false
    }
    const selectedPointIndices = new Set(
      buildPointSelectionFromSelection(this.sceneController.selection)
    )
    return pathHit.segment.pointIndices.some((index) =>
      selectedPointIndices.has(index)
    )
  }

  private updateLinkedSmoothHandle(
    path: {
      setPoint?(
        index: number,
        point: { x: number; y: number; type?: string; smooth?: boolean }
      ): void
      getPoint?(index: number): Point
      coordinates?: Float64Array
    },
    dx: number,
    dy: number
  ) {
    const nextPosition = getLinkedSmoothHandlePosition(
      this.dragState.linkedHandle,
      this.dragState.pathSnapshot,
      dx,
      dy
    )
    const linkedHandle = this.dragState.linkedHandle
    if (!nextPosition || !linkedHandle) {
      return
    }

    updatePointPosition(path, {
      index: linkedHandle.oppositeHandleIndex,
      x: nextPosition.x,
      y: nextPosition.y,
      magnification: this.canvasController.magnification,
    })
  }

  private applySelectionMode(
    selection: Set<string>,
    selectionMode: PointerSelectionMode = this.dragState.selectionMode
  ) {
    return applyPointerSelectionMode(
      selection,
      this.dragState.initialSelection,
      selectionMode
    )
  }

  private updateSelectionTransformBounds() {
    if (this.sceneModel.activeToolIdentifier !== 'pointer') {
      this.sceneModel.selectionTransformBounds = undefined
      return
    }

    const path = this.sceneModel.glyph?.glyph.path
    if (!path?.getPoint || this.sceneController.selectedPathHit) {
      this.sceneModel.selectionTransformBounds = undefined
      return
    }

    const selectedPointIndices = buildPointSelectionFromSelection(
      this.sceneController.selection
    )
    this.sceneModel.selectionTransformBounds = buildSelectionTransformBounds(
      path,
      selectedPointIndices
    )
  }

  private updateTransformScale(
    path: {
      setPoint?(
        index: number,
        point: { x: number; y: number; type?: string; smooth?: boolean }
      ): void
      getPoint?(index: number): Point
    },
    currentPoint: { x: number; y: number }
  ) {
    const handle = this.dragState.transformHandle
    const bounds = this.dragState.transformBounds
    if (!handle || !bounds) {
      return
    }

    for (const update of getTransformScaleUpdate({
      activePointIndices: this.dragState.activePointIndices,
      altKey: this.dragState.altKey,
      bounds,
      currentPoint,
      handle,
      pathSnapshot: this.dragState.pathSnapshot,
    })) {
      updatePointPosition(path, {
        index: update.index,
        x: update.x,
        y: update.y,
        magnification: this.canvasController.magnification,
      })
    }
  }
}
