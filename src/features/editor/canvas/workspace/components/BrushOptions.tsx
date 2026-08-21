import { Box, Button, Flex, HStack, Slider, Text } from '@chakra-ui/react'
import { Circle, DesignNib, Square } from 'iconoir-react'
import { useTranslation } from 'react-i18next'
import type {
  BrushSettings,
  BrushStyle,
} from 'src/features/editor/tools/vectorBrush'

interface BrushOptionsProps {
  settings: BrushSettings
  onChange: (settings: Partial<BrushSettings>) => void
}

export function BrushOptions({ settings, onChange }: BrushOptionsProps) {
  const { t } = useTranslation()
  const styles: Array<{
    id: BrushStyle
    label: string
    icon: typeof Circle
  }> = [
    { id: 'round', label: t('editor.brushRound'), icon: Circle },
    { id: 'marker', label: t('editor.brushMarker'), icon: Square },
    { id: 'calligraphy', label: t('editor.brushCalligraphy'), icon: DesignNib },
  ]

  return (
    <Flex
      position="absolute"
      left="50%"
      bottom={16}
      transform="translate(-50%, calc(-100% - 8px))"
      align="center"
      gap={3}
      px={3}
      py={2}
      borderRadius="sm"
      bg="rgba(8, 11, 13, 0.9)"
      border="1px solid"
      borderColor="rgba(247, 235, 64, 0.58)"
      backdropFilter="blur(10px)"
      boxShadow="none"
    >
      <Text color="whiteAlpha.800" fontSize="xs" fontWeight="600">
        {t('editor.brushOptions')}
      </Text>
      <HStack gap={1}>
        {styles.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            size="xs"
            minW={8}
            h={8}
            px={0}
            borderRadius="sm"
            variant={settings.style === id ? 'solid' : 'ghost'}
            color={settings.style === id ? undefined : 'whiteAlpha.900'}
            aria-label={label}
            title={label}
            onClick={() => onChange({ style: id })}
          >
            <Icon width={17} height={17} strokeWidth={1.8} aria-hidden="true" />
          </Button>
        ))}
      </HStack>
      <Box h={6} w="1px" bg="whiteAlpha.300" />
      <HStack gap={2} minW="154px">
        <Text color="whiteAlpha.800" fontSize="xs" whiteSpace="nowrap">
          {t('editor.brushSize')}
        </Text>
        <Slider.Root
          flex="1"
          min={20}
          max={240}
          step={5}
          value={[settings.size]}
          aria-label={[t('editor.brushSize')]}
          onValueChange={(details) =>
            onChange({ size: details.value[0] ?? settings.size })
          }
        >
          <Slider.Control>
            <Slider.Track bg="whiteAlpha.300">
              <Slider.Range bg="primary" />
            </Slider.Track>
            <Slider.Thumb index={0} boxSize={3} />
          </Slider.Control>
        </Slider.Root>
        <Text color="whiteAlpha.800" fontFamily="mono" fontSize="xs" w={7}>
          {settings.size}
        </Text>
      </HStack>
      <Button
        size="xs"
        h={8}
        variant={settings.pressureEnabled ? 'solid' : 'ghost'}
        color={settings.pressureEnabled ? undefined : 'whiteAlpha.900'}
        onClick={() => onChange({ pressureEnabled: !settings.pressureEnabled })}
      >
        {t('editor.brushPressure')}
      </Button>
    </Flex>
  )
}
