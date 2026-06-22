import { VarPackedPath } from 'src/font/VarPackedPath'
import { getComponentMatrix } from 'src/lib/components/componentTransform'
import { getNodeSegmentType, isOffCurveNode } from 'src/store/glyphGeometry'
import { getActiveLayerId, getGlyphLayer } from 'src/store/glyphLayer'
import type { GlyphData, GlyphLayerData } from 'src/store/types'

export interface GlyphPreviewShape {
  d: string
  transform?: string
}

export interface GlyphPreviewData {
  width: number
  viewBox: string
  flipY: number
  shapes: GlyphPreviewShape[]
}

interface GlyphPreviewCacheEntry {
  dependencyKey?: string
  layerRef: GlyphLayerData
  preview: GlyphPreviewData
}

const glyphPreviewCache = new WeakMap<
  Record<string, GlyphData>,
  WeakMap<GlyphData, Map<string, GlyphPreviewCacheEntry>>
>()

// Frame tuned for a 1000-UPM design space; scaled by the font's actual UPM.
const PREVIEW_UNITS_PER_EM = 1000
const PREVIEW_PADDING_X = 80
const PREVIEW_ASCENDER = 900
const PREVIEW_DESCENDER = -220
const PREVIEW_FLIP_BASELINE = 800

const buildPathSvg = (layer: GlyphLayerData) => {
  const contours = layer.paths.map((path) => ({
    isClosed: path.closed,
    points: path.nodes.map((node, index) => {
      const nextOnCurve = path.nodes
        .slice(index + 1)
        .find((candidate) => !isOffCurveNode(candidate))
      return {
        x: node.x,
        y: node.y,
        type: (isOffCurveNode(node)
          ? getNodeSegmentType(nextOnCurve) === 'quadratic'
            ? 'offCurveQuad'
            : 'offCurveCubic'
          : 'onCurve') as 'onCurve' | 'offCurveQuad' | 'offCurveCubic',
        smooth: isOffCurveNode(node) ? false : (node.smooth ?? false),
      }
    }),
  }))

  return VarPackedPath.fromUnpackedContours(contours).toSVGPath()
}

const componentTransformToSvg = (
  component: GlyphLayerData['componentRefs'][number]
) => {
  const matrix = getComponentMatrix(component)
  return `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`
}

const buildGlyphPreviewShapes = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>,
  layerId: string | null = null,
  visited = new Set<string>(),
  depth = 0
): GlyphPreviewShape[] => {
  if (visited.has(glyph.id) || depth > 8) {
    return []
  }

  const nextVisited = new Set(visited)
  nextVisited.add(glyph.id)

  const layer = getGlyphLayer(glyph, layerId)
  if (!layer) {
    return []
  }
  const shapes: GlyphPreviewShape[] = []
  if (layer.paths.length > 0) {
    shapes.push({ d: buildPathSvg(layer) })
  }

  for (const component of layer.componentRefs) {
    const baseGlyph = glyphMap[component.glyphId]
    if (!baseGlyph) {
      continue
    }

    const transform = componentTransformToSvg(component)
    const nestedShapes = buildGlyphPreviewShapes(
      baseGlyph,
      glyphMap,
      null,
      nextVisited,
      depth + 1
    )
    for (const nestedShape of nestedShapes) {
      shapes.push({
        d: nestedShape.d,
        transform: [transform, nestedShape.transform].filter(Boolean).join(' '),
      })
    }
  }

  return shapes
}

export const buildGlyphPreviewData = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>,
  unitsPerEm: number = PREVIEW_UNITS_PER_EM,
  layerId: string | null = null,
  options: { dependencyKey?: string; useCache?: boolean } = {}
): GlyphPreviewData => {
  const useCache = options.useCache ?? true
  let glyphMapCache = useCache ? glyphPreviewCache.get(glyphMap) : undefined
  if (useCache && !glyphMapCache) {
    glyphMapCache = new WeakMap()
    glyphPreviewCache.set(glyphMap, glyphMapCache)
  }

  // Scale the design-space frame so glyphs from any UPM fit the viewBox.
  const scale = (unitsPerEm || PREVIEW_UNITS_PER_EM) / PREVIEW_UNITS_PER_EM
  const paddingX = PREVIEW_PADDING_X * scale
  const ascender = PREVIEW_ASCENDER * scale
  const descender = PREVIEW_DESCENDER * scale
  const headroom = 100 * scale

  const layer = getGlyphLayer(glyph, layerId)
  const cacheKey = layerId ?? getActiveLayerId(glyph)
  const glyphCache = glyphMapCache?.get(glyph)
  if (!layer && glyphMapCache) {
    glyphMapCache.delete(glyph)
  }

  // Cache each resolved layer separately. Entries are valid only while the same
  // layer object is still resident; geometry eviction deletes layers in place.
  const cachedPreview = layer ? glyphCache?.get(cacheKey) : undefined
  if (
    cachedPreview?.layerRef === layer &&
    cachedPreview.dependencyKey === options.dependencyKey
  ) {
    return cachedPreview.preview
  }

  const width = Math.max(layer?.metrics.width ?? 0, 240 * scale)
  const shapes = layer ? buildGlyphPreviewShapes(glyph, glyphMap, layerId) : []
  const viewBox = `${-paddingX} ${descender} ${width + paddingX * 2} ${
    ascender - descender + headroom
  }`

  const preview = {
    width,
    viewBox,
    flipY: PREVIEW_FLIP_BASELINE * scale,
    shapes,
  }
  if (layer && glyphMapCache) {
    const nextGlyphCache =
      glyphCache ?? new Map<string, GlyphPreviewCacheEntry>()
    nextGlyphCache.set(cacheKey, {
      dependencyKey: options.dependencyKey,
      layerRef: layer,
      preview,
    })
    glyphMapCache.set(glyph, nextGlyphCache)
  }
  return preview
}

/**
 * Convert a GlyphPreviewData viewBox (SVG Y-down space) to a font-coordinate
 * Rect (Y-up space) suitable for CanvasController.fitRect.
 *
 * SVG uses: svg_y = flipY - font_y
 * So:       font_y = flipY - svg_y
 *
 * viewBox "x y w h" -> { xMin: x, xMax: x+w, yMin: flipY-(y+h), yMax: flipY-y }
 */
export function buildGlyphPreviewFontRect(preview: GlyphPreviewData): {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
} {
  const parts = preview.viewBox.split(' ')
  const x = parseFloat(parts[0])
  const y = parseFloat(parts[1])
  const w = parseFloat(parts[2])
  const h = parseFloat(parts[3])
  return {
    xMin: x,
    xMax: x + w,
    yMin: preview.flipY - (y + h),
    yMax: preview.flipY - y,
  }
}
