import { Box, HStack, Portal, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GLYPHS_LABEL_COLOR_KEYS,
  GLYPHS_LABEL_COLORS,
  areKumikoColorsEqual,
  kumikoColorToCssRgba,
} from 'src/lib/color/kumikoColor'
import type { KumikoColor } from 'src/store'

export type OverviewGlyphContextMenuColor = KumikoColor | null | 'mixed'

interface OverviewGlyphContextMenuProps {
  canPaste: boolean
  position: { x: number; y: number }
  selectedColor: OverviewGlyphContextMenuColor
  onClose: () => void
  onCopy: () => void
  onDelete: () => void
  onPaste: () => void
  onSetColor: (color: KumikoColor | null) => void
}

export function OverviewGlyphContextMenu({
  canPaste,
  position,
  selectedColor,
  onClose,
  onCopy,
  onDelete,
  onPaste,
  onSetColor,
}: OverviewGlyphContextMenuProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const handlePointerDown = () => onClose()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <Portal>
      <Box
        bg="field.panel"
        border="1px solid"
        borderColor="controlBorder"
        borderRadius="6px"
        boxShadow="0 12px 32px rgba(15, 23, 42, 0.18)"
        left={`${position.x}px`}
        overflow="hidden"
        position="fixed"
        py="4px"
        top={`${position.y}px`}
        w="168px"
        zIndex="popover"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ContextMenuButton onClick={onCopy}>
          {t('editor.copy')}
        </ContextMenuButton>
        <ContextMenuButton isDisabled={!canPaste} onClick={onPaste}>
          {t('editor.paste')}
        </ContextMenuButton>
        <Box h="1px" my="4px" bg="field.panelMuted" />
        <Box px="12px" py="7px">
          <Text color="field.muted" fontSize="11px" fontWeight="700" mb="8px">
            {t('glyphInspector.colorLabel')}
          </Text>
          <HStack flexWrap="wrap" gap="3px">
            <GlyphColorButton
              color={null}
              isSelected={selectedColor === null}
              label={t('glyphInspector.colorLabels.none')}
              onClick={() => onSetColor(null)}
            />
            {GLYPHS_LABEL_COLORS.map((color, colorIndex) => {
              const colorKey = GLYPHS_LABEL_COLOR_KEYS[colorIndex]
              const label = t(`glyphInspector.colorLabels.${colorKey}`)

              return (
                <GlyphColorButton
                  key={colorKey}
                  color={color}
                  isSelected={
                    selectedColor !== 'mixed' &&
                    areKumikoColorsEqual(selectedColor, color)
                  }
                  label={label}
                  onClick={() => onSetColor(color)}
                />
              )
            })}
          </HStack>
        </Box>
        <Box h="1px" my="4px" bg="field.panelMuted" />
        <ContextMenuButton tone="danger" onClick={onDelete}>
          {t('editor.delete')}
        </ContextMenuButton>
      </Box>
    </Portal>
  )
}

function ContextMenuButton({
  children,
  isDisabled = false,
  onClick,
  tone = 'default',
}: {
  children: ReactNode
  isDisabled?: boolean
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <Box
      color={
        isDisabled ? 'field.haze' : tone === 'danger' ? 'red.600' : 'field.ink'
      }
      cursor={isDisabled ? 'default' : 'pointer'}
      display="block"
      fontSize="13px"
      px="12px"
      py="8px"
      textAlign="left"
      w="100%"
      _hover={
        isDisabled
          ? undefined
          : { bg: tone === 'danger' ? 'red.50' : 'gray.50' }
      }
      asChild
    >
      <button
        disabled={isDisabled}
        type="button"
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

function GlyphColorButton({
  color,
  isSelected,
  label,
  onClick,
}: {
  color: KumikoColor | null
  isSelected: boolean
  label: string
  onClick: () => void
}) {
  const swatchSize = isSelected ? '18px' : '15px'

  return (
    <Tooltip content={label}>
      <Box
        alignItems="center"
        aria-label={label}
        aria-pressed={isSelected}
        borderRadius="full"
        display="flex"
        h="22px"
        justifyContent="center"
        title={label}
        w="22px"
        _hover={{ bg: 'field.panelMuted' }}
        asChild
      >
        <button type="button" onClick={onClick}>
          {color ? (
            <Box
              bg={kumikoColorToCssRgba(color)}
              border={isSelected ? '1px solid' : 'none'}
              borderColor="field.ink"
              borderRadius="full"
              boxShadow={
                isSelected ? undefined : 'inset 0 0 0 1px rgba(8, 11, 13, 0.18)'
              }
              h={swatchSize}
              w={swatchSize}
            />
          ) : (
            <Box
              alignItems="center"
              border="1px solid"
              borderColor={isSelected ? 'field.ink' : 'field.gray.300'}
              borderRadius="full"
              display="flex"
              h={swatchSize}
              justifyContent="center"
              w={swatchSize}
            >
              <Box
                bg="field.gray.400"
                h="2px"
                transform="rotate(-45deg)"
                w="11px"
              />
            </Box>
          )}
        </button>
      </Box>
    </Tooltip>
  )
}
