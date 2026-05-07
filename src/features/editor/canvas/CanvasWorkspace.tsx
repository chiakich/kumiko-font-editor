import { Box } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CanvasController,
  SceneView,
  VisualizationLayer,
  visualizationLayerDefinitions,
  type Rect,
  type SceneModel,
} from 'src/canvas'
import { SceneController } from 'src/features/editor/tools'
import { useStore, useTemporalStore } from 'src/store'
import { CanvasContextMenu } from 'src/features/editor/canvas/workspace/CanvasContextMenu'
import { CanvasWorkspaceOverlay } from 'src/features/editor/canvas/workspace/CanvasWorkspaceOverlay'
import { HiddenTextInput } from 'src/features/editor/canvas/workspace/HiddenTextInput'
import {
  buildPositionedGlyphs,
  getGlyphFrameAtPoint,
  type LayerGeometryCacheEntry,
} from 'src/features/editor/canvas/workspace/positionedGlyphs'
import {
  buildGlyphIdByCharacter,
  charIndexToCodeUnitIndex,
  codeUnitIndexToCharIndex,
} from 'src/features/editor/canvas/workspace/textInput'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'
import { useCanvasClipboard } from 'src/features/editor/canvas/useCanvasClipboard'
import { useCanvasKeyboardShortcuts } from 'src/features/editor/canvas/useCanvasKeyboardShortcuts'

export function CanvasWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasControllerRef = useRef<CanvasController | null>(null)
  const sceneControllerRef = useRef<SceneController | null>(null)
  const sceneViewRef = useRef<SceneView | null>(null)
  const temporaryToolRef = useRef<ToolId | null>(null)
  const hiddenTextInputRef = useRef<HTMLTextAreaElement | null>(null)
  const didCenterInitialGlyphRef = useRef(false)
  const layerGeometryCache = useMemo(
    () => new Map<string, LayerGeometryCacheEntry>(),
    []
  )
  const [activeToolId, setActiveToolId] = useState<ToolId>('pointer')
  const [draftTextInputValue, setDraftTextInputValue] = useState('')
  const [isComposingText, setIsComposingText] = useState(false)
  const [compositionText, setCompositionText] = useState('')
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)

  const fontData = useStore((state) => state.fontData)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const editorGlyphIds = useStore((state) => state.editorGlyphIds)
  const editorText = useStore((state) => state.editorText)
  const editorTextCursorIndex = useStore((state) => state.editorTextCursorIndex)
  const editorActiveGlyphIndex = useStore(
    (state) => state.editorActiveGlyphIndex
  )
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const selectedNodeIds = useStore((state) => state.selectedNodeIds)
  const selectedSegment = useStore((state) => state.selectedSegment)
  const clearPreviewGlyphMetrics = useStore(
    (state) => state.clearPreviewGlyphMetrics
  )
  const viewport = useStore((state) => state.viewport)
  const setSelectedNodeIds = useStore((state) => state.setSelectedNodeIds)
  const setSelectedSegment = useStore((state) => state.setSelectedSegment)
  const setEditorTextCursorIndex = useStore(
    (state) => state.setEditorTextCursorIndex
  )
  const setEditorActiveGlyphIndex = useStore(
    (state) => state.setEditorActiveGlyphIndex
  )
  const setEditorTextState = useStore((state) => state.setEditorTextState)
  const updateViewport = useStore((state) => state.updateViewport)
  const deleteSelectedNodes = useStore((state) => state.deleteSelectedNodes)
  const reconnectSelectedNodes = useStore(
    (state) => state.reconnectSelectedNodes
  )
  const reversePaths = useStore((state) => state.reversePaths)
  const updateNodePositions = useStore((state) => state.updateNodePositions)
  const activeEditorGlyphId =
    editorGlyphIds[editorActiveGlyphIndex] ?? selectedGlyphId ?? null

  const pastStatesLength = useTemporalStore((state) => state.pastStates.length)
  const futureStatesLength = useTemporalStore(
    (state) => state.futureStates.length
  )
  const textInputValue = isComposingText ? draftTextInputValue : editorText

  const handleUndo = useCallback(() => {
    useStore.temporal.getState().undo()
  }, [])

  const handleRedo = useCallback(() => {
    useStore.temporal.getState().redo()
  }, [])

  const { copySelection, cutSelection, pasteSelection } = useCanvasClipboard({
    activeEditorGlyphId,
    deleteSelectedNodes,
    fontData,
    selectedNodeIds,
    selectedSegment,
    setSelectedNodeIds,
  })

  const requestCanvasUpdate = useCallback(() => {
    canvasControllerRef.current?.requestUpdate()
  }, [])

  const handleToolSelect = useCallback(
    (toolId: ToolId) => {
      sceneControllerRef.current?.setActiveTool(toolId)
      setActiveToolId(toolId)
      setSelectedNodeIds([])
      setSelectedSegment(null)
    },
    [setSelectedNodeIds, setSelectedSegment]
  )

  const positionedGlyphs = useMemo(
    () =>
      buildPositionedGlyphs({
        activeToolId,
        editorActiveGlyphIndex,
        editorGlyphIds,
        fontData,
        selectedLayerId,
        layerGeometryCache,
      }),
    [
      activeToolId,
      editorActiveGlyphIndex,
      editorGlyphIds,
      fontData,
      layerGeometryCache,
      selectedLayerId,
    ]
  )

  const positionedGlyph = useMemo(
    () =>
      positionedGlyphs[editorActiveGlyphIndex] ??
      positionedGlyphs.find((glyph) => glyph.glyphId === selectedGlyphId),
    [editorActiveGlyphIndex, positionedGlyphs, selectedGlyphId]
  )

  const glyphIdByCharacter = useMemo(
    () => buildGlyphIdByCharacter(fontData),
    [fontData]
  )

  const getPreviousPenSelection = useCallback(() => {
    if (
      activeToolId !== 'pen' ||
      !fontData ||
      !activeEditorGlyphId ||
      selectedNodeIds.length !== 1
    ) {
      return null
    }

    const [pathId, nodeId] = selectedNodeIds[0].split(':')
    const path = fontData.glyphs[activeEditorGlyphId]?.paths.find(
      (candidate) => candidate.id === pathId
    )
    if (!path) {
      return null
    }

    const currentIndex = path.nodes.findIndex((node) => node.id === nodeId)
    if (currentIndex <= 0) {
      return null
    }

    return `${pathId}:${path.nodes[currentIndex - 1].id}`
  }, [activeEditorGlyphId, activeToolId, fontData, selectedNodeIds])

  const resolveGlyphFrameAtPoint = useCallback(
    (point: { x: number; y: number }) =>
      getGlyphFrameAtPoint(point, positionedGlyphs, fontData),
    [fontData, positionedGlyphs]
  )

  const commitTextInputValue = useCallback(
    (value: string, selectionStart: number | null) => {
      const beforeCursor = value.slice(0, selectionStart ?? value.length)
      const supportedChars = Array.from(value).filter((character) =>
        glyphIdByCharacter.has(character)
      )
      const supportedBeforeCursor = Array.from(beforeCursor).filter(
        (character) => glyphIdByCharacter.has(character)
      )
      const glyphIds = supportedChars
        .map((character) => glyphIdByCharacter.get(character))
        .filter((glyphId): glyphId is string => Boolean(glyphId))
      setEditorTextState(
        supportedChars.join(''),
        glyphIds,
        supportedBeforeCursor.length,
        glyphIds.length > 0
          ? Math.max(
              0,
              Math.min(supportedBeforeCursor.length - 1, glyphIds.length - 1)
            )
          : 0
      )
      setDraftTextInputValue(supportedChars.join(''))
    },
    [glyphIdByCharacter, setEditorTextState]
  )

  const getCursorX = useCallback(
    (cursorIndex: number) => {
      const cursorGlyph = positionedGlyphs[cursorIndex]
      const previousGlyph = positionedGlyphs[cursorIndex - 1]
      return cursorGlyph
        ? cursorGlyph.x
        : previousGlyph
          ? previousGlyph.x + previousGlyph.glyph.xAdvance + 80
          : 0
    },
    [positionedGlyphs]
  )

  const compositionOverlayStyle = useMemo(() => {
    if (
      activeToolId !== 'text' ||
      !isComposingText ||
      !compositionText ||
      canvasSize.width === 0
    ) {
      return null
    }

    return {
      left:
        canvasSize.width / 2 +
        viewport.pan.x +
        getCursorX(editorTextCursorIndex) * viewport.zoom,
      top: canvasSize.height / 2 + viewport.pan.y - 28,
    }
  }, [
    activeToolId,
    canvasSize.height,
    canvasSize.width,
    compositionText,
    editorTextCursorIndex,
    getCursorX,
    isComposingText,
    viewport.pan.x,
    viewport.pan.y,
    viewport.zoom,
  ])

  useEffect(() => {
    if (activeToolId !== 'text') {
      return
    }

    const input = hiddenTextInputRef.current
    if (!input) {
      return
    }

    const selectionOffset = charIndexToCodeUnitIndex(
      textInputValue,
      editorTextCursorIndex
    )
    input.focus()
    input.setSelectionRange(selectionOffset, selectionOffset)
  }, [activeToolId, editorTextCursorIndex, textInputValue])

  useEffect(() => {
    if (!canvasRef.current || canvasControllerRef.current) {
      return
    }

    const canvas = canvasRef.current
    const controller = new CanvasController(canvas)
    canvasControllerRef.current = controller

    const layers = visualizationLayerDefinitions.map(
      (definition) => new VisualizationLayer(definition)
    )
    const sceneView = new SceneView(layers)
    sceneViewRef.current = sceneView
    controller.sceneView = sceneView

    const sceneModel: SceneModel = {
      glyph: undefined,
      glyphs: [],
      selection: new Set(),
      hoverSelection: new Set(),
      canEdit: true,
    }

    controller.sceneModel = sceneModel

    const sceneController = new SceneController({
      canvasController: controller,
      model: sceneModel,
      onSelectionChange: (selection) => {
        const pointRefs = sceneController.sceneModel.glyph?.pointRefs ?? []
        const nodeIds: string[] = []
        for (const item of selection) {
          const match = item.match(/^point\/(\d+)$/)
          if (!match) {
            continue
          }
          const nodeIndex = Number.parseInt(match[1], 10)
          const pointRef = pointRefs[nodeIndex]
          if (pointRef) {
            nodeIds.push(`${pointRef.pathId}:${pointRef.nodeId}`)
          }
        }
        setSelectedNodeIds(nodeIds)
        if (nodeIds.length > 0) {
          setSelectedSegment(null)
        }
      },
      onSelectedPathHitChange: (pathHit) => {
        const pointRefs = sceneController.sceneModel.glyph?.pointRefs ?? []
        if (!pathHit || pathHit.segment.pointIndices.length < 2) {
          setSelectedSegment(null)
          return
        }

        const [startIndex, endIndex] = pathHit.segment.pointIndices
        const startRef = pointRefs[startIndex]
        const endRef = pointRefs[endIndex]
        if (!startRef || !endRef || startRef.pathId !== endRef.pathId) {
          setSelectedSegment(null)
          return
        }

        setSelectedSegment({
          pathId: startRef.pathId,
          startNodeId: startRef.nodeId,
          endNodeId: endRef.nodeId,
          type: pathHit.segment.type ?? 'line',
        })
      },
      onUpdateNodePosition: (glyphId, pathId, nodeId, newPos) => {
        useStore.getState().updateNodePosition(glyphId, pathId, nodeId, newPos)
      },
      onCommitNodePositions: (glyphId, updates) => {
        useStore.getState().updateNodePositions(glyphId, updates)
      },
      onUpdateNodeType: (glyphId, pathId, nodeId, type) => {
        useStore.getState().updateNodeType(glyphId, pathId, nodeId, type)
      },
      onPreviewGlyphMetrics: (glyphId, metrics) => {
        useStore.getState().setPreviewGlyphMetrics(glyphId, metrics)
      },
      onClearPreviewGlyphMetrics: (glyphId) => {
        useStore.getState().clearPreviewGlyphMetrics(glyphId)
      },
    })

    sceneControllerRef.current = sceneController

    controller.onViewportChange = (vp) => {
      setCanvasSize({
        width: controller.canvasWidth,
        height: controller.canvasHeight,
      })
      updateViewport(vp.zoom, vp.pan.x, vp.pan.y)
    }

    setCanvasSize({
      width: controller.canvasWidth,
      height: controller.canvasHeight,
    })
    controller.draw()

    return () => {
      controller.onViewportChange = null
      sceneController.destroy()
      controller.destroy()
      canvasControllerRef.current = null
      sceneControllerRef.current = null
      sceneViewRef.current = null
    }
  }, [setSelectedNodeIds, setSelectedSegment, updateViewport])

  useEffect(() => {
    if (!selectedGlyphId) {
      clearPreviewGlyphMetrics()
    }
  }, [clearPreviewGlyphMetrics, selectedGlyphId])

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
    const selectionPointIds = new Set(
      selectedNodeIds.flatMap((selectedNodeId) => {
        const pointRefs = positionedGlyph?.pointRefs ?? []
        const pointIndex = pointRefs.findIndex(
          (pointRef) =>
            `${pointRef.pathId}:${pointRef.nodeId}` === selectedNodeId
        )
        return pointIndex >= 0 ? [`point/${pointIndex}`] : []
      })
    )
    sceneController.sceneModel.selection = selectionPointIds
    sceneController.selection = selectionPointIds

    controller.setViewport(viewport)
    controller.requestUpdate()
  }, [
    activeToolId,
    editorTextCursorIndex,
    fontData,
    getCursorX,
    positionedGlyph,
    positionedGlyphs,
    selectedNodeIds,
    viewport,
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
    const viewBox: Rect = {
      xMin: xMin - paddingX,
      yMin: yMin - paddingY,
      xMax: xMax + paddingX,
      yMax: yMax + paddingY,
    }

    didCenterInitialGlyphRef.current = true
    controller.fitRect(viewBox)
  }, [canvasSize.height, canvasSize.width, fontData, positionedGlyph])

  useEffect(() => {
    const canvas = canvasRef.current
    const controller = canvasControllerRef.current
    if (!canvas || !controller) {
      return
    }

    const handleCanvasClick = (event: MouseEvent) => {
      const localPoint = controller.localPoint({
        x: event.pageX,
        y: event.pageY,
      })
      const hit = resolveGlyphFrameAtPoint(localPoint)
      if (!hit?.glyphId) {
        return
      }

      if (activeToolId === 'text') {
        event.preventDefault()
        event.stopPropagation()
        const midpoint = (hit.xMin + hit.xMax) / 2
        setEditorActiveGlyphIndex(hit.glyphIndex)
        setEditorTextCursorIndex(
          localPoint.x < midpoint ? hit.glyphIndex : hit.glyphIndex + 1
        )
        hiddenTextInputRef.current?.focus()
        return
      }

      if (hit.glyphId !== activeEditorGlyphId) {
        event.preventDefault()
        event.stopPropagation()
        setEditorActiveGlyphIndex(hit.glyphIndex)
      }
    }

    const handleCanvasDoubleClick = (event: MouseEvent) => {
      const localPoint = controller.localPoint({
        x: event.pageX,
        y: event.pageY,
      })
      const hit = resolveGlyphFrameAtPoint(localPoint)
      if (!hit?.glyphId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      if (hit.glyphId !== activeEditorGlyphId) {
        setEditorActiveGlyphIndex(hit.glyphIndex)
      }
      if (activeToolId === 'text') {
        handleToolSelect('pointer')
      }
    }

    canvas.addEventListener('click', handleCanvasClick)
    canvas.addEventListener('dblclick', handleCanvasDoubleClick)
    return () => {
      canvas.removeEventListener('click', handleCanvasClick)
      canvas.removeEventListener('dblclick', handleCanvasDoubleClick)
    }
  }, [
    activeEditorGlyphId,
    activeToolId,
    handleToolSelect,
    resolveGlyphFrameAtPoint,
    setEditorActiveGlyphIndex,
    setEditorTextCursorIndex,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const handleCanvasContextMenu = (event: MouseEvent) => {
      if (activeToolId === 'text' || !activeEditorGlyphId) {
        setContextMenu(null)
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const rect =
        canvas.parentElement?.getBoundingClientRect() ??
        canvas.getBoundingClientRect()
      setContextMenu({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }

    const closeContextMenu = () => setContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    canvas.addEventListener('contextmenu', handleCanvasContextMenu)
    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      canvas.removeEventListener('contextmenu', handleCanvasContextMenu)
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeEditorGlyphId, activeToolId])

  useCanvasKeyboardShortcuts({
    activeEditorGlyphId,
    activeToolId,
    deleteSelectedNodes,
    fontData,
    getPreviousPenSelection,
    onCopySelection: copySelection,
    onCutSelection: cutSelection,
    onPasteSelection: pasteSelection,
    onRedo: handleRedo,
    onSelectTool: handleToolSelect,
    onUndo: handleUndo,
    selectedLayerId,
    selectedNodeIds,
    setSelectedNodeIds,
    setSelectedSegment,
    temporaryToolRef,
    updateNodePositions,
  })

  return (
    <Box position="relative" w="100%" h="100%" bg="white" overflow="hidden">
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'default',
        }}
      />

      {contextMenu && (
        <CanvasContextMenu
          activeEditorGlyphId={activeEditorGlyphId}
          copySelection={copySelection}
          cutSelection={cutSelection}
          fontData={fontData}
          pasteSelection={pasteSelection}
          position={contextMenu}
          reconnectSelectedNodes={reconnectSelectedNodes}
          reversePaths={reversePaths}
          selectedLayerId={selectedLayerId}
          selectedNodeIds={selectedNodeIds}
          selectedSegment={selectedSegment}
          onClose={() => setContextMenu(null)}
          onRequestCanvasUpdate={requestCanvasUpdate}
        />
      )}

      <HiddenTextInput
        activeToolId={activeToolId}
        compositionOverlayStyle={compositionOverlayStyle}
        compositionText={compositionText}
        inputRef={hiddenTextInputRef}
        textInputValue={textInputValue}
        onChange={(event) => {
          setDraftTextInputValue(event.target.value)
          if (!isComposingText) {
            commitTextInputValue(
              event.target.value,
              event.target.selectionStart
            )
          }
        }}
        onCompositionEnd={(event) => {
          setIsComposingText(false)
          setCompositionText('')
          setDraftTextInputValue(event.currentTarget.value)
          commitTextInputValue(
            event.currentTarget.value,
            event.currentTarget.selectionStart
          )
        }}
        onCompositionStart={() => {
          setDraftTextInputValue(textInputValue)
          setIsComposingText(true)
        }}
        onCompositionUpdate={(event) => {
          setCompositionText(event.data)
        }}
        onSelect={(event) => {
          if (activeToolId !== 'text') {
            return
          }
          const target = event.target as HTMLTextAreaElement
          const cursorIndex = codeUnitIndexToCharIndex(
            target.value,
            target.selectionStart ?? target.value.length
          )
          setEditorTextCursorIndex(cursorIndex)
          if (editorGlyphIds.length > 0) {
            setEditorActiveGlyphIndex(
              Math.max(0, Math.min(cursorIndex - 1, editorGlyphIds.length - 1))
            )
          }
        }}
      />

      <CanvasWorkspaceOverlay
        activeToolId={activeToolId}
        canRedo={futureStatesLength > 0}
        canUndo={pastStatesLength > 0}
        onRedo={handleRedo}
        onSelectTool={handleToolSelect}
        onUndo={handleUndo}
      />
    </Box>
  )
}
