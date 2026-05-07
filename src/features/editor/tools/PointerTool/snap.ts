import type { Point } from 'src/canvas/SceneView'
import type { DragMode } from 'src/features/editor/tools/PointerTool/state'

export const getGridSnapStep = (magnification: number) => {
  if (magnification >= 32) {
    return 1
  }
  if (magnification >= 10) {
    return 10
  }
  return 0
}

export const getSnappedDelta = (
  path: {
    getPoint?(index: number): Point
    iterPoints?(): Generator<Point & { index: number }, void>
  },
  input: {
    activePointIndices: number[]
    mode: DragMode
    pathSnapshot: Map<number, Point>
    magnification: number
    dx: number
    dy: number
  }
) => {
  const gridStep = getGridSnapStep(input.magnification)
  let snappedDx = gridStep
    ? Math.round(input.dx / gridStep) * gridStep
    : input.dx
  let snappedDy = gridStep
    ? Math.round(input.dy / gridStep) * gridStep
    : input.dy
  const guides: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

  if (
    !path.getPoint ||
    !path.iterPoints ||
    !(
      input.mode === 'point-drag' ||
      input.mode === 'line-segment-drag' ||
      input.mode === 'curve-segment-drag'
    )
  ) {
    return { x: snappedDx, y: snappedDy, guides }
  }

  const movingIndices = new Set(input.activePointIndices)
  const movingPoints = Array.from(movingIndices)
    .map((index) => ({
      index,
      point: input.pathSnapshot.get(index) ?? path.getPoint?.(index),
    }))
    .filter((entry) => entry.point?.type === 'onCurve')

  if (!movingPoints.length) {
    return { x: snappedDx, y: snappedDy, guides }
  }

  const candidates = Array.from(path.iterPoints()).filter(
    (point) => point.type === 'onCurve' && !movingIndices.has(point.index)
  )
  const tolerance = 8 / input.magnification

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
