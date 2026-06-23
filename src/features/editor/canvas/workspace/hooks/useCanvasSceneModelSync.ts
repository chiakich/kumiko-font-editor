import { useEffect, useMemo, type RefObject } from 'react'
import type { CanvasController, PositionedGlyph } from 'src/sceneView'
import { SceneController } from 'src/features/editor/tools'
import { useGlyphInsight } from 'src/features/editor/insight/glyphInsight'
import { buildStructureGuideModel } from 'src/features/editor/insight/structureGuideModel'
import { consumePendingEditorViewportRect } from 'src/features/editor/pendingEditorViewport'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'
import { VarPackedPath } from 'src/font/VarPackedPath'
import { getGlyphUnicodeChar } from 'src/lib/glyph/glyphUnicode'
import { buildReferenceCharPath } from 'src/lib/referenceFont/referenceFontStore'
import {
  getGlyphLayer,
  getNodeSegmentType,
  isOffCurveNode,
  type FontData,
  type PathData,
} from 'src/store'

const buildPath2DFromPaths = (paths: PathData[]) =>
  new Path2D(
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
                ? ('offCurveQuad' as const)
                : ('offCurveCubic' as const)
              : ('onCurve' as const),
            smooth: isOffCurveNode(node) ? false : (node.smooth ?? false),
          }
        }),
      }))
    ).toSVGPath()
  )

interface CanvasSceneModelSyncOptions {
  activeEditorGlyphId: string | null
  activeToolId: ToolId
  canvasControllerRef: RefObject<CanvasController | null>
  canvasSize: { width: number; height: number }
  canEdit: boolean
  componentGhostPaths: PathData[] | null
  componentTargetRect: {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
  } | null
  didCenterInitialGlyphRef: RefObject<boolean>
  editorTextCursorIndex: number
  fontData: FontData | null
  getCursorX: (cursorIndex: number) => number
  hideActiveLayer: boolean
  positionedGlyph: PositionedGlyph | undefined
  positionedGlyphs: PositionedGlyph[]
  referenceFontChar: string | null
  referenceFontName: string | null
  referenceFontVisible: boolean
  sceneControllerRef: RefObject<SceneController | null>
  selectedLayerId: string | null
  selectedNodeIds: string[]
  visibleBackdropLayerIds: string[]
}

export function useCanvasSceneModelSync({
  activeEditorGlyphId,
  activeToolId,
  canvasControllerRef,
  canvasSize,
  canEdit,
  componentGhostPaths,
  componentTargetRect,
  didCenterInitialGlyphRef,
  editorTextCursorIndex,
  fontData,
  getCursorX,
  hideActiveLayer,
  positionedGlyph,
  positionedGlyphs,
  referenceFontChar,
  referenceFontName,
  referenceFontVisible,
  sceneControllerRef,
  selectedLayerId,
  selectedNodeIds,
  visibleBackdropLayerIds,
}: CanvasSceneModelSyncOptions) {
  useEffect(() => {
    const sceneController = sceneControllerRef.current
    const controller = canvasControllerRef.current
    if (!sceneController || !controller) {
      return
    }

    sceneController.sceneModel.componentGhostPath = componentGhostPaths?.length
      ? buildPath2DFromPaths(componentGhostPaths)
      : undefined
    sceneController.sceneModel.componentTargetBox =
      componentTargetRect ?? undefined
    controller.requestUpdate()
  }, [
    canvasControllerRef,
    componentGhostPaths,
    componentTargetRect,
    sceneControllerRef,
  ])

  const insight = useGlyphInsight()
  const structureGuide = useMemo(
    () =>
      insight.showBands &&
      insight.sample &&
      insight.baseline &&
      insight.sample.glyphId === activeEditorGlyphId
        ? buildStructureGuideModel(insight.sample, insight.baseline)
        : undefined,
    [activeEditorGlyphId, insight.baseline, insight.sample, insight.showBands]
  )

  useEffect(() => {
    const sceneController = sceneControllerRef.current
    const controller = canvasControllerRef.current
    if (!sceneController || !controller) {
      return
    }
    sceneController.sceneModel.structureGuide = structureGuide
    controller.requestUpdate()
  }, [canvasControllerRef, sceneControllerRef, structureGuide])

  useEffect(() => {
    const sceneController = sceneControllerRef.current
    const controller = canvasControllerRef.current
    if (!sceneController || !controller) {
      return
    }

    const glyph = activeEditorGlyphId
      ? fontData?.glyphs[activeEditorGlyphId]
      : null
    const fallbackChar = getGlyphUnicodeChar(glyph ?? undefined)
    const char = referenceFontChar || fallbackChar
    const unitsPerEm = fontData?.unitsPerEm ?? 1000
    const advanceWidth =
      getGlyphLayer(glyph ?? undefined, selectedLayerId)?.metrics.width ??
      unitsPerEm

    sceneController.sceneModel.referencePath =
      referenceFontVisible && referenceFontName && char
        ? (buildReferenceCharPath(char, unitsPerEm, advanceWidth) ?? undefined)
        : undefined
    controller.requestUpdate()
  }, [
    activeEditorGlyphId,
    canvasControllerRef,
    fontData,
    referenceFontChar,
    referenceFontName,
    referenceFontVisible,
    sceneControllerRef,
    selectedLayerId,
  ])

  useEffect(() => {
    const sceneController = sceneControllerRef.current
    const controller = canvasControllerRef.current
    if (!sceneController || !controller) {
      return
    }

    const glyph = activeEditorGlyphId
      ? fontData?.glyphs[activeEditorGlyphId]
      : null
    const activeLayerId = glyph
      ? (selectedLayerId ?? glyph.activeLayerId ?? null)
      : null
    const paths: Path2D[] = []
    if (glyph) {
      for (const layerId of visibleBackdropLayerIds) {
        if (layerId === activeLayerId) {
          continue
        }
        const layer = getGlyphLayer(glyph, layerId)
        if (layer?.paths?.length) {
          paths.push(buildPath2DFromPaths(layer.paths))
        }
      }
    }
    sceneController.sceneModel.backdropPaths = paths.length ? paths : undefined
    sceneController.sceneModel.hideActiveLayer = hideActiveLayer
    controller.requestUpdate()
  }, [
    activeEditorGlyphId,
    canvasControllerRef,
    fontData,
    hideActiveLayer,
    sceneControllerRef,
    selectedLayerId,
    visibleBackdropLayerIds,
  ])

  useEffect(() => {
    const sceneController = sceneControllerRef.current
    const controller = canvasControllerRef.current
    if (!sceneController || !controller) {
      return
    }

    sceneController.sceneModel.glyph = positionedGlyph
    sceneController.sceneModel.glyphs = positionedGlyphs
    if (activeToolId === 'text') {
      const metrics = fontData?.lineMetricsHorizontalLayout
      const yMin = metrics?.descender?.value ?? -220
      const yMax = metrics?.ascender?.value ?? 900
      const cursorX = getCursorX(editorTextCursorIndex)
      sceneController.sceneModel.textCursor = { x: cursorX, yMin, yMax }
    } else {
      sceneController.sceneModel.textCursor = undefined
    }
    sceneController.sceneModel.lineMetricsHorizontalLayout =
      fontData?.lineMetricsHorizontalLayout
    const selectionPointIds = canEdit
      ? new Set(
          selectedNodeIds.flatMap((selectedNodeId) => {
            const pointRefs = positionedGlyph?.pointRefs ?? []
            const pointIndex = pointRefs.findIndex(
              (pointRef) =>
                `${pointRef.pathId}:${pointRef.nodeId}` === selectedNodeId
            )
            return pointIndex >= 0 ? [`point/${pointIndex}`] : []
          })
        )
      : new Set<string>()
    sceneController.sceneModel.selection = selectionPointIds
    sceneController.selection = selectionPointIds
    sceneController.sceneModel.canEdit = canEdit

    controller.requestUpdate()
  }, [
    activeToolId,
    canEdit,
    canvasControllerRef,
    editorTextCursorIndex,
    fontData,
    getCursorX,
    positionedGlyph,
    positionedGlyphs,
    sceneControllerRef,
    selectedNodeIds,
  ])

  useEffect(() => {
    const controller = canvasControllerRef.current
    if (
      didCenterInitialGlyphRef.current ||
      !controller ||
      !positionedGlyph ||
      canvasSize.width === 0 ||
      canvasSize.height === 0
    ) {
      return
    }

    const metrics = fontData?.lineMetricsHorizontalLayout
    const fallbackYMin = metrics?.descender?.value ?? -220
    const fallbackYMax = metrics?.ascender?.value ?? 900
    const bounds = positionedGlyph.glyph.path.getControlBounds()
    const xMin = positionedGlyph.x + Math.min(bounds?.xMin ?? 0, 0)
    const xMax =
      positionedGlyph.x +
      Math.max(
        bounds?.xMax ?? positionedGlyph.glyph.xAdvance,
        positionedGlyph.glyph.xAdvance
      )
    const yMin = Math.min(bounds?.yMin ?? fallbackYMin, fallbackYMin)
    const yMax = Math.max(bounds?.yMax ?? fallbackYMax, fallbackYMax)
    const paddingX = Math.max(80, (xMax - xMin) * 0.18)
    const paddingY = Math.max(120, (yMax - yMin) * 0.12)

    didCenterInitialGlyphRef.current = true
    const pendingRect = consumePendingEditorViewportRect()
    controller.fitRect(
      pendingRect ?? {
        xMin: xMin - paddingX,
        yMin: yMin - paddingY,
        xMax: xMax + paddingX,
        yMax: yMax + paddingY,
      }
    )
  }, [
    canvasControllerRef,
    canvasSize.height,
    canvasSize.width,
    didCenterInitialGlyphRef,
    fontData,
    positionedGlyph,
  ])
}
