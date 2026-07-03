import { Box, Button, HStack, Menu, Text, Portal } from '@chakra-ui/react'
import { useMemo } from 'react'
import { useStore, type FontSource } from 'src/store'

const locationLabel = (source: FontSource) =>
  Object.entries(source.location)
    .map(([axis, value]) => `${axis} ${value}`)
    .join('  ')

// Font-wide master selector for the overview (the editor uses the layer panel).
// A single truncating dropdown so long, custom source names never break layout.
export function MasterSwitcher() {
  const sources = useStore((state) => state.fontData?.sources)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const selectedGlyphLayers = useStore((state) =>
    selectedGlyphId
      ? state.fontData?.glyphs[selectedGlyphId]?.layers
      : undefined
  )
  const setActiveMasterId = useStore((state) => state.setActiveMasterId)

  const sourceList = useMemo(() => Object.values(sources ?? {}), [sources])

  if (sourceList.length <= 1) {
    return null
  }

  const currentId = activeMasterId ?? sourceList[0]?.id ?? null
  const current = sourceList.find((source) => source.id === currentId)
  const isSparse = (id: string) =>
    Boolean(selectedGlyphId) &&
    Boolean(selectedGlyphLayers) &&
    !selectedGlyphLayers?.[id]

  return (
    <Menu.Root
      positioning={{
        placement: 'bottom-end',
      }}
    >
      <Menu.Trigger asChild>
        <Button
          size="sm"
          variant="outline"
          minW="120px"
          maxW="220px"
          fontWeight="500"
        >
          <Text lineClamp={1} textAlign="left">
            {current?.name ?? '—'}
          </Text>
          <Box as="span" fontSize="9px" opacity={0.6}>
            ▼
          </Box>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {sourceList.map((source) => (
              <Menu.Item
                key={source.id}
                bg={source.id === currentId ? 'yellow.100' : undefined}
                onSelect={() => setActiveMasterId(source.id)}
                value="item-0"
              >
                <HStack w="100%" justify="space-between" gap={4}>
                  <Text
                    lineClamp={1}
                    fontWeight={source.id === currentId ? '700' : '400'}
                  >
                    {source.name}
                    {isSparse(source.id) ? ' +' : ''}
                  </Text>
                  <Text fontSize="xs" color="mutedForeground" flexShrink={0}>
                    {locationLabel(source)}
                  </Text>
                </HStack>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
