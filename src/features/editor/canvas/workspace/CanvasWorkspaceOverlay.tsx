import { Box, Flex, HStack } from '@chakra-ui/react'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'
import { AVAILABLE_TOOLS } from 'src/features/editor/canvas/workspace/types'
import { HistoryButton } from 'src/features/editor/canvas/workspace/HistoryButton'
import { ToolButton } from 'src/features/editor/canvas/workspace/ToolButton'

interface CanvasWorkspaceOverlayProps {
  activeToolId: ToolId
  canRedo: boolean
  canUndo: boolean
  onRedo: () => void
  onSelectTool: (toolId: ToolId) => void
  onUndo: () => void
}

export function CanvasWorkspaceOverlay({
  activeToolId,
  canRedo,
  canUndo,
  onRedo,
  onSelectTool,
  onUndo,
}: CanvasWorkspaceOverlayProps) {
  return (
    <>
      <Flex
        position="absolute"
        left="50%"
        bottom={4}
        transform="translateX(-50%)"
        align="center"
        gap={2}
        px={2}
        py={2}
        borderRadius="sm"
        bg="rgba(8, 11, 13, 0.9)"
        border="1px solid"
        borderColor="rgba(247, 235, 64, 0.58)"
        backdropFilter="blur(10px)"
        boxShadow="none"
      >
        <HStack spacing={1}>
          <HistoryButton action="undo" isDisabled={!canUndo} onClick={onUndo} />
          <HistoryButton action="redo" isDisabled={!canRedo} onClick={onRedo} />
        </HStack>

        <Box h={6} w="1px" bg="whiteAlpha.300" />

        <HStack spacing={1} align="center">
          {AVAILABLE_TOOLS.map((tool) => (
            <ToolButton
              key={tool.id}
              isActive={activeToolId === tool.id}
              label={tool.label}
              shortcut={tool.shortcut}
              status={tool.status}
              toolId={tool.id}
              onSelect={onSelectTool}
            />
          ))}
        </HStack>
      </Flex>
    </>
  )
}
