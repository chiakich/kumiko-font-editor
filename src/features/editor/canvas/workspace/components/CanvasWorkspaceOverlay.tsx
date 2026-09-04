import { Box, Button, Flex, HStack } from '@chakra-ui/react'
import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { useTranslation } from 'react-i18next'
import type { ToolId } from '@/features/editor/canvas/workspace/types'
import { AVAILABLE_TOOLS } from '@/features/editor/canvas/workspace/types'
import { HistoryButton } from '@/features/editor/canvas/workspace/components/HistoryButton'
import { ToolButton } from '@/features/editor/canvas/workspace/components/ToolButton'
import { BrushOptions } from '@/features/editor/canvas/workspace/components/BrushOptions'
import type { BrushSettings } from '@/features/editor/tools/vectorBrush'

interface CanvasWorkspaceOverlayProps {
  activeToolId: ToolId
  brushSettings: BrushSettings
  canRedo: boolean
  canUndo: boolean
  hasNextGlyph: boolean
  hasPreviousGlyph: boolean
  nextGlyphLabel: string | null
  onNextGlyph: () => void
  onPreviousGlyph: () => void
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void
  previousGlyphLabel: string | null
  onRedo: () => void
  onSelectTool: (toolId: ToolId) => void
  onUndo: () => void
}

export function CanvasWorkspaceOverlay({
  activeToolId,
  brushSettings,
  canRedo,
  canUndo,
  hasNextGlyph,
  hasPreviousGlyph,
  nextGlyphLabel,
  onNextGlyph,
  onPreviousGlyph,
  onBrushSettingsChange,
  previousGlyphLabel,
  onRedo,
  onSelectTool,
  onUndo,
}: CanvasWorkspaceOverlayProps) {
  const { t } = useTranslation()

  return (
    <>
      {activeToolId === 'brush' ? (
        <BrushOptions
          settings={brushSettings}
          onChange={onBrushSettingsChange}
        />
      ) : null}
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
