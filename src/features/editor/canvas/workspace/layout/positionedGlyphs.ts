import { VarPackedPath } from 'src/font/VarPackedPath'
import {
  getEffectiveNodeType,
  getGlyphLayer,
  getNodeSegmentType,
  isOffCurveNode,
  type FontData,
  type PathData,
} from 'src/store'
import type {
  ComponentData,
  GuidelineData,
  PositionedGlyph,
} from 'src/sceneView'
import { getComponentMatrix } from 'src/lib/components/componentTransform'
import { getGlyphUnicodeChar } from 'src/lib/glyph/glyphUnicode'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'
import {
  getGlyphInkBounds,
  getTextKerningValue,
} from 'src/features/editor/canvas/workspace/layout/textKerning'
import { shapeGlyphRuns } from 'src/features/editor/canvas/workspace/layout/textShaping'

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

const pathDataToVarPackedPath = (paths: PathData[]) => {
  const contours = paths.map((pathData) => ({
    points: pathData.nodes.map((node, index) => {
      const nextOnCurve = pathData.nodes
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
        smooth: getEffectiveNodeType(pathData, node) === 'smooth',
      }
    }),
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
    const matrix = getComponentMatrix(componentRef)
    combinedPath.addPath(
      nestedPath,
      new DOMMatrix([
        matrix.a,
        matrix.b,
        matrix.c,
        matrix.d,
        matrix.e,
        matrix.f,
      ])
    )
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

  const glyphRuns =
    activeToolId === 'text'
      ? shapeGlyphRuns(fontData, editorGlyphIds)
      : editorGlyphIds.map((glyphId, index) => ({
          glyphId,
          sourceGlyphIds: [glyphId],
          sourceStartIndex: index,
          sourceLength: 1,
        }))

  let cursorX = 0
  let previousGlyphId: string | null = null
  let previousAdvanceEndX = 0
  return glyphRuns
    .map((run) => {
      const glyph = fontData.glyphs[run.glyphId]
      const activeLayer = getGlyphLayer(glyph, selectedLayerId)
      if (!glyph || !activeLayer) {
        return null
      }
      const kerningWithPrevious = getTextKerningValue(
        fontData,
        previousGlyphId,
        glyph.id
      )
      cursorX += kerningWithPrevious

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
          const basePath2d = buildComponentPath2D(
            componentRef.glyphId,
            fontData,
            selectedLayerId,
            layerGeometryCache
          )
          if (!basePath2d) {
            continue
          }
          // Bake the placement transform into the path so shear/rotation/scale
          // render; the draw layer fills path2d directly.
          const matrix = getComponentMatrix(componentRef)
          const path2d = new Path2D()
          path2d.addPath(
            basePath2d,
            new DOMMatrix([
              matrix.a,
              matrix.b,
              matrix.c,
              matrix.d,
              matrix.e,
              matrix.f,
            ])
          )
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
          metrics: activeLayer.metrics,
          inkBounds: getGlyphInkBounds(activeLayer),
          kerningWithPrevious,
          previousAdvanceEndX,
          components,
          guidelines,
          flattenedPath2d: undefined,
          closedContoursPath2d: undefined,
        },
        glyphId: glyph.id,
        displayCharacter: getGlyphUnicodeChar(glyph) ?? glyph.name ?? glyph.id,
        x: cursorX,
        y: 0,
        pointRefs,
        sourceGlyphIds: run.sourceGlyphIds,
        sourceStartIndex: run.sourceStartIndex,
        sourceLength: run.sourceLength,
        isEditing:
          activeToolId !== 'text' &&
          run.sourceStartIndex <= editorActiveGlyphIndex &&
          editorActiveGlyphIndex < run.sourceStartIndex + run.sourceLength,
        isSelected:
          run.sourceStartIndex <= editorActiveGlyphIndex &&
          editorActiveGlyphIndex < run.sourceStartIndex + run.sourceLength,
        isEmpty: activeLayer.paths.length === 0,
      }
      previousGlyphId = glyph.id
      previousAdvanceEndX = cursorX + activeLayer.metrics.width
      cursorX = previousAdvanceEndX
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
        glyphIndex: positionedGlyph.sourceStartIndex ?? index,
        glyphCursorEndIndex:
          (positionedGlyph.sourceStartIndex ?? index) +
          (positionedGlyph.sourceLength ?? 1),
        xMin,
        xMax,
      }
    }
  }

  return null
}
