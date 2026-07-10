import type { GlyphwikiPartPlacement } from 'src/lib/glyph/glyphwikiComposition'
import {
  getPolygonsBounds,
  type GeometryBounds,
  type GeometryPoint,
} from 'src/lib/qualityCheck/polygonGeometry'

export type PartSpacingAxis = 'horizontal' | 'vertical'

export interface SemanticPartLayout {
  axis: PartSpacingAxis
  firstCharacter: string
  secondCharacter: string
  /** GlyphWiki 200 × 200 畫布上的部件分界，正規化為 0–1。 */
  splitRatio: number
}

export interface PartSpacingMetrics {
  axis: PartSpacingAxis
  firstCharacter: string
  secondCharacter: string
  splitRatio: number
  /** 兩部件相向邊緣的逐列／逐欄間距中位數，相對整字字面正規化。 */
  gapRatio: number
  /** 有效取樣列／欄中，兩部件相向邊緣互相穿越的比例。 */
  overlapRatio: number
  /** raster 分件後兩側墨群質心距離，相對字面正規化。 */
  separationRatio?: number
  sampleCount: number
}

const GLYPHWIKI_CANVAS_SIZE = 200
const MIN_CENTER_SEPARATION = 36
const MIN_CROSS_AXIS_OVERLAP = 48
const INTERFACE_SAMPLES = 64
const MIN_INTERFACE_SAMPLES = 12

const centerX = (part: GlyphwikiPartPlacement) =>
  (part.box.x1 + part.box.x2) / 2
const centerY = (part: GlyphwikiPartPlacement) =>
  (part.box.y1 + part.box.y2) / 2

/**
 * 第一版只處理兩個主要部件。多部件字需要先決定相鄰介面，不能把所有
 * 部件硬壓成一個 gap；後續可在同一型別上擴充為多個 layout。
 */
export const deriveSemanticPartLayout = (
  parts: readonly GlyphwikiPartPlacement[] | null | undefined
): SemanticPartLayout | null => {
  if (!parts || parts.length !== 2) {
    return null
  }
  const [leftOrTop, rightOrBottom] = parts
  const dx = Math.abs(centerX(rightOrBottom) - centerX(leftOrTop))
  const dy = Math.abs(centerY(rightOrBottom) - centerY(leftOrTop))
  const overlapX =
    Math.min(leftOrTop.box.x2, rightOrBottom.box.x2) -
    Math.max(leftOrTop.box.x1, rightOrBottom.box.x1)
  const overlapY =
    Math.min(leftOrTop.box.y2, rightOrBottom.box.y2) -
    Math.max(leftOrTop.box.y1, rightOrBottom.box.y1)

  if (
    dx >= dy &&
    dx >= MIN_CENTER_SEPARATION &&
    overlapY >= MIN_CROSS_AXIS_OVERLAP
  ) {
    const ordered = [...parts].sort(
      (left, right) => centerX(left) - centerX(right)
    )
    return {
      axis: 'horizontal',
      firstCharacter: ordered[0].char,
      secondCharacter: ordered[1].char,
      splitRatio:
        (centerX(ordered[0]) + centerX(ordered[1])) / 2 / GLYPHWIKI_CANVAS_SIZE,
    }
  }
  if (
    dy > dx &&
    dy >= MIN_CENTER_SEPARATION &&
    overlapX >= MIN_CROSS_AXIS_OVERLAP
  ) {
    const ordered = [...parts].sort(
      (top, bottom) => centerY(top) - centerY(bottom)
    )
    return {
      axis: 'vertical',
      firstCharacter: ordered[0].char,
      secondCharacter: ordered[1].char,
      splitRatio:
        (centerY(ordered[0]) + centerY(ordered[1])) / 2 / GLYPHWIKI_CANVAS_SIZE,
    }
  }
  return null
}

const polygonCenter = (polygon: GeometryPoint[], axis: PartSpacingAxis) => {
  const bounds = getPolygonsBounds([polygon])
  if (!bounds) {
    return 0
  }
  return axis === 'horizontal'
    ? (bounds.xMin + bounds.xMax) / 2
    : (bounds.yMin + bounds.yMax) / 2
}

const intersectionsAt = (
  polygons: GeometryPoint[][],
  coordinate: number,
  axis: PartSpacingAxis
) => {
  const intersections: number[] = []
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]
      const next = polygon[(index + 1) % polygon.length]
      const currentCross = axis === 'horizontal' ? current.y : current.x
      const nextCross = axis === 'horizontal' ? next.y : next.x
      // 半開區間避免 scanline 穿過頂點時重複計算；平行邊不影響相向極值。
      if (
        (currentCross <= coordinate && coordinate < nextCross) ||
        (nextCross <= coordinate && coordinate < currentCross)
      ) {
        const t = (coordinate - currentCross) / (nextCross - currentCross)
        intersections.push(
          axis === 'horizontal'
            ? current.x + (next.x - current.x) * t
            : current.y + (next.y - current.y) * t
        )
      }
    }
  }
  return intersections
}

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export const computePartSpacingMetrics = (
  polygons: GeometryPoint[][],
  bounds: GeometryBounds,
  layout: SemanticPartLayout
): PartSpacingMetrics | null => {
  const width = bounds.xMax - bounds.xMin
  const height = bounds.yMax - bounds.yMin
  const faceSize = layout.axis === 'horizontal' ? width : height
  if (faceSize <= 0) {
    return null
  }

  const split =
    layout.axis === 'horizontal'
      ? bounds.xMin + width * layout.splitRatio
      : // GlyphWiki y 向下，字形座標 y 向上。
        bounds.yMax - height * layout.splitRatio
  const first: GeometryPoint[][] = []
  const second: GeometryPoint[][] = []
  for (const polygon of polygons) {
    const center = polygonCenter(polygon, layout.axis)
    const belongsToFirst =
      layout.axis === 'horizontal' ? center < split : center > split
    ;(belongsToFirst ? first : second).push(polygon)
  }
  const firstBounds = getPolygonsBounds(first)
  const secondBounds = getPolygonsBounds(second)
  if (!firstBounds || !secondBounds) {
    return null
  }

  const crossStart =
    layout.axis === 'horizontal'
      ? Math.max(firstBounds.yMin, secondBounds.yMin)
      : Math.max(firstBounds.xMin, secondBounds.xMin)
  const crossEnd =
    layout.axis === 'horizontal'
      ? Math.min(firstBounds.yMax, secondBounds.yMax)
      : Math.min(firstBounds.xMax, secondBounds.xMax)
  if (crossEnd <= crossStart) {
    return null
  }

  const gaps: number[] = []
  for (let index = 0; index < INTERFACE_SAMPLES; index += 1) {
    const coordinate =
      crossStart + ((index + 0.5) / INTERFACE_SAMPLES) * (crossEnd - crossStart)
    const firstIntersections = intersectionsAt(first, coordinate, layout.axis)
    const secondIntersections = intersectionsAt(second, coordinate, layout.axis)
    if (firstIntersections.length === 0 || secondIntersections.length === 0) {
      continue
    }
    gaps.push(
      layout.axis === 'horizontal'
        ? Math.min(...secondIntersections) - Math.max(...firstIntersections)
        : Math.min(...firstIntersections) - Math.max(...secondIntersections)
    )
  }
  if (gaps.length < MIN_INTERFACE_SAMPLES) {
    return null
  }

  return {
    axis: layout.axis,
    firstCharacter: layout.firstCharacter,
    secondCharacter: layout.secondCharacter,
    splitRatio: layout.splitRatio,
    gapRatio: median(gaps) / faceSize,
    overlapRatio: gaps.filter((gap) => gap < 0).length / gaps.length,
    sampleCount: gaps.length,
  }
}
