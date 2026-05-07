import type { PathHitInfo, Point } from 'src/canvas/SceneView'
import { pointSelectionKey } from 'src/lib/glyphSelection'
import type { HitTestResult } from 'src/features/editor/tools/SceneController'

export type PointerSelectionMode = 'replace' | 'add' | 'toggle'

export const getPointerSelectionMode = (event: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): PointerSelectionMode => {
  if (event.metaKey || event.ctrlKey) {
    return 'toggle'
  }
  if (event.shiftKey) {
    return 'add'
  }
  return 'replace'
}

export const applyPointerSelectionMode = (
  selection: Set<string>,
  initialSelection: Set<string>,
  mode: PointerSelectionMode
) => {
  if (mode === 'toggle') {
    const nextSelection = new Set(initialSelection)
    for (const item of selection) {
      if (nextSelection.has(item)) {
        nextSelection.delete(item)
      } else {
        nextSelection.add(item)
      }
    }
    return nextSelection
  }

  if (mode === 'add') {
    return new Set([...initialSelection, ...selection])
  }

  return selection
}

export const buildPointSelectionFromSelection = (selection: Set<string>) => {
  const selectedPointIndices: number[] = []
  for (const item of selection) {
    const match = item.match(/^point\/(\d+)$/)
    if (match) {
      selectedPointIndices.push(Number.parseInt(match[1], 10))
    }
  }
  return selectedPointIndices
}

export const getSegmentEndpointSelection = (
  hit: Extract<HitTestResult, { type: 'line-segment' | 'curve-segment' }>
) => {
  const pointIndices = hit.pathHit.segment.pointIndices
  if (pointIndices.length < 2) {
    return new Set<string>()
  }

  return new Set([
    pointSelectionKey(pointIndices[0]),
    pointSelectionKey(pointIndices[pointIndices.length - 1]),
  ])
}

export const getContourSelection = (
  hit: Extract<HitTestResult, { type: 'line-segment' | 'curve-segment' }>,
  path:
    | {
        contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
      }
    | undefined
) => {
  const contourIndex = hit.pathHit.segment.contourIndex
  if (contourIndex === undefined || !path?.contourInfo?.[contourIndex]) {
    return getSegmentEndpointSelection(hit)
  }

  const startPoint =
    contourIndex === 0 ? 0 : path.contourInfo[contourIndex - 1].endPoint + 1
  const endPoint = path.contourInfo[contourIndex].endPoint
  const selection = new Set<string>()
  for (let index = startPoint; index <= endPoint; index += 1) {
    selection.add(pointSelectionKey(index))
  }
  return selection
}

export const isSameSegment = (a?: PathHitInfo, b?: PathHitInfo) =>
  !!a?.segment.key && !!b?.segment.key && a.segment.key === b.segment.key

export const getPointByIndex = (
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
) => {
  for (const pt of path.iterPoints()) {
    if (pt.index === index) return pt
  }
  return null
}

export const findContourBounds = (
  contourInfo: Array<{ endPoint: number; isClosed?: boolean }>,
  pointIndex: number
): { start: number; end: number; isClosed: boolean } | null => {
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

export const isOpenContourEndpoint = (
  path: {
    contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
  },
  pointIndex: number
) => {
  if (!path.contourInfo?.length) {
    return false
  }

  const contourBounds = findContourBounds(path.contourInfo, pointIndex)
  if (!contourBounds || contourBounds.isClosed) {
    return false
  }

  return pointIndex === contourBounds.start || pointIndex === contourBounds.end
}

export const stepContourIndex = (
  index: number,
  direction: -1 | 1,
  contourBounds: { start: number; end: number; isClosed: boolean }
) => {
  let nextIndex = index + direction
  if (nextIndex < contourBounds.start || nextIndex > contourBounds.end) {
    if (!contourBounds.isClosed) {
      return null
    }
    nextIndex = direction > 0 ? contourBounds.start : contourBounds.end
  }
  return nextIndex
}

export const findAttachedHandleIndices = (
  path: {
    getPoint?(index: number): Point
    contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
  },
  pointIndex: number
): number[] => {
  if (!path.getPoint || !path.contourInfo?.length) {
    return []
  }

  const contourBounds = findContourBounds(path.contourInfo, pointIndex)
  if (!contourBounds) {
    return []
  }

  const attached = new Set<number>()
  collectHandleRun(path, pointIndex, -1, contourBounds, attached)
  collectHandleRun(path, pointIndex, 1, contourBounds, attached)
  return [...attached]
}

const collectHandleRun = (
  path: {
    getPoint?(index: number): Point
  },
  startIndex: number,
  direction: -1 | 1,
  contourBounds: { start: number; end: number; isClosed: boolean },
  attached: Set<number>
) => {
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
