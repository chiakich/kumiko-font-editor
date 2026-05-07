import type { PositionedGlyph } from 'src/canvas/SceneView'
import type { SceneControllerInterface } from 'src/features/editor/tools/BaseTool'
import { getLinkedSmoothHandlePosition } from 'src/features/editor/tools/PointerTool/handles'
import type { PointerDragState } from 'src/features/editor/tools/PointerTool/state'

export const commitMovedPoints = (
  glyph: PositionedGlyph | undefined,
  sceneController: SceneControllerInterface,
  dragState: PointerDragState
) => {
  if (!glyph?.glyph.path) {
    return
  }

  const glyphId = glyph.glyphId
  const pointRefs = glyph.pointRefs ?? []
  if (!glyphId || !sceneController.onCommitNodePositions) {
    return
  }

  const uniquePointIndices = Array.from(new Set(dragState.activePointIndices))
  const committedPointIndices = dragState.linkedHandle
    ? Array.from(
        new Set([
          ...uniquePointIndices,
          dragState.linkedHandle.oppositeHandleIndex,
        ])
      )
    : uniquePointIndices
  const dx = dragState.snappedDelta.x
  const dy = dragState.snappedDelta.y
  const updates = committedPointIndices.flatMap((idx) => {
    const pointRef = pointRefs[idx]
    const snapshotPoint = dragState.pathSnapshot.get(idx)
    if (!pointRef || !snapshotPoint) {
      return []
    }

    let newPos = { x: snapshotPoint.x, y: snapshotPoint.y }

    if (
      dragState.mode === 'point-drag' ||
      dragState.mode === 'line-segment-drag' ||
      dragState.mode === 'curve-segment-drag'
    ) {
      newPos = {
        x: snapshotPoint.x + dx,
        y: snapshotPoint.y + dy,
      }

      if (
        dragState.mode === 'point-drag' &&
        dragState.linkedHandle?.oppositeHandleIndex === idx
      ) {
        newPos =
          getLinkedSmoothHandlePosition(
            dragState.linkedHandle,
            dragState.pathSnapshot,
            dx,
            dy
          ) ?? newPos
      }
    } else if (dragState.mode === 'curve-segment-deform') {
      const pointIndex = dragState.activePointIndices.indexOf(idx)
      const isEndpoint =
        pointIndex === 0 ||
        pointIndex === dragState.activePointIndices.length - 1
      const factor = isEndpoint ? 0 : 1
      newPos = {
        x: snapshotPoint.x + dx * factor,
        y: snapshotPoint.y + dy * factor,
      }
    } else if (dragState.mode === 'transform-scale') {
      const point = glyph.glyph.path.getPoint?.(idx)
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
    sceneController.onCommitNodePositions(glyphId, updates)
  }
}
