import { Box } from '@chakra-ui/react'
import { useCallback, useMemo, type ReactNode } from 'react'
import {
  getGlyphLayer,
  type FontData,
  type SelectedSegmentState,
} from 'src/store'

interface CanvasContextMenuProps {
  activeEditorGlyphId: string | null
  copySelection: () => Promise<void>
  cutSelection: () => Promise<void>
  fontData: FontData | null
  pasteSelection: () => Promise<void>
  position: { x: number; y: number }
  reconnectSelectedNodes: (glyphId: string, selectedNodeIds: string[]) => void
  reversePaths: (glyphId: string, pathIds: string[]) => void
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
  selectedLayerId,
  selectedNodeIds,
  selectedSegment,
  onClose,
  onRequestCanvasUpdate,
}: CanvasContextMenuProps) {
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
      bg="white"
      border="1px solid"
      borderColor="gray.200"
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
        複製
      </ContextMenuButton>
      <ContextMenuButton
        isDisabled={selectedNodeIds.length === 0}
        onClick={handleCutSelection}
      >
        剪下
      </ContextMenuButton>
      <ContextMenuButton onClick={handlePasteSelection}>貼上</ContextMenuButton>
      <Box h="1px" my="4px" bg="gray.100" />
      <ContextMenuButton
        isDisabled={selectedReversiblePathIds.length === 0}
        onClick={handleReverseSelectedPaths}
      >
        逆轉選取外框的方向
      </ContextMenuButton>
      <ContextMenuButton
        isDisabled={selectedNodeIds.length < 2}
        onClick={handleReconnectSelectedNodes}
      >
        重新連接控制點
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
      as="button"
      type="button"
      display="block"
      w="100%"
      px="12px"
      py="8px"
      textAlign="left"
      fontSize="13px"
      color={isDisabled ? 'gray.400' : 'gray.800'}
      cursor={isDisabled ? 'default' : 'pointer'}
      disabled={isDisabled}
      _hover={isDisabled ? undefined : { bg: 'gray.50' }}
      onClick={() => {
        if (!isDisabled) {
          onClick()
        }
      }}
    >
      {children}
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
