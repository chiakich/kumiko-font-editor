import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react'
import { ArrowRight } from 'iconoir-react'
import { useTranslation } from 'react-i18next'
import type { OverviewCustomFilterPreset } from 'src/lib/glyph/glyphOverview'
import { getPresetSummary } from 'src/features/fontOverview/components/OverviewCustomFilterModal/filterModel'

interface PresetFilterListProps {
  onCreatePreset: (preset: OverviewCustomFilterPreset) => void
  presets: OverviewCustomFilterPreset[]
}

export function PresetFilterList({
  onCreatePreset,
  presets,
}: PresetFilterListProps) {
  return (
    <VStack align="stretch" overflow="visible" gap={1}>
      {presets.map((preset) => (
        <PresetFilterButton
          key={preset.id}
          preset={preset}
          onCreatePreset={onCreatePreset}
        />
      ))}
    </VStack>
  )
}

function PresetFilterButton({
  onCreatePreset,
  preset,
}: {
  onCreatePreset: (preset: OverviewCustomFilterPreset) => void
  preset: OverviewCustomFilterPreset
}) {
  const { t } = useTranslation()

  return (
    <Button
      alignItems="stretch"
      bg="transparent"
      borderRadius="sm"
      className="group"
      color="field.ink"
      h="58px"
      justifyContent="flex-start"
      overflow="visible"
      px={3}
      py={2}
      position="relative"
      textAlign="left"
      variant="ghost"
      whiteSpace="normal"
      _active={{
        bg: 'transparent',
        color: 'field.ink',
      }}
      _focusVisible={{
        boxShadow: '0 0 0 2px var(--chakra-colors-field-ink)',
      }}
      _hover={{
        bg: 'transparent',
        color: 'field.ink',
      }}
      onClick={() => onCreatePreset(preset)}
    >
      <PresetHoverBackground />
      <HStack align="center" flex={1} minW={0} gap={4} w="100%" zIndex={1}>
        <PresetTitle>{t(preset.labelKey)}</PresetTitle>
        <PresetSummary>{getPresetSummary(preset, t)}</PresetSummary>
        <PresetArrow />
      </HStack>
    </Button>
  )
}

function PresetHoverBackground() {
  return (
    <Box
      bg="transparent"
      borderRadius="sm"
      inset={0}
      pointerEvents="none"
      position="absolute"
      transform="scaleY(1)"
      transformOrigin="center"
      transition="background-color 160ms ease, transform 180ms ease"
      zIndex={0}
      _groupHover={{
        bg: 'field.panelMuted',
        transform: 'scaleY(1.28)',
      }}
    />
  )
}

function PresetTitle({ children }: { children: string }) {
  return (
    <Text
      flexShrink={0}
      fontSize="md"
      fontWeight="900"
      lineHeight="1.2"
      minW={{ base: '96px', md: '132px' }}
    >
      {children}
    </Text>
  )
}

function PresetSummary({ children }: { children: string }) {
  return (
    <Text
      color="field.muted"
      flex={1}
      fontFamily="mono"
      fontSize="xs"
      fontWeight="normal"
      lineHeight="1.35"
      minW={0}
      lineClamp={1}
      overflow="hidden"
    >
      {children}
    </Text>
  )
}

function PresetArrow() {
  return (
    <Box
      color="field.muted"
      flexShrink={0}
      opacity={0.45}
      transform="scale(1)"
      transformOrigin="center"
      transition="color 180ms ease, opacity 180ms ease, transform 180ms ease"
      _groupHover={{
        color: 'field.ink',
        opacity: 1,
        transform: 'scale(1.16)',
      }}
    >
      <ArrowRight width={24} height={24} strokeWidth={2.2} />
    </Box>
  )
}
