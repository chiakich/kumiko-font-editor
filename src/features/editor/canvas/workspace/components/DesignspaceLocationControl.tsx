import {
  Badge,
  Box,
  HStack,
  Heading,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isInterpolatedGlyphLocation } from 'src/font/designspaceLocation'
import { useStore } from 'src/store'
import {
  formatAxisDisplayValue,
  getAxisPercent,
  getAxisSourceMarkers,
  getAxisStep,
  getAxisValue,
  isAxisMarkerActive,
  snapDesignspaceLocation,
} from 'src/features/editor/canvas/workspace/utils/designspaceAxisSnapping'

export function DesignspaceLocationControl() {
  const { t } = useTranslation()
  const axes = useStore((state) => state.fontData?.axes?.axes)
  const fontData = useStore((state) => state.fontData)
  const sources = useStore((state) => state.fontData?.sources)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const editLocation = useStore((state) => state.editLocation)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const setEditLocation = useStore((state) => state.setEditLocation)
  const setDesignspaceScrubbing = useStore(
    (state) => state.setDesignspaceScrubbing
  )

  const axisList = useMemo(() => axes ?? [], [axes])
  const sourceCount = Object.keys(sources ?? {}).length

  if (axisList.length === 0 || sourceCount <= 1) {
    return null
  }

  const selectedGlyph = selectedGlyphId
    ? fontData?.glyphs[selectedGlyphId]
    : null
  const isInstancePreview =
    activeMasterId === null ||
    isInterpolatedGlyphLocation(fontData, selectedGlyph, editLocation)

  return (
    <Box
      minW={0}
      px={3}
      py={2}
      borderRadius="sm"
      bg="field.panel"
      border="1px solid"
      borderColor="transparent"
      color="field.ink"
    >
      <VStack spacing={2} align="stretch">
        <HStack justify="space-between" spacing={2}>
          <Heading size="sm" textTransform="uppercase" color="field.ink">
            {t('editor.designspace')}
          </Heading>
          {isInstancePreview ? (
            <Badge colorScheme="cyan" fontSize="2xs">
              {t('editor.instancePreview')}
            </Badge>
          ) : null}
        </HStack>
        {axisList.map((axis) => {
          const sourceMarkers = getAxisSourceMarkers(axis, sources)
          const value = getAxisValue(axis, editLocation)
          const formattedValue = formatAxisDisplayValue(axis, value)
          const preciseValue = String(value)
          const hasActiveMarker = sourceMarkers.some((marker) =>
            isAxisMarkerActive(axis, marker.value, value)
          )
          return (
            <HStack key={axis.name} spacing={3} align="center">
              <Text
                w="72px"
                minW={0}
                fontSize="xs"
                fontWeight="700"
                noOfLines={1}
              >
                {axis.label || axis.name}
              </Text>
              <Slider
                flex="1"
                min={axis.minValue}
                max={axis.maxValue}
                step={getAxisStep(axis)}
                value={value}
                aria-label={axis.label || axis.name}
                onPointerDown={() => setDesignspaceScrubbing(true)}
                onPointerCancel={() => setDesignspaceScrubbing(false)}
                onChangeStart={() => setDesignspaceScrubbing(true)}
                onChange={(nextValue) =>
                  setEditLocation(
                    snapDesignspaceLocation({
                      axes: axisList,
                      axis,
                      location: editLocation,
                      sources,
                      value: nextValue,
                    })
                  )
                }
                onChangeEnd={(nextValue) => {
                  setEditLocation(
                    snapDesignspaceLocation({
                      axes: axisList,
                      axis,
                      location: editLocation,
                      sources,
                      value: nextValue,
                    })
                  )
                  setDesignspaceScrubbing(false)
                }}
                onBlur={() => setDesignspaceScrubbing(false)}
              >
                <SliderTrack bg="blackAlpha.200" position="relative">
                  <SliderFilledTrack bg="field.yellow.400" />
                  {sourceMarkers.map((marker) => {
                    const isActive = isAxisMarkerActive(
                      axis,
                      marker.value,
                      value
                    )
                    return (
                      <Box
                        key={`${axis.name}-${marker.value}`}
                        aria-hidden="true"
                        position="absolute"
                        left={`${getAxisPercent(axis, marker.value)}%`}
                        top="50%"
                        transform="translate(-50%, -50%)"
                        w={isActive ? '3px' : '2px'}
                        h={isActive ? '16px' : '10px'}
                        borderRadius="full"
                        bg={isActive ? 'field.ink' : 'blackAlpha.500'}
                        boxShadow={
                          isActive
                            ? '0 0 0 3px var(--chakra-colors-field-yellow-200)'
                            : 'none'
                        }
                        pointerEvents="none"
                        zIndex={2}
                      />
                    )
                  })}
                </SliderTrack>
                <SliderThumb
                  boxSize={3}
                  bg={hasActiveMarker ? 'field.yellow.400' : 'white'}
                  border="1px solid"
                  borderColor={hasActiveMarker ? 'field.ink' : 'blackAlpha.300'}
                />
              </Slider>
              <Text
                w="48px"
                flexShrink={0}
                textAlign="right"
                fontSize="xs"
                fontFamily="mono"
                title={
                  formattedValue === preciseValue ? undefined : preciseValue
                }
              >
                {formattedValue}
              </Text>
            </HStack>
          )
        })}
      </VStack>
    </Box>
  )
}
