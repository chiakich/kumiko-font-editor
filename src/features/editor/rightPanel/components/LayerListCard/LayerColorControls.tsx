import { Box, HStack, Portal, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GLYPHS_LABEL_COLOR_KEYS,
  GLYPHS_LABEL_COLORS,
  areKumikoColorsEqual,
  kumikoColorToDisplayCssRgba,
} from 'src/lib/color/kumikoColor'
import { useResolvedColorMode } from 'src/lib/preferences/colorMode'
import type { GlyphLayerData, KumikoColor } from 'src/store'

export function LayerColorDot({ color }: { color?: KumikoColor | null }) {
  const colorMode = useResolvedColorMode()

  return (
    <Box
      h="8px"
      w="8px"
      flexShrink={0}
      borderRadius="full"
      bg={kumikoColorToDisplayCssRgba(color, colorMode)}
      boxShadow={color ? 'inset 0 0 0 1px rgba(8, 11, 13, 0.2)' : undefined}
      opacity={color ? 1 : 0}
    />
  )
}

function LayerColorButton({
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
  const colorMode = useResolvedColorMode()

  return (
    <Tooltip content={label}>
      <Box
        aria-label={label}
        aria-pressed={isSelected}
        alignItems="center"
        borderRadius="full"
        display="flex"
        h="22px"
        justifyContent="center"
        title={label}
        w="22px"
        _hover={{ bg: 'muted' }}
        asChild
      >
        <button type="button" onClick={onClick}>
          {color ? (
            <Box
              h={swatchSize}
              w={swatchSize}
              borderRadius="full"
              bg={kumikoColorToDisplayCssRgba(color, colorMode)}
              border={isSelected ? '1px solid' : 'none'}
              borderColor="foreground"
              boxShadow={
                isSelected ? undefined : 'inset 0 0 0 1px rgba(8, 11, 13, 0.18)'
              }
            />
          ) : (
            <Box
              h={swatchSize}
              w={swatchSize}
              borderRadius="full"
              border="1px solid"
              borderColor={isSelected ? 'foreground' : 'gray.300'}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Box h="2px" w="11px" bg="gray.400" transform="rotate(-45deg)" />
            </Box>
          )}
        </button>
      </Box>
    </Tooltip>
  )
}

export function LayerColorContextMenu({
  layer,
  position,
  onClose,
  onSelect,
}: {
  layer: GlyphLayerData
  position: { x: number; y: number }
  onClose: () => void
  onSelect: (color: KumikoColor | null) => void
}) {
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

  const handleSelect = (color: KumikoColor | null) => {
    onSelect(color)
    onClose()
  }

  return (
    <Portal>
      <Box
        bg="card"
        border="1px solid"
        borderColor="controlBorder"
        borderRadius="6px"
        boxShadow="0 12px 32px rgba(15, 23, 42, 0.18)"
        left={`${position.x}px`}
        p="10px"
        position="fixed"
        top={`${position.y}px`}
        w="160px"
        zIndex="popover"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Text color="mutedForeground" fontSize="11px" fontWeight="700" mb="8px">
          {t('editor.layerColorLabel')}
        </Text>
        <HStack flexWrap="wrap" gap="3px">
          <LayerColorButton
            color={null}
            isSelected={!layer.color}
            label={t('glyphInspector.colorLabels.none')}
            onClick={() => handleSelect(null)}
          />
          {GLYPHS_LABEL_COLORS.map((color, colorIndex) => {
            const colorKey = GLYPHS_LABEL_COLOR_KEYS[colorIndex]
            const label = t(`glyphInspector.colorLabels.${colorKey}`)

            return (
              <LayerColorButton
                key={colorKey}
                color={color}
                isSelected={areKumikoColorsEqual(layer.color, color)}
                label={label}
                onClick={() => handleSelect(color)}
              />
            )
          })}
        </HStack>
      </Box>
    </Portal>
  )
}
