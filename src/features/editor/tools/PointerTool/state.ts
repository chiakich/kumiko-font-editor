import type { PathHitInfo, Point } from 'src/canvas/SceneView'
import type { HitTestResult } from 'src/features/editor/tools/SceneController'
import type { PointerSelectionMode } from 'src/features/editor/tools/PointerTool/selection'
import type { TransformHandleId } from 'src/features/editor/tools/PointerTool/transform'

export type DragMode =
  | 'pending'
  | 'point-drag'
  | 'line-segment-drag'
  | 'curve-segment-drag'
  | 'curve-segment-deform'
  | 'transform-scale'
  | 'rect-select'

export interface LinkedHandleDrag {
  draggedHandleIndex: number
  anchorIndex: number
  oppositeHandleIndex: number
}

export interface PointerDragState {
  mode: DragMode
  anchorPoint: { x: number; y: number }
  currentPoint: { x: number; y: number }
  pendingHit: HitTestResult
  selectionMode: PointerSelectionMode
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
  linkedHandle?: LinkedHandleDrag
  didMove: boolean
  altKey: boolean
  transformHandle?: TransformHandleId
  transformBounds?: { xMin: number; yMin: number; xMax: number; yMax: number }
  pointToggleOnClick?: { selectionKey: string; remove: boolean }
}

export const createInitialPointerDragState = (): PointerDragState => ({
  mode: 'pending',
  anchorPoint: { x: 0, y: 0 },
  currentPoint: { x: 0, y: 0 },
  pendingHit: { type: 'empty', selection: new Set() } as HitTestResult,
  selectionMode: 'replace',
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
})

export const capturePointSnapshot = (
  path: { getPoint?(index: number): Point },
  pointIndices: number[]
) => {
  const snapshot = new Map<number, Point>()
  for (const index of pointIndices) {
    const point = path.getPoint?.(index)
    if (point) {
      snapshot.set(index, { ...point })
    }
  }
  return snapshot
}
