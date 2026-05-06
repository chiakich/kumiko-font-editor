// 指標工具 - 節點、線段與框選互動

import { BaseTool, type EventStream, type ToolEvent } from './BaseTool'
import type { Point, PathHitInfo } from '../../../canvas/SceneView'
import {
  getIndexedPointSelectionInRect,
  parsePointSelection,
  pointSelectionKey,
} from '../../../lib/glyphSelection'
import type { HitTestResult } from './SceneController'
import { useStore } from '../../../store'

type DragMode =
  | 'pending'
  | 'point-drag'
  | 'line-segment-drag'
  | 'curve-segment-drag'
  | 'curve-segment-deform'
  | 'transform-scale'
  | 'rect-select'

type TransformHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export class PointerTool extends BaseTool {
  identifier = 'pointer-tool'

  private dragState: {
    mode: DragMode
    anchorPoint: { x: number; y: number }
    currentPoint: { x: number; y: number }
    pendingHit: HitTestResult
    additiveSelection: boolean
    initialSelection: Set<string>
    initialSelectedPathHit?: PathHitInfo
    selectionToRestore: Set<string>
    activePointIndices: number[]
    pathSnapshot: Map<number, Point>
    snappedDelta: {
      x: number
      y: number
      guides: Array<{ x1: number; y1: number; x2: number; y2: number }>
    }
    linkedHandle?:
      | {
          draggedHandleIndex: number
          anchorIndex: number
          oppositeHandleIndex: number
        }
      | undefined
    didMove: boolean
    altKey: boolean
    transformHandle?: TransformHandleId
    transformBounds?: { xMin: number; yMin: number; xMax: number; yMax: number }
    pointToggleOnClick?: { selectionKey: string; remove: boolean }
  } = this.createInitialDragState()

  handleHover(event: ToolEvent): void {
    this.updateSelectionTransformBounds()
    const transformHandle = this.getTransformHandleAtPoint(
      this.localPoint(event)
    )
    if (transformHandle) {
      this.sceneController.setHoverSelection(new Set())
      this.sceneController.setHoverPathHit(undefined)
      this.setCursor(this.getTransformCursor(transformHandle))
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
    const transformHandle = this.getTransformHandleAtPoint(point)
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

    const additiveSelection =
      initialEvent.shiftKey || initialEvent.metaKey || initialEvent.ctrlKey

    this.dragState = {
      mode: 'pending',
      anchorPoint: point,
      currentPoint: point,
      pendingHit: hit,
      additiveSelection,
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
      this.preparePointInteraction(hit, additiveSelection)
    }

    let lastEvent: ToolEvent | undefined
    for await (const event of asyncEventIterator(eventStream)) {
      lastEvent = event
      this.handleDragMove(event)
    }

    this.handleDragEnd(lastEvent)
    this.dragState = this.createInitialDragState()
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
    const snappedDelta = this.getSnappedDelta(path, dx, dy)
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
        this.updatePointPosition(
          path,
          index,
          snapshotPoint.x + snappedDelta.x,
          snapshotPoint.y + snappedDelta.y
        )
      }

      if (this.dragState.mode === 'point-drag' && this.dragState.linkedHandle) {
        this.updateLinkedSmoothHandle(path, snappedDelta.x, snappedDelta.y)
      }
    } else if (this.dragState.mode === 'curve-segment-deform') {
      this.deformDraggedSegment(path, this.dragState.activePointIndices, dx, dy)
      this.sceneModel.alignmentGuides = []
    } else if (this.dragState.mode === 'transform-scale') {
      this.updateTransformScale(path, currentPoint)
      this.sceneModel.alignmentGuides = []
    }

    this.updateSelectionTransformBounds()
    this.updatePreviewGlyphMetrics(path)
    this.invalidateGlyphPaths()
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

    this.commitMovedPoints()
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
        if (this.dragState.additiveSelection) {
          const nextSelection = new Set(this.dragState.initialSelection)
          nextSelection.add(selectionKey)
          this.sceneController.setSelection(nextSelection)
        } else {
          this.sceneController.setSelection(new Set([selectionKey]))
        }
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
      this.sceneController.setSelection(new Set())
      this.sceneController.setSelectedPathHit(hit.pathHit)
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
      const pt = this.getPointByIndex(path, idx)

      if (pt?.type === 'onCurve' && !this.isOpenContourEndpoint(path, idx)) {
        this.toggleSmooth(path, idx)
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
        this.invalidateGlyphPaths()
        this.canvasController.requestUpdate()
      }
      return
    }

    if (hit.type === 'contour-interior') {
      this.sceneController.setSelection(hit.selection)
      this.sceneController.setSelectedPathHit(undefined)
    }
  }

  private preparePointInteraction(
    hit: Extract<HitTestResult, { type: 'point' | 'handle' }>,
    additiveSelection: boolean
  ) {
    const normalizedSelectionKey = pointSelectionKey(hit.pointIndex)
    const currentSelection = new Set(this.sceneController.selection)
    const isAlreadySelected = currentSelection.has(normalizedSelectionKey)

    if (!additiveSelection) {
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
      return this.isSameSegment(
        hit.pathHit,
        this.dragState.initialSelectedPathHit
      )
        ? 'line-segment-drag'
        : 'rect-select'
    }

    if (hit.type === 'curve-segment') {
      if (this.shouldDragCurrentSelection(hit.pathHit)) {
        return 'point-drag'
      }
      return this.isSameSegment(
        hit.pathHit,
        this.dragState.initialSelectedPathHit
      )
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
      this.updateRectSelection(this.dragState.currentPoint)
      return
    }

    if (!path) {
      return
    }

    if (this.dragState.mode === 'transform-scale') {
      const baseSelection = new Set(this.sceneController.selection)
      this.dragState.selectionToRestore = new Set(baseSelection)
      this.dragState.activePointIndices = this.expandPointIndicesForMove(
        path,
        this.getSelectedPointIndices(baseSelection)
      )
      this.capturePointSnapshot(path, this.dragState.activePointIndices)
      this.sceneController.setSelectedPathHit(undefined)
      return
    }

    if (this.dragState.mode === 'point-drag') {
      const baseSelection = new Set(this.sceneController.selection)
      this.dragState.selectionToRestore = new Set(baseSelection)
      this.dragState.activePointIndices = this.expandPointIndicesForMove(
        path,
        this.getSelectedPointIndices(baseSelection)
      )
      this.dragState.linkedHandle = this.getLinkedHandleDrag(path, hit)
      this.capturePointSnapshot(path, [
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

    this.dragState.activePointIndices = this.expandPointIndicesForMove(
      path,
      hit.pathHit.segment.pointIndices
    )
    this.capturePointSnapshot(path, this.dragState.activePointIndices)

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

    const additiveSelection =
      event?.shiftKey ||
      event?.metaKey ||
      event?.ctrlKey ||
      this.dragState.additiveSelection
    this.sceneController.previewSelection(
      additiveSelection
        ? new Set([...this.dragState.initialSelection, ...selection])
        : selection
    )
    this.updateSelectionTransformBounds()
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

  private deformDraggedSegment(
    path: {
      setPoint?(
        index: number,
        point: { x: number; y: number; type?: string; smooth?: boolean }
      ): void
    },
    pointIndices: number[],
    dx: number,
    dy: number
  ) {
    for (
      let segmentIndex = 0;
      segmentIndex < pointIndices.length;
      segmentIndex += 1
    ) {
      const pointIndex = pointIndices[segmentIndex]
      const snapshotPoint = this.dragState.pathSnapshot.get(pointIndex)
      if (!snapshotPoint || !path.setPoint) {
        continue
      }

      const isEndpoint =
        segmentIndex === 0 || segmentIndex === pointIndices.length - 1
      const factor = isEndpoint ? 0 : 1
      path.setPoint(pointIndex, {
        x: snapshotPoint.x + dx * factor,
        y: snapshotPoint.y + dy * factor,
        type: snapshotPoint.type,
        smooth: snapshotPoint.smooth,
      })
    }
  }

  private commitMovedPoints() {
    if (!this.sceneModel.glyph?.glyph.path) {
      return
    }

    const glyphId = this.sceneModel.glyph.glyphId
    const pointRefs = this.sceneModel.glyph.pointRefs ?? []
    if (!glyphId || !this.sceneController.onCommitNodePositions) {
      return
    }

    const uniquePointIndices = Array.from(
      new Set(this.dragState.activePointIndices)
    )
    const committedPointIndices = this.dragState.linkedHandle
      ? Array.from(
          new Set([
            ...uniquePointIndices,
            this.dragState.linkedHandle.oppositeHandleIndex,
          ])
        )
      : uniquePointIndices
    const dx = this.dragState.snappedDelta.x
    const dy = this.dragState.snappedDelta.y
    const updates = committedPointIndices.flatMap((idx) => {
      const pointRef = pointRefs[idx]
      const snapshotPoint = this.dragState.pathSnapshot.get(idx)
      if (!pointRef || !snapshotPoint) {
        return []
      }

      let newPos = { x: snapshotPoint.x, y: snapshotPoint.y }

      if (
        this.dragState.mode === 'point-drag' ||
        this.dragState.mode === 'line-segment-drag' ||
        this.dragState.mode === 'curve-segment-drag'
      ) {
        newPos = {
          x: snapshotPoint.x + dx,
          y: snapshotPoint.y + dy,
        }

        if (
          this.dragState.mode === 'point-drag' &&
          this.dragState.linkedHandle?.oppositeHandleIndex === idx
        ) {
          newPos = this.getLinkedSmoothHandlePosition(dx, dy) ?? newPos
        }
      } else if (this.dragState.mode === 'curve-segment-deform') {
        const pointIndex = this.dragState.activePointIndices.indexOf(idx)
        const isEndpoint =
          pointIndex === 0 ||
          pointIndex === this.dragState.activePointIndices.length - 1
        const factor = isEndpoint ? 0 : 1
        newPos = {
          x: snapshotPoint.x + dx * factor,
          y: snapshotPoint.y + dy * factor,
        }
      } else if (this.dragState.mode === 'transform-scale') {
        const point = this.sceneModel.glyph?.glyph.path.getPoint?.(idx)
        if (point) {
          newPos = { x: point.x, y: point.y }
        }
      }

      return [
        {
          pathId: pointRef.pathId,
          nodeId: pointRef.nodeId,
          newPos,
        },
      ]
    })

    if (updates.length > 0) {
      this.sceneController.onCommitNodePositions(glyphId, updates)
    }
  }

  private createInitialDragState() {
    return {
      mode: 'pending' as DragMode,
      anchorPoint: { x: 0, y: 0 },
      currentPoint: { x: 0, y: 0 },
      pendingHit: { type: 'empty', selection: new Set() } as HitTestResult,
      additiveSelection: false,
      initialSelection: new Set<string>(),
      initialSelectedPathHit: undefined,
      selectionToRestore: new Set<string>(),
      activePointIndices: [],
      pathSnapshot: new Map<number, Point>(),
      snappedDelta: { x: 0, y: 0, guides: [] },
      didMove: false,
      altKey: false,
      linkedHandle: undefined,
      pointToggleOnClick: undefined,
      transformHandle: undefined,
      transformBounds: undefined,
    }
  }

  private updatePreviewGlyphMetrics(path: {
    getControlBounds?(): { xMin: number; xMax: number } | undefined
  }) {
    const glyphId = this.sceneModel.glyph?.glyphId
    const width = this.sceneModel.glyph?.glyph.xAdvance
    const bounds = path.getControlBounds?.()
    if (!glyphId || typeof width !== 'number') {
      return
    }

    this.sceneController.onPreviewGlyphMetrics?.(glyphId, {
      lsb: Math.round(bounds?.xMin ?? 0),
      rsb: Math.round(width - (bounds?.xMax ?? width)),
      width,
    })
  }

  private restoreSelectionAfterDrag(finalRectSelection?: Set<string>) {
    if (this.dragState.mode === 'rect-select') {
      const additiveSelection = this.dragState.additiveSelection
      this.sceneController.setSelection(
        additiveSelection && finalRectSelection
          ? new Set([...this.dragState.initialSelection, ...finalRectSelection])
          : (finalRectSelection ?? new Set())
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
      this.getSelectedPointIndices(this.sceneController.selection)
    )
    return pathHit.segment.pointIndices.some((index) =>
      selectedPointIndices.has(index)
    )
  }

  private expandPointIndicesForMove(
    path: {
      getPoint?(index: number): Point
      contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
    },
    pointIndices: number[]
  ): number[] {
    const expanded = new Set<number>(pointIndices)

    if (!path.getPoint || !path.contourInfo?.length) {
      return [...expanded]
    }

    for (const index of pointIndices) {
      const point = path.getPoint(index)
      if (!point || point.type !== 'onCurve') {
        continue
      }

      for (const attachedIndex of this.findAttachedHandleIndices(path, index)) {
        expanded.add(attachedIndex)
      }
    }

    return [...expanded]
  }

  private getLinkedHandleDrag(
    path: {
      getPoint?(index: number): Point
      contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
    },
    hit: HitTestResult
  ) {
    if (hit.type !== 'handle' || !path.getPoint || !path.contourInfo?.length) {
      return undefined
    }

    const contourBounds = this.findContourBounds(
      path.contourInfo,
      hit.pointIndex
    )
    if (!contourBounds) {
      return undefined
    }

    const previousIndex = this.stepContourIndex(
      hit.pointIndex,
      -1,
      contourBounds
    )
    const nextIndex = this.stepContourIndex(hit.pointIndex, 1, contourBounds)
    const previousPoint =
      previousIndex === null ? null : path.getPoint(previousIndex)
    const nextPoint = nextIndex === null ? null : path.getPoint(nextIndex)

    let anchorIndex: number | null = null
    let oppositeHandleIndex: number | null = null

    if (previousPoint?.type === 'onCurve' && previousIndex !== null) {
      anchorIndex = previousIndex
      oppositeHandleIndex = this.findAdjacentHandleIndex(
        path,
        previousIndex,
        -1,
        contourBounds
      )
    } else if (nextPoint?.type === 'onCurve' && nextIndex !== null) {
      anchorIndex = nextIndex
      oppositeHandleIndex = this.findAdjacentHandleIndex(
        path,
        nextIndex,
        1,
        contourBounds
      )
    }

    if (anchorIndex === null || oppositeHandleIndex === null) {
      return undefined
    }

    const anchorPoint = path.getPoint(anchorIndex)
    if (!anchorPoint?.smooth) {
      return undefined
    }

    return {
      draggedHandleIndex: hit.pointIndex,
      anchorIndex,
      oppositeHandleIndex,
    }
  }

  private findAdjacentHandleIndex(
    path: { getPoint?(index: number): Point },
    anchorIndex: number,
    direction: -1 | 1,
    contourBounds: { start: number; end: number; isClosed: boolean }
  ) {
    const candidateIndex = this.stepContourIndex(
      anchorIndex,
      direction,
      contourBounds
    )
    if (candidateIndex === null || !path.getPoint) {
      return null
    }

    const candidatePoint = path.getPoint(candidateIndex)
    if (!candidatePoint || candidatePoint.type === 'onCurve') {
      return null
    }

    return candidateIndex
  }

  private stepContourIndex(
    index: number,
    direction: -1 | 1,
    contourBounds: { start: number; end: number; isClosed: boolean }
  ) {
    let nextIndex = index + direction
    if (nextIndex < contourBounds.start || nextIndex > contourBounds.end) {
      if (!contourBounds.isClosed) {
        return null
      }
      nextIndex = direction > 0 ? contourBounds.start : contourBounds.end
    }
    return nextIndex
  }

  private updateLinkedSmoothHandle(
    path: {
      setPoint?(
        index: number,
        point: { x: number; y: number; type?: string; smooth?: boolean }
      ): void
    },
    dx: number,
    dy: number
  ) {
    const nextPosition = this.getLinkedSmoothHandlePosition(dx, dy)
    const linkedHandle = this.dragState.linkedHandle
    if (!nextPosition || !linkedHandle) {
      return
    }

    this.updatePointPosition(
      path,
      linkedHandle.oppositeHandleIndex,
      nextPosition.x,
      nextPosition.y
    )
  }

  private getLinkedSmoothHandlePosition(dx: number, dy: number) {
    const linkedHandle = this.dragState.linkedHandle
    if (!linkedHandle) {
      return undefined
    }

    const draggedSnapshot = this.dragState.pathSnapshot.get(
      linkedHandle.draggedHandleIndex
    )
    const anchorSnapshot = this.dragState.pathSnapshot.get(
      linkedHandle.anchorIndex
    )
    const oppositeSnapshot = this.dragState.pathSnapshot.get(
      linkedHandle.oppositeHandleIndex
    )
    if (!draggedSnapshot || !anchorSnapshot || !oppositeSnapshot) {
      return undefined
    }

    const draggedVector = {
      x: draggedSnapshot.x + dx - anchorSnapshot.x,
      y: draggedSnapshot.y + dy - anchorSnapshot.y,
    }
    const draggedLength = Math.hypot(draggedVector.x, draggedVector.y)
    if (draggedLength === 0) {
      return { x: anchorSnapshot.x, y: anchorSnapshot.y }
    }

    const oppositeLength = Math.hypot(
      oppositeSnapshot.x - anchorSnapshot.x,
      oppositeSnapshot.y - anchorSnapshot.y
    )

    return {
      x: anchorSnapshot.x - (draggedVector.x / draggedLength) * oppositeLength,
      y: anchorSnapshot.y - (draggedVector.y / draggedLength) * oppositeLength,
    }
  }

  private findAttachedHandleIndices(
    path: {
      getPoint?(index: number): Point
      contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
    },
    pointIndex: number
  ): number[] {
    if (!path.getPoint || !path.contourInfo?.length) {
      return []
    }

    const contourBounds = this.findContourBounds(path.contourInfo, pointIndex)
    if (!contourBounds) {
      return []
    }

    const attached = new Set<number>()
    this.collectHandleRun(path, pointIndex, -1, contourBounds, attached)
    this.collectHandleRun(path, pointIndex, 1, contourBounds, attached)
    return [...attached]
  }

  private collectHandleRun(
    path: {
      getPoint?(index: number): Point
    },
    startIndex: number,
    direction: -1 | 1,
    contourBounds: { start: number; end: number; isClosed: boolean },
    attached: Set<number>
  ) {
    if (!path.getPoint) {
      return
    }

    let currentIndex = startIndex
    while (true) {
      currentIndex += direction

      if (
        currentIndex < contourBounds.start ||
        currentIndex > contourBounds.end
      ) {
        if (!contourBounds.isClosed) {
          return
        }
        currentIndex = direction > 0 ? contourBounds.start : contourBounds.end
      }

      if (currentIndex === startIndex) {
        return
      }

      const point = path.getPoint(currentIndex)
      if (!point || point.type === 'onCurve') {
        return
      }

      attached.add(currentIndex)
    }
  }

  private findContourBounds(
    contourInfo: Array<{ endPoint: number; isClosed?: boolean }>,
    pointIndex: number
  ): { start: number; end: number; isClosed: boolean } | null {
    let start = 0
    for (const contour of contourInfo) {
      if (pointIndex <= contour.endPoint) {
        return {
          start,
          end: contour.endPoint,
          isClosed: contour.isClosed ?? true,
        }
      }
      start = contour.endPoint + 1
    }
    return null
  }

  private isOpenContourEndpoint(
    path: {
      contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
    },
    pointIndex: number
  ) {
    if (!path.contourInfo?.length) {
      return false
    }

    const contourBounds = this.findContourBounds(path.contourInfo, pointIndex)
    if (!contourBounds || contourBounds.isClosed) {
      return false
    }

    return (
      pointIndex === contourBounds.start || pointIndex === contourBounds.end
    )
  }

  private capturePointSnapshot(
    path: { getPoint?(index: number): Point },
    pointIndices: number[]
  ) {
    this.dragState.pathSnapshot = new Map()
    for (const index of pointIndices) {
      const point = path.getPoint?.(index)
      if (point) {
        this.dragState.pathSnapshot.set(index, { ...point })
      }
    }
  }

  private isSameSegment(a?: PathHitInfo, b?: PathHitInfo) {
    return (
      !!a?.segment.key && !!b?.segment.key && a.segment.key === b.segment.key
    )
  }

  private getSelectedPointIndices(selection: Set<string>): number[] {
    const selectedPointIndices: number[] = []
    for (const item of selection) {
      selectedPointIndices.push(...parsePointSelection(new Set([item])))
    }
    return selectedPointIndices
  }

  private getPointByIndex(
    path: {
      iterPoints(): Generator<
        {
          x: number
          y: number
          index: number
          type?: string
          smooth?: boolean
        },
        void
      >
    },
    index: number
  ) {
    for (const pt of path.iterPoints()) {
      if (pt.index === index) return pt
    }
    return null
  }

  private updatePointPosition(
    path: {
      setPoint?(
        index: number,
        point: { x: number; y: number; type?: string; smooth?: boolean }
      ): void
      getPoint?(index: number): {
        x: number
        y: number
        type?: string
        smooth?: boolean
      }
      coordinates?: Float64Array
    },
    index: number,
    x: number,
    y: number
  ) {
    const gridStep = this.getGridSnapStep()
    if (gridStep) {
      x = Math.round(x / gridStep) * gridStep
      y = Math.round(y / gridStep) * gridStep
    }
    if (path.setPoint) {
      const existingPoint = path.getPoint?.(index)
      path.setPoint(index, {
        x,
        y,
        type: existingPoint?.type,
        smooth: existingPoint?.smooth,
      })
    } else if (path.coordinates) {
      path.coordinates[index * 2] = x
      path.coordinates[index * 2 + 1] = y
    }
  }

  private getGridSnapStep() {
    if (this.canvasController.magnification >= 32) {
      return 1
    }
    if (this.canvasController.magnification >= 10) {
      return 10
    }
    return 0
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

    const selectedPointIndices = this.getSelectedPointIndices(
      this.sceneController.selection
    )
    if (selectedPointIndices.length < 2) {
      this.sceneModel.selectionTransformBounds = undefined
      return
    }

    const points = selectedPointIndices
      .map((index) => path.getPoint?.(index))
      .filter((point): point is Point => Boolean(point))
    if (points.length < 2) {
      this.sceneModel.selectionTransformBounds = undefined
      return
    }

    const xMin = Math.min(...points.map((point) => point.x))
    const yMin = Math.min(...points.map((point) => point.y))
    const xMax = Math.max(...points.map((point) => point.x))
    const yMax = Math.max(...points.map((point) => point.y))
    if (xMax === xMin && yMax === yMin) {
      this.sceneModel.selectionTransformBounds = undefined
      return
    }

    const centerX = xMin + (xMax - xMin) / 2
    const centerY = yMin + (yMax - yMin) / 2
    this.sceneModel.selectionTransformBounds = {
      xMin,
      yMin,
      xMax,
      yMax,
      handles: [
        { id: 'nw', x: xMin, y: yMax },
        { id: 'n', x: centerX, y: yMax },
        { id: 'ne', x: xMax, y: yMax },
        { id: 'e', x: xMax, y: centerY },
        { id: 'se', x: xMax, y: yMin },
        { id: 's', x: centerX, y: yMin },
        { id: 'sw', x: xMin, y: yMin },
        { id: 'w', x: xMin, y: centerY },
      ],
    }
  }

  private getTransformHandleAtPoint(point: { x: number; y: number }) {
    const bounds = this.sceneModel.selectionTransformBounds
    if (!bounds) {
      return undefined
    }

    const handleRadius = 7 / this.canvasController.magnification
    for (const handle of bounds.handles) {
      if (
        Math.abs(point.x - handle.x) <= handleRadius &&
        Math.abs(point.y - handle.y) <= handleRadius
      ) {
        return handle.id
      }
    }
    return undefined
  }

  private getTransformCursor(handle: TransformHandleId) {
    if (handle === 'n' || handle === 's') return 'ns-resize'
    if (handle === 'e' || handle === 'w') return 'ew-resize'
    if (handle === 'nw' || handle === 'se') return 'nwse-resize'
    return 'nesw-resize'
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

    const fixed = this.getTransformFixedPoint(bounds, handle)
    const moving = this.getTransformMovingPoint(bounds, handle)
    const origin = this.dragState.altKey
      ? {
          x: bounds.xMin + (bounds.xMax - bounds.xMin) / 2,
          y: bounds.yMin + (bounds.yMax - bounds.yMin) / 2,
        }
      : fixed

    let scaleX =
      handle === 'n' || handle === 's'
        ? 1
        : (currentPoint.x - origin.x) / (moving.x - origin.x || 1)
    let scaleY =
      handle === 'e' || handle === 'w'
        ? 1
        : (currentPoint.y - origin.y) / (moving.y - origin.y || 1)

    if (Math.abs(scaleX) < 0.02) scaleX = Math.sign(scaleX || 1) * 0.02
    if (Math.abs(scaleY) < 0.02) scaleY = Math.sign(scaleY || 1) * 0.02

    if (this.dragState.altKey) {
      scaleX = handle === 'n' || handle === 's' ? 1 : scaleX
      scaleY = handle === 'e' || handle === 'w' ? 1 : scaleY
    }

    for (const index of this.dragState.activePointIndices) {
      const snapshot = this.dragState.pathSnapshot.get(index)
      if (!snapshot) continue
      this.updatePointPosition(
        path,
        index,
        origin.x + (snapshot.x - origin.x) * scaleX,
        origin.y + (snapshot.y - origin.y) * scaleY
      )
    }
  }

  private getTransformFixedPoint(
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
    handle: TransformHandleId
  ) {
    const centerX = bounds.xMin + (bounds.xMax - bounds.xMin) / 2
    const centerY = bounds.yMin + (bounds.yMax - bounds.yMin) / 2
    return {
      x: handle.includes('e')
        ? bounds.xMin
        : handle.includes('w')
          ? bounds.xMax
          : centerX,
      y: handle.includes('n')
        ? bounds.yMin
        : handle.includes('s')
          ? bounds.yMax
          : centerY,
    }
  }

  private getTransformMovingPoint(
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
    handle: TransformHandleId
  ) {
    const centerX = bounds.xMin + (bounds.xMax - bounds.xMin) / 2
    const centerY = bounds.yMin + (bounds.yMax - bounds.yMin) / 2
    return {
      x: handle.includes('e')
        ? bounds.xMax
        : handle.includes('w')
          ? bounds.xMin
          : centerX,
      y: handle.includes('n')
        ? bounds.yMax
        : handle.includes('s')
          ? bounds.yMin
          : centerY,
    }
  }

  private getSnappedDelta(
    path: {
      getPoint?(index: number): Point
      iterPoints?(): Generator<Point & { index: number }, void>
    },
    dx: number,
    dy: number
  ) {
    const gridStep = this.getGridSnapStep()
    let snappedDx = gridStep ? Math.round(dx / gridStep) * gridStep : dx
    let snappedDy = gridStep ? Math.round(dy / gridStep) * gridStep : dy
    const guides: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

    if (
      !path.getPoint ||
      !path.iterPoints ||
      !(
        this.dragState.mode === 'point-drag' ||
        this.dragState.mode === 'line-segment-drag' ||
        this.dragState.mode === 'curve-segment-drag'
      )
    ) {
      return { x: snappedDx, y: snappedDy, guides }
    }

    const movingIndices = new Set(this.dragState.activePointIndices)
    const movingPoints = Array.from(movingIndices)
      .map((index) => ({
        index,
        point: this.dragState.pathSnapshot.get(index) ?? path.getPoint?.(index),
      }))
      .filter((entry) => entry.point?.type === 'onCurve')

    if (!movingPoints.length) {
      return { x: snappedDx, y: snappedDy, guides }
    }

    const candidates = Array.from(path.iterPoints()).filter(
      (point) => point.type === 'onCurve' && !movingIndices.has(point.index)
    )
    const tolerance = 8 / this.canvasController.magnification

    let bestX: { diff: number; guideX: number; y1: number; y2: number } | null =
      null
    let bestY: { diff: number; guideY: number; x1: number; x2: number } | null =
      null

    for (const moving of movingPoints) {
      for (const candidate of candidates) {
        const diffX = candidate.x - (moving.point!.x + snappedDx)
        if (
          Math.abs(diffX) <= tolerance &&
          (!bestX || Math.abs(diffX) < Math.abs(bestX.diff))
        ) {
          bestX = {
            diff: diffX,
            guideX: candidate.x,
            y1: Math.min(candidate.y, moving.point!.y + snappedDy),
            y2: Math.max(candidate.y, moving.point!.y + snappedDy),
          }
        }

        const diffY = candidate.y - (moving.point!.y + snappedDy)
        if (
          Math.abs(diffY) <= tolerance &&
          (!bestY || Math.abs(diffY) < Math.abs(bestY.diff))
        ) {
          bestY = {
            diff: diffY,
            guideY: candidate.y,
            x1: Math.min(candidate.x, moving.point!.x + snappedDx),
            x2: Math.max(candidate.x, moving.point!.x + snappedDx),
          }
        }
      }
    }

    if (bestX) {
      snappedDx += bestX.diff
      guides.push({
        x1: bestX.guideX,
        y1: bestX.y1,
        x2: bestX.guideX,
        y2: bestX.y2,
      })
    }
    if (bestY) {
      snappedDy += bestY.diff
      guides.push({
        x1: bestY.x1,
        y1: bestY.guideY,
        x2: bestY.x2,
        y2: bestY.guideY,
      })
    }

    return { x: snappedDx, y: snappedDy, guides }
  }

  private toggleSmooth(
    path: {
      pointTypes?: Uint8Array
    },
    index: number
  ) {
    if (path.pointTypes) {
      const POINT_SMOOTH_FLAG = 0x08
      path.pointTypes[index] ^= POINT_SMOOTH_FLAG
    }
  }

  private invalidateGlyphPaths() {
    if (this.sceneModel.glyph?.glyph) {
      const glyph = this.sceneModel.glyph.glyph
      ;(glyph as { flattenedPath2d?: Path2D }).flattenedPath2d = undefined
      ;(glyph as { closedContoursPath2d?: Path2D }).closedContoursPath2d =
        undefined
    }
  }
}

async function* asyncEventIterator(
  eventStream: EventStream
): AsyncGenerator<ToolEvent, void, unknown> {
  while (true) {
    const event = await eventStream.next()
    if (event === undefined) break
    yield event
  }
}
