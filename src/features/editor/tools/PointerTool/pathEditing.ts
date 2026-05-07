import type { Point } from 'src/canvas/SceneView'
import { findAttachedHandleIndices } from 'src/features/editor/tools/PointerTool/selection'
import { getGridSnapStep } from 'src/features/editor/tools/PointerTool/snap'

export interface MutablePointPath {
  setPoint?(
    index: number,
    point: { x: number; y: number; type?: string; smooth?: boolean }
  ): void
  getPoint?(index: number): Point
  coordinates?: Float64Array
  contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
  getControlBounds?(): { xMin: number; xMax: number } | undefined
  pointTypes?: Uint8Array
}

export const updatePointPosition = (
  path: MutablePointPath,
  input: {
    index: number
    x: number
    y: number
    magnification: number
  }
) => {
  let { x, y } = input
  const gridStep = getGridSnapStep(input.magnification)
  if (gridStep) {
    x = Math.round(x / gridStep) * gridStep
    y = Math.round(y / gridStep) * gridStep
  }

  if (path.setPoint) {
    const existingPoint = path.getPoint?.(input.index)
    path.setPoint(input.index, {
      x,
      y,
      type: existingPoint?.type,
      smooth: existingPoint?.smooth,
    })
  } else if (path.coordinates) {
    path.coordinates[input.index * 2] = x
    path.coordinates[input.index * 2 + 1] = y
  }
}

export const deformDraggedSegment = (
  path: MutablePointPath,
  input: {
    pointIndices: number[]
    pathSnapshot: Map<number, Point>
    dx: number
    dy: number
  }
) => {
  for (
    let segmentIndex = 0;
    segmentIndex < input.pointIndices.length;
    segmentIndex += 1
  ) {
    const pointIndex = input.pointIndices[segmentIndex]
    const snapshotPoint = input.pathSnapshot.get(pointIndex)
    if (!snapshotPoint || !path.setPoint) {
      continue
    }

    const isEndpoint =
      segmentIndex === 0 || segmentIndex === input.pointIndices.length - 1
    const factor = isEndpoint ? 0 : 1
    path.setPoint(pointIndex, {
      x: snapshotPoint.x + input.dx * factor,
      y: snapshotPoint.y + input.dy * factor,
      type: snapshotPoint.type,
      smooth: snapshotPoint.smooth,
    })
  }
}

export const expandPointIndicesForMove = (
  path: MutablePointPath,
  pointIndices: number[]
): number[] => {
  const expanded = new Set<number>(pointIndices)

  if (!path.getPoint || !path.contourInfo?.length) {
    return [...expanded]
  }

  for (const index of pointIndices) {
    const point = path.getPoint(index)
    if (!point || point.type !== 'onCurve') {
      continue
    }

    for (const attachedIndex of findAttachedHandleIndices(path, index)) {
      expanded.add(attachedIndex)
    }
  }

  return [...expanded]
}

export const getPreviewGlyphMetrics = (
  path: MutablePointPath,
  width: number | undefined
) => {
  const bounds = path.getControlBounds?.()
  if (typeof width !== 'number') {
    return null
  }

  return {
    lsb: Math.round(bounds?.xMin ?? 0),
    rsb: Math.round(width - (bounds?.xMax ?? width)),
    width,
  }
}

export const toggleSmoothFlag = (
  path: {
    pointTypes?: Uint8Array
  },
  index: number
) => {
  if (path.pointTypes) {
    const POINT_SMOOTH_FLAG = 0x08
    path.pointTypes[index] ^= POINT_SMOOTH_FLAG
  }
}

export const invalidateGlyphPathCache = (glyph: unknown) => {
  if (!glyph) {
    return
  }
  ;(glyph as { flattenedPath2d?: Path2D }).flattenedPath2d = undefined
  ;(glyph as { closedContoursPath2d?: Path2D }).closedContoursPath2d = undefined
}
