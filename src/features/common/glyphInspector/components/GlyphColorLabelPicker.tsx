import { Box, Flex, IconButton, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import {
  GLYPHS_LABEL_COLOR_KEYS,
  GLYPHS_LABEL_COLORS,
  areKumikoColorsEqual,
  kumikoColorToCssRgba,
} from 'src/lib/color/kumikoColor'
import type { KumikoColor } from 'src/store'
import { useTranslation } from 'react-i18next'

interface GlyphColorLabelPickerProps {
  value?: KumikoColor | null
  onChange: (color: KumikoColor | null) => void
}

export function GlyphColorLabelPicker({
  value,
  onChange,
}: GlyphColorLabelPickerProps) {
  const { t } = useTranslation()
  const hasNoColor = !value

  return (
    <Box>
      <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
        {t('glyphInspector.colorLabel')}
      </Text>
      <Flex gap="5px" wrap="wrap">
        <Tooltip content={t('glyphInspector.colorLabels.none')}>
          <IconButton
            aria-label={t('glyphInspector.colorLabels.none')}
            aria-pressed={hasNoColor}
            boxSize="15px"
            minW="15px"
            p={0}
            borderRadius="full"
            variant="ghost"
            bg="transparent"
            border="none"
            _hover={{ bg: 'transparent' }}
            onClick={() => onChange(null)}
          >
            <Box
              h={hasNoColor ? '14px' : '12px'}
              w={hasNoColor ? '14px' : '12px'}
              borderRadius="full"
              border="1px solid"
              borderColor={hasNoColor ? 'field.ink' : 'field.gray.300'}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Box
                h="2px"
                w={hasNoColor ? '9px' : '8px'}
                bg="field.gray.400"
                transform="rotate(-45deg)"
              />
            </Box>
          </IconButton>
        </Tooltip>
        {GLYPHS_LABEL_COLORS.map((color, colorIndex) => {
          const isSelected = areKumikoColorsEqual(value, color)
          const label = t(
            `glyphInspector.colorLabels.${GLYPHS_LABEL_COLOR_KEYS[colorIndex]}`
          )
          return (
            <Tooltip key={GLYPHS_LABEL_COLOR_KEYS[colorIndex]} content={label}>
              <IconButton
                aria-label={label}
                aria-pressed={isSelected}
                boxSize="15px"
                minW="15px"
                p={0}
                borderRadius="full"
                variant="ghost"
                bg="transparent"
                border="none"
                _hover={{ bg: 'transparent' }}
                onClick={() => onChange(color)}
              >
                <Box
                  h={isSelected ? '14px' : '12px'}
                  w={isSelected ? '14px' : '12px'}
                  borderRadius="full"
                  border={isSelected ? '1px solid' : 'none'}
                  borderColor="field.ink"
                  bg={kumikoColorToCssRgba(color)}
                  opacity={isSelected ? 1 : 0.74}
                  boxShadow={
                    isSelected
                      ? 'none'
                      : 'inset 0 0 0 1px rgba(8, 11, 13, 0.18)'
                  }
                />
              </IconButton>
            </Tooltip>
          )
        })}
      </Flex>
    </Box>
  )
}
