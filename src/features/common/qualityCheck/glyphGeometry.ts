import { getGlyphLayer, type GlyphData } from 'src/store'

export interface GeometryPoint {
  x: number
  y: number
}

export interface GeometryBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface GlyphInkMetrics {
  bounds: GeometryBounds | null
  /** 真實墨水面積（counter 會扣除） */
  inkArea: number
  /** 真實字面框面積（outline bbox） */
  faceArea: number
  /** 墨水面積 / 真實字面框面積：單字本身的黑度 */
  inkToFaceRatio: number | null
  /** 墨水面積 /（advance × UPM）：排版時對版面灰度的貢獻 */
  inkToEmRatio: number | null
}

const CURVE_FLATTEN_STEPS = 8
const MAX_COMPONENT_DEPTH = 8

interface FlattenNode {
  x: number
  y: number
  kind: 'on' | 'cubic' | 'quad'
}

const toFlattenNodes = (
  nodes: Array<{ x: number; y: number; type: string }>
): FlattenNode[] =>
  nodes.map((node) => ({
    x: node.x,
    y: node.y,
    kind:
      node.type === 'offcurve'
        ? 'cubic'
        : node.type === 'qcurve'
          ? 'quad'
          : 'on',
  }))

const lerp = (
  a: GeometryPoint,
  b: GeometryPoint,
  t: number
): GeometryPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const sampleQuadratic = (
  start: GeometryPoint,
  control: GeometryPoint,
  end: GeometryPoint,
  output: GeometryPoint[]
) => {
  for (let step = 1; step <= CURVE_FLATTEN_STEPS; step += 1) {
    const t = step / CURVE_FLATTEN_STEPS
    const a = lerp(start, control, t)
    const b = lerp(control, end, t)
    output.push(lerp(a, b, t))
  }
}

const sampleCubic = (
  start: GeometryPoint,
  control1: GeometryPoint,
  control2: GeometryPoint,
  end: GeometryPoint,
  output: GeometryPoint[]
) => {
  for (let step = 1; step <= CURVE_FLATTEN_STEPS; step += 1) {
    const t = step / CURVE_FLATTEN_STEPS
    const a = lerp(start, control1, t)
    const b = lerp(control1, control2, t)
    const c = lerp(control2, end, t)
    const ab = lerp(a, b, t)
    const bc = lerp(b, c, t)
    output.push(lerp(ab, bc, t))
  }
}

/**
 * 把一條輪廓（on-curve 與 cubic/quad off-curve 混合）攤平成折線多邊形。
 * quad off-curve 連續出現時依 TrueType 慣例補出隱含的 on-curve 中點。
 */
export const flattenContour = (
  nodes: Array<{ x: number; y: number; type: string }>
): GeometryPoint[] => {
  const flattenNodes = toFlattenNodes(nodes)
  if (flattenNodes.length === 0) {
    return []
  }

  const firstOnIndex = flattenNodes.findIndex((node) => node.kind === 'on')
  let workingNodes: FlattenNode[]
  if (firstOnIndex === -1) {
    // 全 off-curve（TrueType 風格）：以前兩點中點當起點
    const first = flattenNodes[0]
    const last = flattenNodes[flattenNodes.length - 1]
    workingNodes = [
      { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2, kind: 'on' },
      ...flattenNodes,
    ]
  } else {
    workingNodes = [
      ...flattenNodes.slice(firstOnIndex),
      ...flattenNodes.slice(0, firstOnIndex),
    ]
  }

  const polygon: GeometryPoint[] = [
    { x: workingNodes[0].x, y: workingNodes[0].y },
  ]
  let pending: FlattenNode[] = []

  const flushSegment = (end: GeometryPoint) => {
    const start = polygon[polygon.length - 1]
    if (pending.length === 0) {
      polygon.push(end)
    } else if (pending.length === 1) {
      sampleQuadratic(start, pending[0], end, polygon)
    } else if (pending.length === 2 && pending[0].kind === 'cubic') {
      sampleCubic(start, pending[0], pending[1], end, polygon)
    } else {
      // 連續 quad off-curve：逐段以隱含中點切開
      let current = start
      for (let index = 0; index < pending.length; index += 1) {
        const control = pending[index]
        const next = pending[index + 1]
        const segmentEnd = next
          ? { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 }
          : end
        sampleQuadratic(current, control, segmentEnd, polygon)
        current = segmentEnd
      }
    }
    pending = []
  }

  for (let index = 1; index < workingNodes.length; index += 1) {
    const node = workingNodes[index]
    if (node.kind === 'on') {
      flushSegment({ x: node.x, y: node.y })
    } else {
      pending.push(node)
    }
  }
  flushSegment({ x: workingNodes[0].x, y: workingNodes[0].y })

  return polygon
}

interface ComponentTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

const transformPolygon = (
  polygon: GeometryPoint[],
  transform: ComponentTransform
): GeometryPoint[] => {
  const radians = (transform.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return polygon.map((point) => {
    const scaledX = point.x * transform.scaleX
    const scaledY = point.y * transform.scaleY
    return {
      x: scaledX * cos - scaledY * sin + transform.x,
      y: scaledX * sin + scaledY * cos + transform.y,
    }
  })
}

/**
 * 取得 glyph（active layer，含遞迴 component）攤平後的所有閉合輪廓。
 */
export const flattenGlyphToPolygons = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>,
  visited = new Set<string>(),
  depth = 0
): GeometryPoint[][] => {
  if (visited.has(glyph.id) || depth > MAX_COMPONENT_DEPTH) {
    return []
  }

  const nextVisited = new Set(visited)
  nextVisited.add(glyph.id)
  const activeLayer = getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph

  const polygons: GeometryPoint[][] = activeLayer.paths
    .filter((path) => path.closed && path.nodes.length >= 3)
    .map((path) => flattenContour(path.nodes))
    .filter((polygon) => polygon.length >= 3)

  for (const componentRef of activeLayer.componentRefs) {
    const componentGlyph = glyphMap[componentRef.glyphId]
    if (!componentGlyph) {
      continue
    }
    const componentPolygons = flattenGlyphToPolygons(
      componentGlyph,
      glyphMap,
      nextVisited,
      depth + 1
    )
    for (const polygon of componentPolygons) {
      polygons.push(transformPolygon(polygon, componentRef))
    }
  }

  return polygons
}

const getSignedArea = (polygon: GeometryPoint[]) => {
  let area = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

const isPointInPolygon = (point: GeometryPoint, polygon: GeometryPoint[]) => {
  let inside = false
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x
    if (crosses) {
      inside = !inside
    }
  }
  return inside
}

/**
 * 真實墨水面積：用輪廓包含層級判斷實心/挖空區域，不依賴 winding。
 * 這可避免兩個方向相反的獨立實心輪廓互相抵消。
 */
export const computeInkArea = (polygons: GeometryPoint[][]) => {
  const contours = polygons
    .map((polygon) => ({
      polygon,
      area: Math.abs(getSignedArea(polygon)),
    }))
    .filter((contour) => contour.area > 0)
    .sort((left, right) => right.area - left.area)

  return contours.reduce((total, contour, index) => {
    const samplePoint = contour.polygon[0]
    const depth = contours
      .slice(0, index)
      .filter((candidate) =>
        isPointInPolygon(samplePoint, candidate.polygon)
      ).length
    return total + (depth % 2 === 0 ? contour.area : -contour.area)
  }, 0)
}

export const getPolygonsBounds = (
  polygons: GeometryPoint[][]
): GeometryBounds | null => {
  let bounds: GeometryBounds | null = null
  for (const polygon of polygons) {
    for (const point of polygon) {
      if (!bounds) {
        bounds = { xMin: point.x, xMax: point.x, yMin: point.y, yMax: point.y }
      } else {
        bounds.xMin = Math.min(bounds.xMin, point.x)
        bounds.xMax = Math.max(bounds.xMax, point.x)
        bounds.yMin = Math.min(bounds.yMin, point.y)
        bounds.yMax = Math.max(bounds.yMax, point.y)
      }
    }
  }
  return bounds
}

const inkMetricsCache = new WeakMap<
  Record<string, GlyphData>,
  WeakMap<GlyphData, GlyphInkMetrics>
>()

export const getGlyphInkMetrics = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>,
  unitsPerEm: number
): GlyphInkMetrics => {
  let glyphMapCache = inkMetricsCache.get(glyphMap)
  if (!glyphMapCache) {
    glyphMapCache = new WeakMap()
    inkMetricsCache.set(glyphMap, glyphMapCache)
  }
  const cached = glyphMapCache.get(glyph)
  if (cached) {
    return cached
  }

  const polygons = flattenGlyphToPolygons(glyph, glyphMap)
  const bounds = getPolygonsBounds(polygons)
  const inkArea = computeInkArea(polygons)
  const faceArea = bounds
    ? Math.max(0, bounds.xMax - bounds.xMin) *
      Math.max(0, bounds.yMax - bounds.yMin)
    : 0
  const activeLayer = getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph
  const emArea = Math.max(0, activeLayer.metrics.width) * unitsPerEm

  const metrics: GlyphInkMetrics = {
    bounds,
    inkArea,
    faceArea,
    inkToFaceRatio: faceArea > 0 ? Math.min(1, inkArea / faceArea) : null,
    inkToEmRatio: emArea > 0 ? Math.min(1, inkArea / emArea) : null,
  }
  glyphMapCache.set(glyph, metrics)
  return metrics
}
