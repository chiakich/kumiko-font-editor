// 編輯工具

import type { CanvasController } from 'src/canvas/CanvasController'
import type { SceneModel } from 'src/canvas/SceneView'

export interface ToolEvent {
  x: number
  y: number
  pageX: number
  pageY: number
  detail?: number
  myTapCount?: number
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  downPoint?: { x: number; y: number }
  preventDefault(): void
}

export interface EventStream {
  next(): Promise<ToolEvent | undefined>
  done(): void
}

export interface SceneControllerInterface {
  selection: Set<string>
  hoverSelection: Set<string>
  selectedPathHit?: {
    segment: {
      points: { x: number; y: number }[]
      pointIndices: number[]
      type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
      contourIndex?: number
      key?: string
    }
    x: number
    y: number
  }
  hoverPathHit?: {
    segment: {
      points: { x: number; y: number }[]
      pointIndices: number[]
      type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
      contourIndex?: number
      key?: string
    }
    x: number
    y: number
  }
  mouseClickMargin: number
  setHoverSelection(selection: Set<string>): void
  setHoverPathHit(pathHit?: {
    segment: {
      points: { x: number; y: number }[]
      pointIndices: number[]
      type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
      contourIndex?: number
      key?: string
    }
    x: number
    y: number
  }): void
  setSelectedPathHit(pathHit?: {
    segment: {
      points: { x: number; y: number }[]
      pointIndices: number[]
      type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
      contourIndex?: number
      key?: string
    }
    x: number
    y: number
  }): void
  localPoint(event: { pageX: number; pageY: number }): { x: number; y: number }
  hitTestAtPoint(
    point: { x: number; y: number },
    size: number,
    currentSelection?: Set<string>
  ):
    | { type: 'point' | 'handle'; pointIndex: number; selection: Set<string> }
    | {
        type: 'line-segment' | 'curve-segment'
        pathHit: {
          segment: {
            points: { x: number; y: number }[]
            pointIndices: number[]
            type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
            contourIndex?: number
            key?: string
          }
          x: number
          y: number
        }
        selection: Set<string>
      }
    | { type: 'contour-interior'; contourIndex: number; selection: Set<string> }
    | { type: 'empty'; selection: Set<string> }
  selectionAtPoint(
    point: { x: number; y: number },
    size: number,
    currentSelection: Set<string>,
    hoverSelection: Set<string>,
    altKey: boolean
  ): {
    selection: Set<string>
    pathHit?: {
      segment: { points: { x: number; y: number }[]; pointIndices: number[] }
      x: number
      y: number
    }
  }
  pathHitAtPoint(
    point: { x: number; y: number },
    size: number
  ): {
    segment: {
      points: { x: number; y: number }[]
      pointIndices: number[]
      type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
      contourIndex?: number
      key?: string
    }
    x: number
    y: number
  } | null
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
  setSelection(selection: Set<string>): void
  previewSelection(selection: Set<string>): void
}

export abstract class BaseTool {
  identifier: string = 'base-tool'
  iconPath?: string

  protected canvasController: CanvasController
  protected sceneController: SceneControllerInterface
  protected sceneModel: SceneModel

  constructor(
    canvasController: CanvasController,
    sceneController: SceneControllerInterface,
    sceneModel: SceneModel
  ) {
    this.canvasController = canvasController
    this.sceneController = sceneController
    this.sceneModel = sceneModel
  }

  // Lifecycle methods
  activate(): void {
    // Override in subclass
  }

  deactivate(): void {
    this.setCursor()
  }

  // Event handlers
  handleHover(event: ToolEvent): void {
    void event
    // Override in subclass
  }

  abstract handleDrag(
    eventStream: EventStream,
    initialEvent: ToolEvent
  ): Promise<void>

  // Utility methods
  setCursor(cursor?: string): void {
    if (cursor) {
      this.canvasController.canvas.style.cursor = cursor
    } else {
      this.canvasController.canvas.style.cursor = 'default'
    }
  }

  localPoint(event: ToolEvent): { x: number; y: number } {
    const point = this.canvasController.localPoint({
      x: event.pageX,
      y: event.pageY,
    })
    const glyphX = this.sceneModel.glyph?.x ?? 0
    const glyphY = this.sceneModel.glyph?.y ?? 0
    return {
      x: point.x - glyphX,
      y: point.y - glyphY,
    }
  }

  // Helper to determine if we should start a drag
  static shouldInitiateDrag(
    downPoint: { x: number; y: number },
    movePoint: { x: number; y: number },
    threshold: number = 3
  ): boolean {
    const dx = Math.abs(movePoint.x - downPoint.x)
    const dy = Math.abs(movePoint.y - downPoint.y)
    return dx > threshold || dy > threshold
  }
}
