import { Box, Text } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VarPackedPath } from 'src/font/VarPackedPath'
import {
  useStore,
  type GlyphData,
  type GlyphComponentRef,
  type PathData,
  type PathNode,
} from 'src/store'

const PREVIEW_PADDING_X = 80
const PREVIEW_ASCENDER = 900
const PREVIEW_DESCENDER = -220
const PREVIEW_HEIGHT = PREVIEW_ASCENDER - PREVIEW_DESCENDER
const PREVIEW_MIN_X = -PREVIEW_PADDING_X

interface PreviewPart {
  id: string
  path2d: Path2D
  pathsToInsert: PathData[]
}

const generateId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`

const clonePath = (path: PathData): PathData => ({
  id: generateId('path'),
  closed: path.closed,
  nodes: path.nodes.map((node) => ({
    ...node,
    id: generateId('node'),
  })),
})

const buildVarPackedPathForPaths = (paths: PathData[]) =>
  VarPackedPath.fromUnpackedContours(
    paths.map((path) => ({
      isClosed: path.closed,
      points: path.nodes.map((node) => ({
        x: node.x,
        y: node.y,
        type:
          node.type === 'offcurve'
            ? 'offCurveCubic'
            : node.type === 'qcurve'
              ? 'offCurveQuad'
              : 'onCurve',
        smooth: node.type === 'smooth',
      })),
    }))
  )

const transformNode = (node: PathNode, matrix: DOMMatrix): PathNode => {
  const point = new DOMPoint(node.x, node.y).matrixTransform(matrix)
  return {
    ...node,
    x: Math.round(point.x),
    y: Math.round(point.y),
  }
}

const getPathBounds = (path: PathData) => {
  const xs = path.nodes.map((node) => node.x)
  const ys = path.nodes.map((node) => node.y)
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
    area:
      (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)),
  }
}

const createTestContext = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  return canvas.getContext('2d')
}

const buildRootPathParts = (glyph: GlyphData): PreviewPart[] => {
  if (glyph.paths.length === 0) {
    return []
  }

  const testContext = createTestContext()
  if (!testContext) {
    return glyph.paths.map((path) => ({
      id: `path:${path.id}`,
      path2d: new Path2D(buildVarPackedPathForPaths([path]).toSVGPath()),
      pathsToInsert: [clonePath(path)],
    }))
  }

  const singles = glyph.paths.map((path) => ({
    path,
    bounds: getPathBounds(path),
    path2d: new Path2D(buildVarPackedPathForPaths([path]).toSVGPath()),
    sample: path.nodes[0]
      ? { x: path.nodes[0].x, y: path.nodes[0].y }
      : { x: 0, y: 0 },
  }))

  const parentIndex = new Map<number, number | null>()
  for (let index = 0; index < singles.length; index += 1) {
    const candidate = singles[index]
    let parent: number | null = null
    let parentArea = Number.POSITIVE_INFINITY
    for (let otherIndex = 0; otherIndex < singles.length; otherIndex += 1) {
      if (index === otherIndex) {
        continue
      }
      const other = singles[otherIndex]
      if (other.bounds.area <= candidate.bounds.area) {
        continue
      }
      if (
        testContext.isPointInPath(
          other.path2d,
          candidate.sample.x,
          candidate.sample.y,
          'evenodd'
        ) &&
        other.bounds.area < parentArea
      ) {
        parent = otherIndex
        parentArea = other.bounds.area
      }
    }
    parentIndex.set(index, parent)
  }

  const groups = new Map<number, PathData[]>()
  for (let index = 0; index < singles.length; index += 1) {
    let root = index
    let current = parentIndex.get(index)
    while (current !== null && current !== undefined) {
      root = current
      current = parentIndex.get(current)
    }
    const paths = groups.get(root) ?? []
    paths.push(singles[index].path)
    groups.set(root, paths)
  }

  return [...groups.entries()].map(([rootIndex, paths]) => ({
    id: `path-group:${singles[rootIndex].path.id}`,
    path2d: new Path2D(buildVarPackedPathForPaths(paths).toSVGPath()),
    pathsToInsert: paths.map(clonePath),
  }))
}

const materializeComponentPaths = (
  glyphMap: Record<string, GlyphData>,
  glyphId: string,
  matrix = new DOMMatrix(),
  visited = new Set<string>(),
  depth = 0
): PathData[] => {
  if (visited.has(glyphId) || depth > 8) {
    return []
  }

  const glyph = glyphMap[glyphId]
  if (!glyph) {
    return []
  }

  const nextVisited = new Set(visited)
  nextVisited.add(glyphId)
  const paths = glyph.paths.map((path) => ({
    id: generateId('path'),
    closed: path.closed,
    nodes: path.nodes.map((node) => ({
      ...transformNode(node, matrix),
      id: generateId('node'),
    })),
  }))

  for (const component of glyph.componentRefs) {
    const componentMatrix = matrix
      .translate(component.x, component.y)
      .rotate(component.rotation)
      .scale(component.scaleX, component.scaleY)
    paths.push(
      ...materializeComponentPaths(
        glyphMap,
        component.glyphId,
        componentMatrix,
        nextVisited,
        depth + 1
      )
    )
  }

  return paths
}

const buildComponentParts = (
  glyphMap: Record<string, GlyphData>,
  components: GlyphComponentRef[]
): PreviewPart[] =>
  components.flatMap((component) => {
    const paths = materializeComponentPaths(
      glyphMap,
      component.glyphId,
      new DOMMatrix()
        .translate(component.x, component.y)
        .rotate(component.rotation)
        .scale(component.scaleX, component.scaleY)
    )
    if (paths.length === 0) {
      return []
    }

    return [
      {
        id: `component:${component.id}`,
        path2d: new Path2D(buildVarPackedPathForPaths(paths).toSVGPath()),
        pathsToInsert: paths,
      },
    ]
  })

const getPreviewWidth = (glyph: GlyphData) =>
  Math.max(glyph.metrics.width || 0, 240)

const getPreviewTransform = (
  cssWidth: number,
  cssHeight: number,
  glyphWidth: number
) => {
  const viewWidth = glyphWidth + PREVIEW_PADDING_X * 2
  const scale = Math.min(cssWidth / viewWidth, cssHeight / PREVIEW_HEIGHT)
  const offsetX = (cssWidth - viewWidth * scale) / 2
  const offsetY = (cssHeight - PREVIEW_HEIGHT * scale) / 2

  return {
    scale,
    e: offsetX - PREVIEW_MIN_X * scale,
    f: offsetY + PREVIEW_ASCENDER * scale,
  }
}

export function GlyphReadonlyReference({
  glyph,
  glyphMap,
}: {
  glyph: GlyphData
  glyphMap: Record<string, GlyphData>
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const createPath = useStore((state) => state.createPath)
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null)
  const [forceRedraw, setForceRedraw] = useState(0)
  const width = useMemo(() => getPreviewWidth(glyph), [glyph])
  const previewParts = useMemo(
    () => [
      ...buildComponentParts(glyphMap, glyph.componentRefs),
      ...buildRootPathParts(glyph),
    ],
    [glyph, glyphMap]
  )

  const drawPreview = useCallback(
    (hoveredId: string | null) => {
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }

      const context = canvas.getContext('2d')
      if (!context) {
        return
      }

      const dpr = window.devicePixelRatio || 1
      const cssWidth = canvas.clientWidth || 320
      const cssHeight = canvas.clientHeight || 220
      canvas.width = Math.floor(cssWidth * dpr)
      canvas.height = Math.floor(cssHeight * dpr)
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.scale(dpr, dpr)

      const { scale, e, f } = getPreviewTransform(cssWidth, cssHeight, width)

      context.fillStyle = '#fff'
      context.fillRect(0, 0, cssWidth, cssHeight)
      context.setTransform(scale * dpr, 0, 0, -scale * dpr, e * dpr, f * dpr)

      for (const part of previewParts) {
        context.fillStyle = part.id === hoveredId ? '#1E88A8' : '#000'
        context.fill(part.path2d, 'evenodd')
      }
    },
    [previewParts, width]
  )

  useEffect(() => {
    drawPreview(hoveredPartId)
  }, [drawPreview, hoveredPartId, forceRedraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      setForceRedraw((prev) => prev + 1)
    })
    observer.observe(canvas)

    return () => observer.disconnect()
  }, [])

  const toFontPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return null
    }

    const bounds = canvas.getBoundingClientRect()
    const cssWidth = bounds.width || 1
    const cssHeight = bounds.height || 1
    const { scale, e, f } = getPreviewTransform(cssWidth, cssHeight, width)
    const x = (clientX - bounds.left - e) / scale
    const y = (f - (clientY - bounds.top)) / scale
    return { x, y }
  }

  const hitTestPart = (point: { x: number; y: number }) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return null
    }

    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    for (let index = previewParts.length - 1; index >= 0; index -= 1) {
      const part = previewParts[index]
      if (context.isPointInPath(part.path2d, point.x, point.y, 'evenodd')) {
        context.restore()
        return part
      }
    }
    context.restore()
    return null
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toFontPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }
    const part = hitTestPart(point)
    setHoveredPartId(part?.id ?? null)
  }

  const handlePointerLeave = () => {
    setHoveredPartId(null)
  }

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = toFontPoint(event.clientX, event.clientY)
    const part = point ? hitTestPart(point) : null
    if (!part || !selectedGlyphId) {
      return
    }

    for (const path of part.pathsToInsert) {
      createPath(selectedGlyphId, clonePath(path))
    }
  }

  return (
    <Box
      bg="field.panel"
      borderRadius="sm"
      overflow="hidden"
      px={2}
      py={2}
      userSelect="none"
    >
      <Text fontSize="xs" color="field.muted" mb={2} fontFamily="mono">
        滑過部件會高亮，點擊可直接複製進目前編輯字。
      </Text>
      <Box
        as="canvas"
        ref={canvasRef}
        display="block"
        w="100%"
        h="220px"
        cursor="pointer"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />
    </Box>
  )
}
