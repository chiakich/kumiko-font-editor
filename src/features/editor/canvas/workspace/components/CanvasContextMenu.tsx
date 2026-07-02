import { Box } from '@chakra-ui/react'
import { useCallback, useMemo, type ReactNode } from 'react'
import {
  getGlyphLayer,
  isOffCurveNode,
  type FontData,
  type SelectedSegmentState,
} from 'src/store'
import { useTranslation } from 'react-i18next'

interface CanvasContextMenuProps {
  activeEditorGlyphId: string | null
  copySelection: () => Promise<void>
  cutSelection: () => Promise<void>
  fontData: FontData | null
  pasteSelection: () => Promise<void>
  position: { x: number; y: number }
  reconnectSelectedNodes: (glyphId: string, selectedNodeIds: string[]) => void
  reversePaths: (glyphId: string, pathIds: string[]) => void
  setStartPoint: (glyphId: string, pathId: string, nodeId: string) => void
  selectedLayerId: string | null
  selectedNodeIds: string[]
  selectedSegment: SelectedSegmentState | null
  onClose: () => void
  onRequestCanvasUpdate: () => void
}

export function CanvasContextMenu({
  activeEditorGlyphId,
  copySelection,
  cutSelection,
  fontData,
  pasteSelection,
  position,
  reconnectSelectedNodes,
  reversePaths,
  setStartPoint,
  selectedLayerId,
  selectedNodeIds,
  selectedSegment,
  onClose,
  onRequestCanvasUpdate,
}: CanvasContextMenuProps) {
  const { t } = useTranslation()

  const selectedReversiblePathIds = useMemo(
    () =>
      getSelectedReversiblePathIds({
        activeEditorGlyphId,
        fontData,
        selectedLayerId,
        selectedNodeIds,
      }),
    [activeEditorGlyphId, fontData, selectedLayerId, selectedNodeIds]
  )

  const startPointTarget = useMemo(
    () =>
      getSelectedStartPointTarget({
        activeEditorGlyphId,
        fontData,
        selectedLayerId,
        selectedNodeIds,
      }),
    [activeEditorGlyphId, fontData, selectedLayerId, selectedNodeIds]
  )

  const handleSetStartPoint = useCallback(() => {
    if (!activeEditorGlyphId || !startPointTarget) {
      onClose()
      return
    }

    setStartPoint(
      activeEditorGlyphId,
      startPointTarget.pathId,
      startPointTarget.nodeId
    )
    onClose()
    onRequestCanvasUpdate()
  }, [
    activeEditorGlyphId,
    onClose,
    onRequestCanvasUpdate,
    setStartPoint,
    startPointTarget,
  ])

  const handleReconnectSelectedNodes = useCallback(() => {
    if (!activeEditorGlyphId || selectedNodeIds.length < 2) {
      onClose()
      return
    }

    reconnectSelectedNodes(activeEditorGlyphId, selectedNodeIds)
    onClose()
    onRequestCanvasUpdate()
  }, [
    activeEditorGlyphId,
    onClose,
    onRequestCanvasUpdate,
    reconnectSelectedNodes,
    selectedNodeIds,
  ])

  const handleReverseSelectedPaths = useCallback(() => {
    if (!activeEditorGlyphId || selectedReversiblePathIds.length === 0) {
      onClose()
      return
    }

    reversePaths(activeEditorGlyphId, selectedReversiblePathIds)
    onClose()
    onRequestCanvasUpdate()
  }, [
    activeEditorGlyphId,
    onClose,
    onRequestCanvasUpdate,
    reversePaths,
    selectedReversiblePathIds,
  ])

  const handleCopySelection = useCallback(() => {
    void copySelection()
    onClose()
  }, [copySelection, onClose])

  const handleCutSelection = useCallback(() => {
    void cutSelection()
    onClose()
  }, [cutSelection, onClose])

  const handlePasteSelection = useCallback(() => {
    void pasteSelection()
    onClose()
  }, [onClose, pasteSelection])

  return (
    <Box
      position="absolute"
      left={`${position.x}px`}
      top={`${position.y}px`}
      zIndex={20}
      minW="168px"
      py="4px"
      bg="field.panel"
      border="1px solid"
      borderColor="controlBorder"
      borderRadius="6px"
      boxShadow="0 10px 30px rgba(15, 23, 42, 0.18)"
      overflow="hidden"
      onClick={(event: React.MouseEvent<HTMLDivElement>) =>
        event.stopPropagation()
      }
    >
      <ContextMenuButton
        isDisabled={selectedNodeIds.length === 0 && !selectedSegment}
        onClick={handleCopySelection}
      >
        {t('editor.copy')}
      </ContextMenuButton>
      <ContextMenuButton
        isDisabled={selectedNodeIds.length === 0}
        onClick={handleCutSelection}
      >
        {t('editor.cut')}
      </ContextMenuButton>
      <ContextMenuButton onClick={handlePasteSelection}>
        {t('editor.paste')}
      </ContextMenuButton>
      <Box h="1px" my="4px" bg="field.panelMuted" />
      <ContextMenuButton
        isDisabled={selectedReversiblePathIds.length === 0}
        onClick={handleReverseSelectedPaths}
      >
        {t('editor.reverseSelectedContourDirection')}
      </ContextMenuButton>
      <ContextMenuButton
        isDisabled={!startPointTarget}
        onClick={handleSetStartPoint}
      >
        {t('editor.setStartPoint')}
      </ContextMenuButton>
      <ContextMenuButton
        isDisabled={selectedNodeIds.length < 2}
        onClick={handleReconnectSelectedNodes}
      >
        {t('editor.reconnectControlPoints')}
      </ContextMenuButton>
    </Box>
  )
}

function ContextMenuButton({
  children,
  isDisabled = false,
  onClick,
}: {
  children: ReactNode
  isDisabled?: boolean
  onClick: () => void
}) {
  return (
    <Box
      display="block"
      w="100%"
      px="12px"
      py="8px"
      textAlign="left"
      fontSize="13px"
      color={isDisabled ? 'field.haze' : 'field.ink'}
      cursor={isDisabled ? 'default' : 'pointer'}
      _hover={isDisabled ? undefined : { bg: 'field.panelMuted' }}
      asChild
    >
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) {
            onClick()
          }
        }}
      >
        {children}
      </button>
    </Box>
  )
}

function getSelectedReversiblePathIds({
  activeEditorGlyphId,
  fontData,
  selectedLayerId,
  selectedNodeIds,
}: {
  activeEditorGlyphId: string | null
  fontData: FontData | null
  selectedLayerId: string | null
  selectedNodeIds: string[]
}) {
  if (!fontData || !activeEditorGlyphId || selectedNodeIds.length === 0) {
    return []
  }

  const glyph = fontData.glyphs[activeEditorGlyphId]
  if (!glyph) {
    return []
  }

  const activeLayer = getGlyphLayer(glyph, selectedLayerId)
  if (!activeLayer) {
    return []
  }

  const selectedByPath = new Map<string, Set<string>>()
  for (const selectedNodeId of selectedNodeIds) {
    const [pathId, nodeId] = selectedNodeId.split(':')
    if (!pathId || !nodeId) {
      continue
    }
    const nodeIds = selectedByPath.get(pathId) ?? new Set<string>()
    nodeIds.add(nodeId)
    selectedByPath.set(pathId, nodeIds)
  }

  return activeLayer.paths.flatMap((path) => {
    const selectedIds = selectedByPath.get(path.id)
    if (
      !selectedIds ||
      path.nodes.length < 2 ||
      selectedIds.size !== path.nodes.length
    ) {
      return []
    }
    return [path.id]
  })
}

// A single on-curve node on a closed contour that is not already its start.
function getSelectedStartPointTarget({
  activeEditorGlyphId,
  fontData,
  selectedLayerId,
  selectedNodeIds,
}: {
  activeEditorGlyphId: string | null
  fontData: FontData | null
  selectedLayerId: string | null
  selectedNodeIds: string[]
}): { pathId: string; nodeId: string } | null {
  if (!fontData || !activeEditorGlyphId || selectedNodeIds.length !== 1) {
    return null
  }

  const glyph = fontData.glyphs[activeEditorGlyphId]
  const activeLayer = glyph ? getGlyphLayer(glyph, selectedLayerId) : null
  if (!activeLayer) {
    return null
  }

  const [pathId, nodeId] = selectedNodeIds[0].split(':')
  if (!pathId || !nodeId) {
    return null
  }

  const path = activeLayer.paths.find((candidate) => candidate.id === pathId)
  if (!path || !path.closed) {
    return null
  }

  const index = path.nodes.findIndex((node) => node.id === nodeId)
  if (index <= 0) {
    // Not found, or already the start point.
    return null
  }

  const node = path.nodes[index]
  if (isOffCurveNode(node)) {
    return null
  }

  return { pathId, nodeId }
}
