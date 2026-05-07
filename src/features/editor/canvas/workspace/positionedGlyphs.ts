import { VarPackedPath } from 'src/font/VarPackedPath'
import {
  getEffectiveNodeType,
  getGlyphLayer,
  type FontData,
  type NodeType,
} from 'src/store'
import type { ComponentData, GuidelineData, PositionedGlyph } from 'src/canvas'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'

export interface LayerGeometryCacheEntry {
  layerRef: object
  pointRefs: Array<{ pathId: string; nodeId: string }>
  varPath: InstanceType<typeof VarPackedPath>
  components: ComponentData[]
  guidelines: GuidelineData[]
}

interface BuildPositionedGlyphsOptions {
  activeToolId: ToolId
  editorActiveGlyphIndex: number
  editorGlyphIds: string[]
  fontData: FontData | null
  selectedLayerId: string | null
  layerGeometryCache: Map<string, LayerGeometryCacheEntry>
}

const pathDataToVarPackedPath = (
  paths: Array<{
    id: string
    closed: boolean
    nodes: Array<{
      id: string
      x: number
      y: number
      type: NodeType
    }>
  }>
) => {
  const contours = paths.map((pathData) => ({
    points: pathData.nodes.map((node) => ({
      x: node.x,
      y: node.y,
      type: (node.type === 'offcurve'
        ? 'offCurveCubic'
        : node.type === 'qcurve'
          ? 'offCurveQuad'
          : 'onCurve') as 'onCurve' | 'offCurveQuad' | 'offCurveCubic',
      smooth: getEffectiveNodeType(pathData, node) === 'smooth',
    })),
    isClosed: pathData.closed,
  }))

  return VarPackedPath.fromUnpackedContours(contours)
}

const buildComponentPath2D = (
  componentGlyphId: string,
  fontData: FontData,
  selectedLayerId: string | null,
  layerGeometryCache: Map<string, LayerGeometryCacheEntry>,
  depth = 0,
  visited = new Set<string>()
): Path2D | undefined => {
  if (depth > 8 || visited.has(componentGlyphId)) {
    return undefined
  }

  const sourceGlyph = fontData.glyphs[componentGlyphId]
  const sourceLayer = getGlyphLayer(sourceGlyph, selectedLayerId)
  if (!sourceGlyph || !sourceLayer) {
    return undefined
  }

  const nextVisited = new Set(visited)
  nextVisited.add(componentGlyphId)
  const sourceCacheKey = `${componentGlyphId}:${sourceLayer.id}`
  const sourceCachedGeometry = layerGeometryCache.get(sourceCacheKey)
  const sourceVarPath =
    sourceCachedGeometry && sourceCachedGeometry.layerRef === sourceLayer
      ? sourceCachedGeometry.varPath
      : pathDataToVarPackedPath(sourceLayer.paths)
  const combinedPath = new Path2D(sourceVarPath.toSVGPath())

  for (const componentRef of sourceLayer.componentRefs) {
    const nestedPath = buildComponentPath2D(
      componentRef.glyphId,
      fontData,
      selectedLayerId,
      layerGeometryCache,
      depth + 1,
      nextVisited
    )
    if (!nestedPath) {
      continue
    }
    const matrix = new DOMMatrix()
      .translateSelf(componentRef.x, componentRef.y)
      .rotateSelf(componentRef.rotation)
      .scaleSelf(componentRef.scaleX, componentRef.scaleY)
    combinedPath.addPath(nestedPath, matrix)
  }

  return combinedPath
}

export const buildPositionedGlyphs = ({
  activeToolId,
  editorActiveGlyphIndex,
  editorGlyphIds,
  fontData,
  selectedLayerId,
  layerGeometryCache,
}: BuildPositionedGlyphsOptions): PositionedGlyph[] => {
  if (!fontData) {
    return []
  }

  let cursorX = 0
  return editorGlyphIds
    .map((glyphId) => {
      const glyph = fontData.glyphs[glyphId]
      const activeLayer = getGlyphLayer(glyph, selectedLayerId)
      if (!glyph || !activeLayer) {
        return null
      }

      const cacheKey = `${glyph.id}:${activeLayer.id}`
      const cachedGeometry = layerGeometryCache.get(cacheKey)
      let pointRefs: Array<{ pathId: string; nodeId: string }>
      let varPath: InstanceType<typeof VarPackedPath>
      let components: ComponentData[]
      let guidelines: GuidelineData[]

      if (cachedGeometry && cachedGeometry.layerRef === activeLayer) {
        pointRefs = cachedGeometry.pointRefs
        varPath = cachedGeometry.varPath
        components = cachedGeometry.components
        guidelines = cachedGeometry.guidelines
      } else {
        pointRefs = activeLayer.paths.flatMap((path) =>
          path.nodes.map((node) => ({
            pathId: path.id,
            nodeId: node.id,
          }))
        )
        varPath = pathDataToVarPackedPath(activeLayer.paths)
        components = []
        for (const componentRef of activeLayer.componentRefs) {
          const path2d = buildComponentPath2D(
            componentRef.glyphId,
            fontData,
            selectedLayerId,
            layerGeometryCache
          )
          if (!path2d) {
            continue
          }
          components.push({
            name: componentRef.glyphId,
            transformation: {
              translateX: componentRef.x,
              translateY: componentRef.y,
              scaleX: componentRef.scaleX,
              scaleY: componentRef.scaleY,
              rotation: componentRef.rotation,
            },
            path2d,
          })
        }
        guidelines = (activeLayer.guidelines ?? []).map((guide) => ({
          x: guide.x,
          y: guide.y,
          angle: guide.angle,
          locked: guide.locked,
        }))

        layerGeometryCache.set(cacheKey, {
          layerRef: activeLayer,
          pointRefs,
          varPath,
          components,
          guidelines,
        })
      }

      const positionedGlyph: PositionedGlyph = {
        glyph: {
          path: varPath,
          xAdvance: activeLayer.metrics.width,
          components,
          guidelines,
          flattenedPath2d: undefined,
          closedContoursPath2d: undefined,
        },
        glyphId: glyph.id,
        displayCharacter: (() => {
          if (!glyph.unicode) {
            return glyph.name || glyph.id
          }
          const codePoint = Number.parseInt(glyph.unicode, 16)
          return Number.isFinite(codePoint)
            ? String.fromCodePoint(codePoint)
            : glyph.name || glyph.id
        })(),
        x: cursorX,
        y: 0,
        pointRefs,
        isEditing:
          activeToolId !== 'text' &&
          glyph.id === editorGlyphIds[editorActiveGlyphIndex],
        isSelected: glyph.id === editorGlyphIds[editorActiveGlyphIndex],
        isEmpty: activeLayer.paths.length === 0,
      }
      cursorX += activeLayer.metrics.width + 80
      return positionedGlyph
    })
    .filter((glyph): glyph is PositionedGlyph => Boolean(glyph))
}

export const getGlyphFrameAtPoint = (
  point: { x: number; y: number },
  positionedGlyphs: PositionedGlyph[],
  fontData: FontData | null
) => {
  const metrics = fontData?.lineMetricsHorizontalLayout
  const yMin = metrics?.descender?.value ?? -220
  const yMax = metrics?.ascender?.value ?? 900

  for (let index = positionedGlyphs.length - 1; index >= 0; index -= 1) {
    const positionedGlyph = positionedGlyphs[index]
    const xMin = positionedGlyph.x
    const xMax = positionedGlyph.x + positionedGlyph.glyph.xAdvance
    const translatedX = point.x
    const translatedY = point.y - positionedGlyph.y
    if (
      translatedX >= xMin &&
      translatedX <= xMax &&
      translatedY >= yMin &&
      translatedY <= yMax
    ) {
      return {
        glyphId: positionedGlyph.glyphId ?? null,
        glyphIndex: index,
        xMin,
        xMax,
      }
    }
  }

  return null
}
