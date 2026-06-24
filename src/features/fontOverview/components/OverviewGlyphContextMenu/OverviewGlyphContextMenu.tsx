import { Box, HStack, Portal, Text, Tooltip } from '@chakra-ui/react'
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
        bg="white"
        border="1px solid"
        borderColor="gray.200"
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
        <Box h="1px" my="4px" bg="gray.100" />
        <Box px="12px" py="7px">
          <Text color="gray.600" fontSize="11px" fontWeight="700" mb="8px">
            {t('glyphInspector.colorLabel')}
          </Text>
          <HStack flexWrap="wrap" spacing="3px">
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
        <Box h="1px" my="4px" bg="gray.100" />
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
      as="button"
      color={
        isDisabled ? 'gray.400' : tone === 'danger' ? 'red.600' : 'gray.800'
      }
      cursor={isDisabled ? 'default' : 'pointer'}
      disabled={isDisabled}
      display="block"
      fontSize="13px"
      px="12px"
      py="8px"
      textAlign="left"
      type="button"
      w="100%"
      _hover={
        isDisabled
          ? undefined
          : { bg: tone === 'danger' ? 'red.50' : 'gray.50' }
      }
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
    <Tooltip label={label}>
      <Box
        alignItems="center"
        aria-label={label}
        aria-pressed={isSelected}
        as="button"
        borderRadius="full"
        display="flex"
        h="22px"
        justifyContent="center"
        title={label}
        type="button"
        w="22px"
        _hover={{ bg: 'blackAlpha.50' }}
        onClick={onClick}
      >
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
      </Box>
    </Tooltip>
  )
}
