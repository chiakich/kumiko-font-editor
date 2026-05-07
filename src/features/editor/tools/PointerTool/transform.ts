import type { Point, SceneModel } from 'src/canvas/SceneView'

export type TransformHandleId =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'

export interface SelectionTransformBounds {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  handles: Array<{
    id: TransformHandleId
    x: number
    y: number
  }>
}

export const buildSelectionTransformBounds = (
  path: { getPoint?(index: number): Point } | undefined,
  selectedPointIndices: number[]
): SelectionTransformBounds | undefined => {
  if (!path?.getPoint || selectedPointIndices.length < 2) {
    return undefined
  }

  const points = selectedPointIndices
    .map((index) => path.getPoint?.(index))
    .filter((point): point is Point => Boolean(point))
  if (points.length < 2) {
    return undefined
  }

  const xMin = Math.min(...points.map((point) => point.x))
  const yMin = Math.min(...points.map((point) => point.y))
  const xMax = Math.max(...points.map((point) => point.x))
  const yMax = Math.max(...points.map((point) => point.y))
  if (xMax === xMin && yMax === yMin) {
    return undefined
  }

  const centerX = xMin + (xMax - xMin) / 2
  const centerY = yMin + (yMax - yMin) / 2

  return {
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

export const getTransformHandleAtPoint = (
  point: { x: number; y: number },
  bounds: SceneModel['selectionTransformBounds'],
  magnification: number
) => {
  if (!bounds) {
    return undefined
  }

  const handleRadius = 7 / magnification
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

export const getTransformCursor = (handle: TransformHandleId) => {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

export const getTransformScaleUpdate = (input: {
  activePointIndices: number[]
  altKey: boolean
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number }
  currentPoint: { x: number; y: number }
  handle: TransformHandleId
  pathSnapshot: Map<number, Point>
}) => {
  const fixed = getTransformFixedPoint(input.bounds, input.handle)
  const moving = getTransformMovingPoint(input.bounds, input.handle)
  const origin = input.altKey
    ? {
        x: input.bounds.xMin + (input.bounds.xMax - input.bounds.xMin) / 2,
        y: input.bounds.yMin + (input.bounds.yMax - input.bounds.yMin) / 2,
      }
    : fixed

  let scaleX =
    input.handle === 'n' || input.handle === 's'
      ? 1
      : (input.currentPoint.x - origin.x) / (moving.x - origin.x || 1)
  let scaleY =
    input.handle === 'e' || input.handle === 'w'
      ? 1
      : (input.currentPoint.y - origin.y) / (moving.y - origin.y || 1)

  if (Math.abs(scaleX) < 0.02) scaleX = Math.sign(scaleX || 1) * 0.02
  if (Math.abs(scaleY) < 0.02) scaleY = Math.sign(scaleY || 1) * 0.02

  if (input.altKey) {
    scaleX = input.handle === 'n' || input.handle === 's' ? 1 : scaleX
    scaleY = input.handle === 'e' || input.handle === 'w' ? 1 : scaleY
  }

  return input.activePointIndices.flatMap((index) => {
    const snapshot = input.pathSnapshot.get(index)
    if (!snapshot) {
      return []
    }
    return [
      {
        index,
        x: origin.x + (snapshot.x - origin.x) * scaleX,
        y: origin.y + (snapshot.y - origin.y) * scaleY,
      },
    ]
  })
}

const getTransformFixedPoint = (
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
  handle: TransformHandleId
) => {
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

const getTransformMovingPoint = (
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
  handle: TransformHandleId
) => {
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
