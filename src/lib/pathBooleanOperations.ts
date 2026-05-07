import paper from 'paper'
import type { PathData, PathNode } from 'src/store/types'

export type PathBooleanOperation = 'union' | 'subtract' | 'intersect' | 'divide'

const isOnCurve = (node: PathNode) =>
  node.type === 'corner' || node.type === 'smooth'

const generateId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`

const isZeroHandle = (point: paper.Point) =>
  Math.abs(point.x) < 0.0001 && Math.abs(point.y) < 0.0001

const absoluteHandle = (point: paper.Point, handle: paper.Point) => ({
  x: Math.round(point.x + handle.x),
  y: Math.round(point.y + handle.y),
  type: 'offcurve' as const,
  id: generateId('node'),
})

export const buildBooleanOperationPaths = (
  paths: PathData[],
  operation: PathBooleanOperation
): PathData[] => {
  const closedPaths = paths.filter(
    (path) => path.closed && path.nodes.length > 2
  )
  if (closedPaths.length < 2) {
    return []
  }

  const scope = new paper.PaperScope()
  scope.setup(new scope.Size(1, 1))

  const paperPaths = closedPaths.flatMap((path) => {
    const paperPath = pathToPaperPath(scope, path)
    return paperPath ? [paperPath] : []
  })
  if (paperPaths.length < 2) {
    scope.project.remove()
    return []
  }

  let result = paperPaths[0] as paper.PathItem
  for (const nextPath of paperPaths.slice(1)) {
    result = applyPaperOperation(result, nextPath, operation)
  }

  const resultPaths = collectPaperPaths(result).flatMap((pathItem, index) => {
    const pathData = paperPathToPathData(pathItem, `path_${operation}_${index}`)
    return pathData ? [pathData] : []
  })
  scope.project.remove()
  return resultPaths
}

const applyPaperOperation = (
  source: paper.PathItem,
  target: paper.PathItem,
  operation: PathBooleanOperation
) => {
  const options = { insert: false, trace: true }
  if (operation === 'union') return source.unite(target, options)
  if (operation === 'subtract') return source.subtract(target, options)
  if (operation === 'intersect') return source.intersect(target, options)
  return source.divide(target, options)
}

const pathToPaperPath = (scope: paper.PaperScope, path: PathData) => {
  const nodes = rotateToFirstOnCurve(path.nodes)
  const onCurveIndices = nodes
    .map((node, index) => (isOnCurve(node) ? index : -1))
    .filter((index) => index >= 0)
  if (onCurveIndices.length < 2) {
    return null
  }

  const paperPath = new scope.Path({ insert: false })
  const firstNode = nodes[onCurveIndices[0]]
  paperPath.moveTo(new scope.Point(firstNode.x, firstNode.y))

  for (
    let segmentIndex = 0;
    segmentIndex < onCurveIndices.length;
    segmentIndex += 1
  ) {
    const startIndex = onCurveIndices[segmentIndex]
    const nextOnCurveIndex = onCurveIndices[segmentIndex + 1]
    if (nextOnCurveIndex === undefined && !path.closed) {
      break
    }

    const endIndex = nextOnCurveIndex ?? onCurveIndices[0] + nodes.length
    const endNode = nodes[endIndex % nodes.length]
    const handles: PathNode[] = []
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const node = nodes[index % nodes.length]
      if (!isOnCurve(node)) {
        handles.push(node)
      }
    }

    if (handles.length >= 2) {
      paperPath.cubicCurveTo(
        new scope.Point(handles[0].x, handles[0].y),
        new scope.Point(
          handles[handles.length - 1].x,
          handles[handles.length - 1].y
        ),
        new scope.Point(endNode.x, endNode.y)
      )
    } else if (handles.length === 1) {
      paperPath.quadraticCurveTo(
        new scope.Point(handles[0].x, handles[0].y),
        new scope.Point(endNode.x, endNode.y)
      )
    } else {
      paperPath.lineTo(new scope.Point(endNode.x, endNode.y))
    }
  }

  paperPath.closed = path.closed
  return paperPath
}

const rotateToFirstOnCurve = (nodes: PathNode[]) => {
  const firstOnCurveIndex = nodes.findIndex(isOnCurve)
  if (firstOnCurveIndex <= 0) {
    return nodes
  }
  return [
    ...nodes.slice(firstOnCurveIndex),
    ...nodes.slice(0, firstOnCurveIndex),
  ]
}

const collectPaperPaths = (item: paper.Item): paper.Path[] => {
  if (item instanceof paper.Path) {
    return item.segments.length > 1 ? [item] : []
  }

  return item.children?.flatMap((child) => collectPaperPaths(child)) ?? []
}

const paperPathToPathData = (
  path: paper.Path,
  idSeed: string
): PathData | null => {
  if (path.segments.length < 2 || Math.abs(path.area) < 0.01) {
    return null
  }

  const nodes: PathNode[] = []
  const segmentCount = path.segments.length
  const curveCount = path.closed ? segmentCount : segmentCount - 1

  for (let index = 0; index < segmentCount; index += 1) {
    const segment = path.segments[index]
    const hasHandleIn = !isZeroHandle(segment.handleIn)
    const hasHandleOut = !isZeroHandle(segment.handleOut)
    nodes.push({
      id: generateId('node'),
      x: Math.round(segment.point.x),
      y: Math.round(segment.point.y),
      type: hasHandleIn || hasHandleOut ? 'smooth' : 'corner',
    })

    if (index >= curveCount) {
      continue
    }

    const nextSegment = path.segments[(index + 1) % segmentCount]
    if (!isZeroHandle(segment.handleOut)) {
      nodes.push(absoluteHandle(segment.point, segment.handleOut))
    }
    if (!isZeroHandle(nextSegment.handleIn)) {
      nodes.push(absoluteHandle(nextSegment.point, nextSegment.handleIn))
    }
  }

  return {
    id: `${idSeed}_${generateId('path')}`,
    closed: path.closed,
    nodes,
  }
}
