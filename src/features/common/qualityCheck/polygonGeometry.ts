/**
 * 純多邊形幾何：輪廓攤平、面積、矩、邊界框。
 * 不依賴 store 型別，輸入輸出皆為點陣列，可在任何環境（含 Worker）執行。
 */

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

export interface InkMoments {
  area: number
  centroidX: number
  centroidY: number
  /** 墨水分布的軸向標準差 */
  spreadX: number
  spreadY: number
}

const CURVE_FLATTEN_STEPS = 8

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

interface ClassifiedContour {
  polygon: GeometryPoint[]
  area: number
  bounds: GeometryBounds
  /** +1 實心、-1 挖空（counter） */
  sign: number
}

const boundsContain = (outer: GeometryBounds, inner: GeometryBounds) =>
  outer.xMin <= inner.xMin &&
  outer.xMax >= inner.xMax &&
  outer.yMin <= inner.yMin &&
  outer.yMax >= inner.yMax

const CONTAINMENT_SAMPLES = 8

/**
 * 過半取樣頂點在外輪廓內才算巢狀。單點判定會把「交疊但不巢狀」的
 * 獨立筆畫誤判成挖空（CJK 組字常見），導致墨量互相抵消成垃圾值。
 */
const containsContour = (outer: GeometryPoint[], inner: GeometryPoint[]) => {
  const step = Math.max(1, Math.floor(inner.length / CONTAINMENT_SAMPLES))
  let insideCount = 0
  let sampleCount = 0
  for (let index = 0; index < inner.length; index += step) {
    sampleCount += 1
    if (isPointInPolygon(inner[index], outer)) {
      insideCount += 1
    }
  }
  return insideCount * 2 > sampleCount
}

/**
 * 用輪廓包含層級判斷實心（+1）/挖空（-1），不依賴 winding。
 * 這可避免兩個方向相反的獨立實心輪廓互相抵消。
 */
const classifyInkContours = (
  polygons: GeometryPoint[][]
): ClassifiedContour[] => {
  const contours: ClassifiedContour[] = []
  for (const polygon of polygons) {
    const area = Math.abs(getSignedArea(polygon))
    const bounds = getPolygonsBounds([polygon])
    if (area > 0 && bounds) {
      contours.push({ polygon, area, bounds, sign: 1 })
    }
  }
  contours.sort((left, right) => right.area - left.area)

  for (let index = 0; index < contours.length; index += 1) {
    const contour = contours[index]
    // bbox 預過濾：真巢狀必然 bbox 也巢狀，避免逐對做頂點取樣
    const depth = contours
      .slice(0, index)
      .filter(
        (candidate) =>
          boundsContain(candidate.bounds, contour.bounds) &&
          containsContour(candidate.polygon, contour.polygon)
      ).length
    contour.sign = depth % 2 === 0 ? 1 : -1
  }

  return contours
}

export const computeInkArea = (polygons: GeometryPoint[][]) =>
  classifyInkContours(polygons).reduce(
    (total, contour) => total + contour.sign * contour.area,
    0
  )

/**
 * 墨水的一階/二階矩（閉式多邊形積分，挖空區帶負號），
 * 得到視覺重心與軸向分布寬度，免去點陣取樣。
 */
export const computeInkMoments = (
  polygons: GeometryPoint[][]
): InkMoments | null => {
  let totalArea = 0
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumYY = 0

  for (const contour of classifyInkContours(polygons)) {
    const polygon = contour.polygon
    let signedArea = 0
    let momentX = 0
    let momentY = 0
    let momentXX = 0
    let momentYY = 0
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]
      const next = polygon[(index + 1) % polygon.length]
      const cross = current.x * next.y - next.x * current.y
      signedArea += cross
      momentX += (current.x + next.x) * cross
      momentY += (current.y + next.y) * cross
      momentXX +=
        (current.x * current.x + current.x * next.x + next.x * next.x) * cross
      momentYY +=
        (current.y * current.y + current.y * next.y + next.y * next.y) * cross
    }
    signedArea /= 2
    if (signedArea === 0) {
      continue
    }
    // 除以 signedArea 後與輪廓繞向無關；再乘 |面積| 與挖空正負號。
    const weight = contour.sign * Math.abs(signedArea)
    sumX += weight * (momentX / (6 * signedArea))
    sumY += weight * (momentY / (6 * signedArea))
    sumXX += weight * (momentXX / (12 * signedArea))
    sumYY += weight * (momentYY / (12 * signedArea))
    totalArea += weight
  }

  if (totalArea <= 0) {
    return null
  }

  const centroidX = sumX / totalArea
  const centroidY = sumY / totalArea
  return {
    area: totalArea,
    centroidX,
    centroidY,
    spreadX: Math.sqrt(Math.max(0, sumXX / totalArea - centroidX * centroidX)),
    spreadY: Math.sqrt(Math.max(0, sumYY / totalArea - centroidY * centroidY)),
  }
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
