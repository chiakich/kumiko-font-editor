import type { Point } from 'src/canvas/SceneView'
import type { HitTestResult } from 'src/features/editor/tools/SceneController'
import {
  findContourBounds,
  stepContourIndex,
} from 'src/features/editor/tools/PointerTool/selection'
import type { LinkedHandleDrag } from 'src/features/editor/tools/PointerTool/state'

export const getLinkedHandleDrag = (
  path: {
    getPoint?(index: number): Point
    contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
  },
  hit: HitTestResult
): LinkedHandleDrag | undefined => {
  if (hit.type !== 'handle' || !path.getPoint || !path.contourInfo?.length) {
    return undefined
  }

  const contourBounds = findContourBounds(path.contourInfo, hit.pointIndex)
  if (!contourBounds) {
    return undefined
  }

  const previousIndex = stepContourIndex(hit.pointIndex, -1, contourBounds)
  const nextIndex = stepContourIndex(hit.pointIndex, 1, contourBounds)
  const previousPoint =
    previousIndex === null ? null : path.getPoint(previousIndex)
  const nextPoint = nextIndex === null ? null : path.getPoint(nextIndex)

  let anchorIndex: number | null = null
  let oppositeHandleIndex: number | null = null

  if (previousPoint?.type === 'onCurve' && previousIndex !== null) {
    anchorIndex = previousIndex
    oppositeHandleIndex = findAdjacentHandleIndex(
      path,
      previousIndex,
      -1,
      contourBounds
    )
  } else if (nextPoint?.type === 'onCurve' && nextIndex !== null) {
    anchorIndex = nextIndex
    oppositeHandleIndex = findAdjacentHandleIndex(
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

export const getLinkedSmoothHandlePosition = (
  linkedHandle: LinkedHandleDrag | undefined,
  pathSnapshot: Map<number, Point>,
  dx: number,
  dy: number
) => {
  if (!linkedHandle) {
    return undefined
  }

  const draggedSnapshot = pathSnapshot.get(linkedHandle.draggedHandleIndex)
  const anchorSnapshot = pathSnapshot.get(linkedHandle.anchorIndex)
  const oppositeSnapshot = pathSnapshot.get(linkedHandle.oppositeHandleIndex)
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

const findAdjacentHandleIndex = (
  path: { getPoint?(index: number): Point },
  anchorIndex: number,
  direction: -1 | 1,
  contourBounds: { start: number; end: number; isClosed: boolean }
) => {
  const candidateIndex = stepContourIndex(anchorIndex, direction, contourBounds)
  if (candidateIndex === null || !path.getPoint) {
    return null
  }

  const candidatePoint = path.getPoint(candidateIndex)
  if (!candidatePoint || candidatePoint.type === 'onCurve') {
    return null
  }

  return candidateIndex
}
