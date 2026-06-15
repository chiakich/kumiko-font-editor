import { Box, Button, HStack, Spinner, Text, VStack } from '@chakra-ui/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { GlyphwikiPartBox } from 'src/lib/glyph/glyphwikiComposition'

interface ComponentSearchSectionProps {
  components: string[]
  loading: boolean
  selectedComponent: string | null
  // Where each component sits inside the target character (200x200 canvas);
  // components may appear at several positions (e.g. 林 = 木 + 木).
  partBoxesByComponent?: Map<string, GlyphwikiPartBox[]>
  onSelectComponent: (component: string) => void
}

function PartPositionIndicator({
  boxes,
  isSelected,
}: {
  boxes: GlyphwikiPartBox[]
  isSelected: boolean
}) {
  return (
    <Box
      as="svg"
      viewBox="0 0 200 200"
      width="14px"
      height="14px"
      flexShrink={0}
      aria-hidden
    >
      <rect
        x={4}
        y={4}
        width={192}
        height={192}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={14}
      />
      {boxes.map((box, index) => (
        <rect
          key={index}
          x={box.x1}
          y={box.y1}
          width={Math.max(8, box.x2 - box.x1)}
          height={Math.max(8, box.y2 - box.y1)}
          fill="currentColor"
          fillOpacity={isSelected ? 0.9 : 0.55}
        />
      ))}
    </Box>
  )
}

export function ComponentSearchSection({
  components,
  loading,
  selectedComponent,
  partBoxesByComponent,
  onSelectComponent,
}: ComponentSearchSectionProps) {
  const { t } = useTranslation()

  // Components with a known position come first; the rest are visually
  // de-emphasized since they can't be auto-placed.
  const orderedComponents = useMemo(() => {
    if (!partBoxesByComponent?.size) {
      return components
    }
    return [
      ...components.filter((component) => partBoxesByComponent.has(component)),
      ...components.filter((component) => !partBoxesByComponent.has(component)),
    ]
  }, [components, partBoxesByComponent])

  return (
    <VStack align="stretch" spacing={2}>
      <Text fontSize="sm" color="field.muted" fontFamily="mono">
        {t('editor.decompositionComponents')}
      </Text>
      <HStack spacing={2} flexWrap="wrap">
        {loading && components.length === 0 ? (
          <HStack spacing={2}>
            <Spinner size="sm" color="field.yellow.400" />
            <Text fontSize="sm" color="field.muted">
              {t('editor.analyzing')}
            </Text>
          </HStack>
        ) : orderedComponents.length > 0 ? (
          orderedComponents.map((component) => {
            const boxes = partBoxesByComponent?.get(component)
            const isSelected = component === selectedComponent
            return (
              <Button
                key={component}
                size="sm"
                variant={isSelected ? 'solid' : 'outline'}
                fontFamily="glyph"
                opacity={boxes?.length || isSelected ? 1 : 0.55}
                onClick={() => onSelectComponent(component)}
                leftIcon={
                  boxes?.length ? (
                    <PartPositionIndicator
                      boxes={boxes}
                      isSelected={isSelected}
                    />
                  ) : undefined
                }
              >
                {component}
              </Button>
            )
          })
        ) : (
          <Text fontSize="sm" color="field.muted">
            {t('editor.noComponentsAvailable')}
          </Text>
        )}
      </HStack>
    </VStack>
  )
}
