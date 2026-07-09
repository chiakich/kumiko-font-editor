import type { ResolvedGlyph } from 'src/lib/qualityCheck/resolvedGlyph'
import {
  getComponentMatrix,
  type ComponentMatrix,
} from 'src/lib/components/componentTransform'
import {
  computeInkMoments,
  computeProjectionGaps,
  flattenContour,
  getPolygonsBounds,
  type GeometryBounds,
  type GeometryPoint,
} from 'src/lib/qualityCheck/polygonGeometry'

/**
 * 字形層級的墨水度量：把已解析字形（含遞迴 component）攤平成多邊形，
 * 再交給 polygonGeometry 算面積與矩。純函數，輸入 ResolvedGlyph。
 */
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
  /** 墨水視覺重心（counter 扣除後） */
  centroidX: number | null
  centroidY: number | null
  /** 墨水沿軸向的分布標準差：水平/垂直密度分布的代理值 */
  spreadX: number | null
  spreadY: number | null
  /** 字面內最寬的無墨空帶（units）：部件間隔被拉開的直接量測 */
  gapX: number | null
  gapY: number | null
}

const MAX_COMPONENT_DEPTH = 8

const transformPolygon = (
  polygon: GeometryPoint[],
  matrix: ComponentMatrix
): GeometryPoint[] =>
  polygon.map((point) => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }))

export const flattenResolvedGlyph = (
  glyph: ResolvedGlyph,
  glyphs: Record<string, ResolvedGlyph>,
  visited = new Set<string>(),
  depth = 0
): GeometryPoint[][] => {
  if (visited.has(glyph.id) || depth > MAX_COMPONENT_DEPTH) {
    return []
  }

  const nextVisited = new Set(visited)
  nextVisited.add(glyph.id)

  const polygons: GeometryPoint[][] = glyph.paths
    .filter((path) => path.closed && path.nodes.length >= 3)
    .map((path) => flattenContour(path.nodes))
    .filter((polygon) => polygon.length >= 3)

  for (const componentRef of glyph.componentRefs) {
    const componentGlyph = glyphs[componentRef.glyphId]
    if (!componentGlyph) {
      continue
    }
    const componentPolygons = flattenResolvedGlyph(
      componentGlyph,
      glyphs,
      nextVisited,
      depth + 1
    )
    const matrix = getComponentMatrix(componentRef)
    for (const polygon of componentPolygons) {
      polygons.push(transformPolygon(polygon, matrix))
    }
  }

  return polygons
}

/** 從已攤平的多邊形算墨水度量。與 flatten 分離，讓統一取樣 pass 共用一次攤平。 */
export const computeInkFromPolygons = (
  polygons: GeometryPoint[][],
  advance: number,
  unitsPerEm: number
): GlyphInkMetrics => {
  const bounds = getPolygonsBounds(polygons)
  const moments = computeInkMoments(polygons)
  const gaps = bounds ? computeProjectionGaps(polygons, bounds) : null
  const inkArea = moments?.area ?? 0
  const faceArea = bounds
    ? Math.max(0, bounds.xMax - bounds.xMin) *
      Math.max(0, bounds.yMax - bounds.yMin)
    : 0
  const emArea = Math.max(0, advance) * unitsPerEm

  return {
    bounds,
    inkArea,
    faceArea,
    inkToFaceRatio: faceArea > 0 ? Math.min(1, inkArea / faceArea) : null,
    inkToEmRatio: emArea > 0 ? Math.min(1, inkArea / emArea) : null,
    centroidX: moments?.centroidX ?? null,
    centroidY: moments?.centroidY ?? null,
    spreadX: moments?.spreadX ?? null,
    spreadY: moments?.spreadY ?? null,
    gapX: gaps?.gapX ?? null,
    gapY: gaps?.gapY ?? null,
  }
}

const inkMetricsCache = new WeakMap<
  Record<string, ResolvedGlyph>,
  Map<string, GlyphInkMetrics>
>()

/** 便利函數（含快取）：給逐字查詢的 proof 用；母體取樣請走 computeInkFromPolygons。 */
export const computeGlyphInk = (
  glyph: ResolvedGlyph,
  glyphs: Record<string, ResolvedGlyph>,
  unitsPerEm: number
): GlyphInkMetrics => {
  let glyphMapCache = inkMetricsCache.get(glyphs)
  if (!glyphMapCache) {
    glyphMapCache = new Map()
    inkMetricsCache.set(glyphs, glyphMapCache)
  }
  const cached = glyphMapCache.get(glyph.id)
  if (cached) {
    return cached
  }

  const metrics = computeInkFromPolygons(
    flattenResolvedGlyph(glyph, glyphs),
    glyph.advance,
    unitsPerEm
  )
  glyphMapCache.set(glyph.id, metrics)
  return metrics
}
