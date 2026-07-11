import { Box, Button, Flex, HStack } from '@chakra-ui/react'
import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { useTranslation } from 'react-i18next'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'
import { AVAILABLE_TOOLS } from 'src/features/editor/canvas/workspace/types'
import { HistoryButton } from 'src/features/editor/canvas/workspace/components/HistoryButton'
import { ToolButton } from 'src/features/editor/canvas/workspace/components/ToolButton'

interface CanvasWorkspaceOverlayProps {
  activeToolId: ToolId
  canRedo: boolean
  canUndo: boolean
  hasNextGlyph: boolean
  hasPreviousGlyph: boolean
  nextGlyphLabel: string | null
  onNextGlyph: () => void
  onPreviousGlyph: () => void
  previousGlyphLabel: string | null
  onRedo: () => void
  onSelectTool: (toolId: ToolId) => void
  onUndo: () => void
}

export function CanvasWorkspaceOverlay({
  activeToolId,
  canRedo,
  canUndo,
  hasNextGlyph,
  hasPreviousGlyph,
  nextGlyphLabel,
  onNextGlyph,
  onPreviousGlyph,
  previousGlyphLabel,
  onRedo,
  onSelectTool,
  onUndo,
}: CanvasWorkspaceOverlayProps) {
  const { t } = useTranslation()

  return (
    <>
      <Button
        position="absolute"
        top={4}
        left={4}
        aria-label={t('editor.previousGlyph')}
        size="sm"
        variant="outline"
        bg="card"
        borderColor="controlBorder"
        disabled={!hasPreviousGlyph}
        onClick={onPreviousGlyph}
      >
        <NavArrowLeft width={18} height={18} aria-hidden="true" />
        {previousGlyphLabel}
      </Button>
      <Button
        position="absolute"
        top={4}
        right={4}
        aria-label={t('editor.nextGlyph')}
        size="sm"
        variant="outline"
        bg="card"
        borderColor="controlBorder"
        disabled={!hasNextGlyph}
        onClick={onNextGlyph}
      >
        {nextGlyphLabel}
        <NavArrowRight width={18} height={18} aria-hidden="true" />
      </Button>
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
        <HStack gap={1}>
          <HistoryButton action="undo" isDisabled={!canUndo} onClick={onUndo} />
          <HistoryButton action="redo" isDisabled={!canRedo} onClick={onRedo} />
        </HStack>

        <Box h={6} w="1px" bg="whiteAlpha.300" />

        <HStack gap={1} align="center">
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
