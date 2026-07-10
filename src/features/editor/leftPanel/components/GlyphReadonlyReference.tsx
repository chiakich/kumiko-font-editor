import { Box, Text } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VarPackedPath } from 'src/font/VarPackedPath'
import { getPathsBounds, type Rect } from 'src/lib/components/componentAssembly'
import { getComponentMatrix } from 'src/lib/components/componentTransform'
import {
  useStore,
  activeLayer,
  getNodeSegmentType,
  isOffCurveNode,
  type GlyphData,
  type GlyphComponentRef,
  type PathData,
  type PathNode,
} from 'src/store'
import { useTranslation } from 'react-i18next'

const PREVIEW_PADDING_X = 80
const PREVIEW_ASCENDER = 900
const PREVIEW_DESCENDER = -220
const PREVIEW_HEIGHT = PREVIEW_ASCENDER - PREVIEW_DESCENDER
const PREVIEW_MIN_X = -PREVIEW_PADDING_X

interface PreviewPart {
  id: string
  path2d: Path2D
  pathsToInsert: PathData[]
  bounds: Rect
}

interface PreviewTransform {
  scale: number
  e: number
  f: number
}

interface FontPoint {
  x: number
  y: number
}

interface SelectionDrag {
  start: FontPoint
  current: FontPoint
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

const buildPart = (id: string, paths: PathData[]): PreviewPart | null => {
  const bounds = getPathsBounds(paths)
  if (!bounds) {
    return null
  }
  return {
    id,
    path2d: new Path2D(buildVarPackedPathForPaths(paths).toSVGPath()),
    pathsToInsert: paths.map(clonePath),
    bounds,
  }
}

const buildVarPackedPathForPaths = (paths: PathData[]) =>
  VarPackedPath.fromUnpackedContours(
    paths.map((path) => ({
      isClosed: path.closed,
      points: path.nodes.map((node, index) => {
        const nextOnCurve = path.nodes
          .slice(index + 1)
          .find((candidate) => !isOffCurveNode(candidate))
        return {
          x: node.x,
          y: node.y,
          type: isOffCurveNode(node)
            ? getNodeSegmentType(nextOnCurve) === 'quadratic'
              ? 'offCurveQuad'
              : 'offCurveCubic'
            : 'onCurve',
          smooth: isOffCurveNode(node) ? false : (node.smooth ?? false),
        }
      }),
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

const buildRootPathParts = (sourcePaths: PathData[]): PreviewPart[] => {
  if (sourcePaths.length === 0) {
    return []
  }

  const testContext = createTestContext()
  if (!testContext) {
    return sourcePaths.flatMap((path) => {
      const part = buildPart(`path:${path.id}`, [path])
      return part ? [part] : []
    })
  }

  const singles = sourcePaths.map((path) => ({
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

  return [...groups.entries()].flatMap(([rootIndex, paths]) => {
    const part = buildPart(`path-group:${singles[rootIndex].path.id}`, paths)
    return part ? [part] : []
  })
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
  const paths = activeLayer(glyph).paths.map((path) => ({
    id: generateId('path'),
    closed: path.closed,
    nodes: path.nodes.map((node) => ({
      ...transformNode(node, matrix),
      id: generateId('node'),
    })),
  }))

  for (const component of activeLayer(glyph).componentRefs) {
    const m = getComponentMatrix(component)
    const componentMatrix = matrix.multiply(
      new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f])
    )
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
    const m = getComponentMatrix(component)
    const paths = materializeComponentPaths(
      glyphMap,
      component.glyphId,
      new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f])
    )
    if (paths.length === 0) {
      return []
    }

    const part = buildPart(`component:${component.id}`, paths)
    return part ? [part] : []
  })

const getPreviewWidth = (glyph: GlyphData) =>
  Math.max(activeLayer(glyph).metrics.width || 0, 240)

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

const rectFromPoints = (start: FontPoint, end: FontPoint): Rect => ({
  xMin: Math.min(start.x, end.x),
  xMax: Math.max(start.x, end.x),
  yMin: Math.min(start.y, end.y),
  yMax: Math.max(start.y, end.y),
})

const rectsIntersect = (left: Rect, right: Rect) =>
  left.xMin <= right.xMax &&
  left.xMax >= right.xMin &&
  left.yMin <= right.yMax &&
  left.yMax >= right.yMin

const getSelectionBoxScreenRect = (
  rect: Rect,
  transform: PreviewTransform
) => ({
  x: rect.xMin * transform.scale + transform.e,
  y: transform.f - rect.yMax * transform.scale,
  width: Math.max(1, (rect.xMax - rect.xMin) * transform.scale),
  height: Math.max(1, (rect.yMax - rect.yMin) * transform.scale),
})

const isMeaningfulDrag = (start: FontPoint, current: FontPoint) =>
  Math.hypot(start.x - current.x, start.y - current.y) > 8

export function GlyphReadonlyReference({
  glyph,
  glyphMap,
}: {
  glyph: GlyphData
  glyphMap: Record<string, GlyphData>
}) {
  const { t } = useTranslation()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const createPath = useStore((state) => state.createPath)
  const setComponentGhostPaths = useStore(
    (state) => state.setComponentGhostPaths
  )
  const setComponentTargetRect = useStore(
    (state) => state.setComponentTargetRect
  )
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null)
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([])
  const [selectionDrag, setSelectionDrag] = useState<SelectionDrag | null>(null)
  const pointerDownRef = useRef<{
    point: FontPoint
    partId: string | null
    pointerId: number
  } | null>(null)
  const [forceRedraw, setForceRedraw] = useState(0)
  const width = useMemo(() => getPreviewWidth(glyph), [glyph])

  const previewParts = useMemo(
    () => [
      ...buildComponentParts(glyphMap, activeLayer(glyph).componentRefs),
      ...buildRootPathParts(activeLayer(glyph).paths),
    ],
    [glyph, glyphMap]
  )

  const drawPreview = useCallback(
    (
      hoveredId: string | null,
      selectionIds: string[],
      drag: SelectionDrag | null
    ) => {
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
      const transform = { scale, e, f }
      const selectionIdSet = new Set(selectionIds)

      context.fillStyle = '#fff'
      context.fillRect(0, 0, cssWidth, cssHeight)
      context.setTransform(scale * dpr, 0, 0, -scale * dpr, e * dpr, f * dpr)

      for (const part of previewParts) {
        context.fillStyle =
          part.id === hoveredId || selectionIdSet.has(part.id)
            ? '#1E88A8'
            : '#000'
        context.fill(part.path2d, 'evenodd')
      }

      if (drag && isMeaningfulDrag(drag.start, drag.current)) {
        const rect = getSelectionBoxScreenRect(
          rectFromPoints(drag.start, drag.current),
          transform
        )
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        context.fillStyle = 'rgba(30, 136, 168, 0.13)'
        context.strokeStyle = '#1E88A8'
        context.lineWidth = 1
        context.setLineDash([4, 3])
        context.fillRect(rect.x, rect.y, rect.width, rect.height)
        context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height)
        context.setLineDash([])
      }
    },
    [previewParts, width]
  )

  useEffect(() => {
    drawPreview(hoveredPartId, selectedPartIds, selectionDrag)
  }, [drawPreview, hoveredPartId, selectedPartIds, selectionDrag, forceRedraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      setForceRedraw((prev) => prev + 1)
    })
    observer.observe(canvas)

    return () => observer.disconnect()
  }, [])

  const toFontPoint = (clientX: number, clientY: number): FontPoint | null => {
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

  const buildInsertablePaths = useCallback(
    (part: PreviewPart) => part.pathsToInsert.map(clonePath),
    []
  )

  const showGhostForPart = useCallback(
    (partId: string | null) => {
      const part = partId
        ? (previewParts.find((candidate) => candidate.id === partId) ?? null)
        : null
      const selectedIds = new Set(selectedPartIds)
      const partsToPreview =
        part && selectedIds.has(part.id)
          ? previewParts.filter((candidate) => selectedIds.has(candidate.id))
          : part
            ? [part]
            : []
      const pathsToPreview = partsToPreview.flatMap(buildInsertablePaths)

      setComponentGhostPaths(pathsToPreview.length > 0 ? pathsToPreview : null)
      setComponentTargetRect(null)
    },
    [
      buildInsertablePaths,
      previewParts,
      selectedPartIds,
      setComponentGhostPaths,
      setComponentTargetRect,
    ]
  )

  useEffect(() => {
    return () => {
      setComponentGhostPaths(null)
      setComponentTargetRect(null)
    }
  }, [setComponentGhostPaths, setComponentTargetRect])

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toFontPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    if (pointerDownRef.current && pointerDownRef.current.partId === null) {
      setSelectionDrag({ start: pointerDownRef.current.point, current: point })
      return
    }

    const part = hitTestPart(point)
    const partId = part?.id ?? null
    if (partId !== hoveredPartId) {
      setHoveredPartId(partId)
      showGhostForPart(partId)
    }
  }

  const handlePointerLeave = () => {
    setHoveredPartId(null)
    showGhostForPart(null)
  }

  const insertParts = useCallback(
    (parts: PreviewPart[]) => {
      if (!selectedGlyphId) {
        return
      }
      for (const part of parts) {
        for (const path of buildInsertablePaths(part)) {
          createPath(selectedGlyphId, path)
        }
      }
      showGhostForPart(null)
    },
    [buildInsertablePaths, createPath, selectedGlyphId, showGhostForPart]
  )

  const getSelectedParts = useCallback(() => {
    const selected = new Set(selectedPartIds)
    return previewParts.filter((part) => selected.has(part.id))
  }, [previewParts, selectedPartIds])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toFontPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    const part = hitTestPart(point)
    pointerDownRef.current = {
      point,
      partId: part?.id ?? null,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!part) {
      setSelectionDrag({ start: point, current: point })
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointerDown = pointerDownRef.current
    pointerDownRef.current = null
    if (!pointerDown) {
      return
    }

    if (event.currentTarget.hasPointerCapture(pointerDown.pointerId)) {
      event.currentTarget.releasePointerCapture(pointerDown.pointerId)
    }

    const point = toFontPoint(event.clientX, event.clientY)
    const drag = selectionDrag
    setSelectionDrag(null)

    if (
      pointerDown.partId === null &&
      drag &&
      isMeaningfulDrag(drag.start, drag.current)
    ) {
      const selectionRect = rectFromPoints(drag.start, drag.current)
      setSelectedPartIds(
        previewParts
          .filter((part) => rectsIntersect(part.bounds, selectionRect))
          .map((part) => part.id)
      )
      return
    }

    const part = point ? hitTestPart(point) : null
    const selectedIds = new Set(selectedPartIds)
    if (part && selectedIds.has(part.id)) {
      const parts = getSelectedParts()
      insertParts(parts.length > 0 ? parts : [part])
      return
    }

    if (selectedPartIds.length > 0) {
      setSelectedPartIds([])
      return
    }

    if (part && pointerDown.partId === part.id) {
      insertParts([part])
    }
  }

  return (
    <Box
      bg="card"
      borderRadius="sm"
      overflow="hidden"
      px={2}
      py={2}
      userSelect="none"
    >
      <Text fontSize="xs" color="mutedForeground" mb={2} fontFamily="mono">
        {t('editor.componentSearchHint')}
      </Text>
      <Box display="block" w="100%" h="220px" cursor="pointer" asChild>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          style={{ cursor: 'pointer' }}
        />
      </Box>
    </Box>
  )
}
