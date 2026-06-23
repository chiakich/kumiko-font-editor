import { Box } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CanvasController,
  SceneView,
  VisualizationLayer,
  visualizationLayerDefinitions,
  type SceneModel,
} from 'src/sceneView'
import { SceneController } from 'src/features/editor/tools'
import { useStore, useTemporalStore, getGlyphLayer } from 'src/store'
import { CanvasContextMenu } from 'src/features/editor/canvas/workspace/components/CanvasContextMenu'
import { CanvasWorkspaceOverlay } from 'src/features/editor/canvas/workspace/components/CanvasWorkspaceOverlay'
import { HiddenTextInput } from 'src/features/editor/canvas/workspace/components/HiddenTextInput'
import {
  buildPositionedGlyphs,
  getGlyphFrameAtPoint,
  type LayerGeometryCacheEntry,
} from 'src/features/editor/canvas/workspace/layout/positionedGlyphs'
import { useCanvasTextInput } from 'src/features/editor/canvas/workspace/hooks/useCanvasTextInput'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'
import { useCanvasClipboard } from 'src/features/editor/canvas/hooks/useCanvasClipboard'
import { useCanvasKeyboardShortcuts } from 'src/features/editor/canvas/hooks/useCanvasKeyboardShortcuts'
import { useReferenceFontRestoration } from 'src/features/editor/canvas/workspace/hooks/useReferenceFontRestoration'
import { useCanvasSceneModelSync } from 'src/features/editor/canvas/workspace/hooks/useCanvasSceneModelSync'
import { isInterpolatedGlyphLocation } from 'src/font/designspaceLocation'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import { loadProjectGlyphGeometryClosure } from 'src/lib/project/projectRepository'
import type { GlyphData } from 'src/store'

export function CanvasWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasControllerRef = useRef<CanvasController | null>(null)
  const sceneControllerRef = useRef<SceneController | null>(null)
  const sceneViewRef = useRef<SceneView | null>(null)
  const temporaryToolRef = useRef<ToolId | null>(null)
  const hiddenTextInputRef = useRef<HTMLTextAreaElement | null>(null)
  const didCenterInitialGlyphRef = useRef(false)
  const editorGeometryLoadRef = useRef(new Map<string, Promise<GlyphData[]>>())
  const layerGeometryCache = useMemo(
    () => new Map<string, LayerGeometryCacheEntry>(),
    []
  )
  const [activeToolId, setActiveToolId] = useState<ToolId>('pointer')
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)

  const fontData = useStore((state) => state.fontData)
  const componentGhostPaths = useStore((state) => state.componentGhostPaths)
  const componentTargetRect = useStore((state) => state.componentTargetRect)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const editorGlyphIds = useStore((state) => state.editorGlyphIds)
  const editorText = useStore((state) => state.editorText)
  const editorTextCursorIndex = useStore((state) => state.editorTextCursorIndex)
  const editorActiveGlyphIndex = useStore(
    (state) => state.editorActiveGlyphIndex
  )
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const editLocation = useStore((state) => state.editLocation)
  const isDesignspaceScrubbing = useStore(
    (state) => state.isDesignspaceScrubbing
  )
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
  const setStartPoint = useStore((state) => state.setStartPoint)
  const referenceFontName = useStore((state) => state.referenceFontName)
  const referenceFontVisible = useStore((state) => state.referenceFontVisible)
  const referenceFontChar = useStore((state) => state.referenceFontChar)
  const projectId = useStore((state) => state.projectId)
  const hydrateGlyphGeometry = useStore((state) => state.hydrateGlyphGeometry)
  const setReferenceFontName = useStore((state) => state.setReferenceFontName)
  const setReferenceFontVisible = useStore(
    (state) => state.setReferenceFontVisible
  )
  const setReferenceFontChar = useStore((state) => state.setReferenceFontChar)
  const addGlyphs = useStore((state) => state.addGlyphs)
  const visibleBackdropLayerIds = useStore(
    (state) => state.visibleBackdropLayerIds
  )
  const hideActiveLayer = useStore((state) => state.hideActiveLayer)
  const updateNodePositions = useStore((state) => state.updateNodePositions)
  const activeEditorGlyphId =
    editorGlyphIds[editorActiveGlyphIndex] ?? selectedGlyphId ?? null
  const activeEditorGlyph = activeEditorGlyphId
    ? (fontData?.glyphs[activeEditorGlyphId] ?? null)
    : null
  const isInterpolatedPreview = useMemo(
    () =>
      isInterpolatedGlyphLocation(fontData, activeEditorGlyph, editLocation),
    [activeEditorGlyph, editLocation, fontData]
  )
  const isReadOnlyPreview = isDesignspaceScrubbing || isInterpolatedPreview

  const pastStatesLength = useTemporalStore((state) => state.pastStates.length)
  const futureStatesLength = useTemporalStore(
    (state) => state.futureStates.length
  )

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
      if (toolId !== 'text') {
        hiddenTextInputRef.current?.blur()
      }
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
        editLocation,
        fontData,
        selectedLayerId,
        layerGeometryCache,
      }),
    [
      activeToolId,
      editLocation,
      editorActiveGlyphIndex,
      editorGlyphIds,
      fontData,
      layerGeometryCache,
      selectedLayerId,
    ]
  )

  useEffect(() => {
    if (!isReadOnlyPreview) {
      return
    }
    setSelectedNodeIds([])
    setSelectedSegment(null)
  }, [isReadOnlyPreview, setSelectedNodeIds, setSelectedSegment])

  const {
    compositionOverlayStyle,
    compositionText,
    getCursorX,
    handleTextInputChange,
    handleTextInputCompositionEnd,
    handleTextInputCompositionStart,
    handleTextInputCompositionUpdate,
    handleTextInputSelect,
    textInputValue,
  } = useCanvasTextInput({
    activeToolId,
    addGlyphs,
    canvasSize,
    editorGlyphIds,
    editorText,
    editorTextCursorIndex,
    fontData,
    inputRef: hiddenTextInputRef,
    positionedGlyphs,
    setEditorActiveGlyphIndex,
    setEditorTextCursorIndex,
    setEditorTextState,
    viewport,
  })

  const positionedGlyph = useMemo(
    () =>
      positionedGlyphs[editorActiveGlyphIndex] ??
      positionedGlyphs.find((glyph) => glyph.glyphId === selectedGlyphId),
    [editorActiveGlyphIndex, positionedGlyphs, selectedGlyphId]
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
    const path = getGlyphLayer(
      fontData.glyphs[activeEditorGlyphId],
      selectedLayerId
    )?.paths.find((candidate) => candidate.id === pathId)
    if (!path) {
      return null
    }

    const currentIndex = path.nodes.findIndex((node) => node.id === nodeId)
    if (currentIndex <= 0) {
      return null
    }

    return `${pathId}:${path.nodes[currentIndex - 1].id}`
  }, [
    activeEditorGlyphId,
    activeToolId,
    fontData,
    selectedLayerId,
    selectedNodeIds,
  ])

  const resolveGlyphFrameAtPoint = useCallback(
    (point: { x: number; y: number }) =>
      getGlyphFrameAtPoint(point, positionedGlyphs, fontData),
    [fontData, positionedGlyphs]
  )

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

    // Restore the persisted viewport once; afterwards the controller owns
    // viewport state and the store only mirrors it for persistence/overlays.
    controller.setViewport(useStore.getState().viewport)

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

  useReferenceFontRestoration({
    projectId,
    setReferenceFontChar,
    setReferenceFontName,
    setReferenceFontVisible,
  })

  useEffect(() => {
    if (!projectId || editorGlyphIds.length === 0) {
      return
    }

    const currentGlyphs = useStore.getState().fontData?.glyphs ?? {}
    const missingGlyphIds = [...new Set(editorGlyphIds)]
      .filter((glyphId) => {
        const glyph = currentGlyphs[glyphId]
        return glyph && !isGlyphGeometryLoaded(glyph)
      })
      .filter((glyphId) => !editorGeometryLoadRef.current.has(glyphId))
    if (missingGlyphIds.length === 0) {
      return
    }

    const loadedGlyphIds = Object.values(currentGlyphs)
      .filter(isGlyphGeometryLoaded)
      .map((glyph) => glyph.id)
    const loadPromise = loadProjectGlyphGeometryClosure(
      projectId,
      missingGlyphIds,
      { loadedGlyphIds }
    ).finally(() => {
      for (const glyphId of missingGlyphIds) {
        editorGeometryLoadRef.current.delete(glyphId)
      }
    })

    for (const glyphId of missingGlyphIds) {
      editorGeometryLoadRef.current.set(glyphId, loadPromise)
    }
    void loadPromise.then((loadedGlyphs) => {
      if (useStore.getState().projectId === projectId) {
        hydrateGlyphGeometry(loadedGlyphs)
      }
    })
  }, [editorGlyphIds, hydrateGlyphGeometry, projectId])

  useCanvasSceneModelSync({
    activeEditorGlyphId,
    activeToolId,
    canvasControllerRef,
    canvasSize,
    componentGhostPaths,
    componentTargetRect,
    didCenterInitialGlyphRef,
    editorTextCursorIndex,
    fontData,
    getCursorX,
    hideActiveLayer,
    canEdit: !isReadOnlyPreview,
    positionedGlyph,
    positionedGlyphs,
    referenceFontChar,
    referenceFontName,
    referenceFontVisible,
    sceneControllerRef,
    selectedLayerId,
    selectedNodeIds,
    visibleBackdropLayerIds,
  })

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
        const cursorIndex =
          localPoint.x < midpoint ? hit.glyphIndex : hit.glyphCursorEndIndex
        setEditorActiveGlyphIndex(
          Math.max(0, Math.min(cursorIndex - 1, editorGlyphIds.length - 1))
        )
        setEditorTextCursorIndex(
          Math.max(0, Math.min(cursorIndex, editorGlyphIds.length))
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
    editorGlyphIds.length,
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
      if (
        activeToolId === 'text' ||
        !activeEditorGlyphId ||
        isReadOnlyPreview
      ) {
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
  }, [activeEditorGlyphId, activeToolId, isReadOnlyPreview])

  useCanvasKeyboardShortcuts({
    activeEditorGlyphId,
    activeToolId,
    canEdit: !isReadOnlyPreview,
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
        data-editor-canvas="true"
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
          setStartPoint={setStartPoint}
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
        onChange={handleTextInputChange}
        onCompositionEnd={handleTextInputCompositionEnd}
        onCompositionStart={handleTextInputCompositionStart}
        onCompositionUpdate={handleTextInputCompositionUpdate}
        onSelect={handleTextInputSelect}
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
