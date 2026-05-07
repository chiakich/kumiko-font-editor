import { Box, Heading, HStack, Stack, Tag, Text } from '@chakra-ui/react'
import { useCallback, useMemo, type MouseEvent } from 'react'
import {
  VirtuosoGrid,
  type GridStateSnapshot,
  type ListRange,
  type VirtuosoGridHandle,
} from 'react-virtuoso'
import { GlyphCard } from 'src/features/fontOverview/GlyphCard'
import {
  OverviewGridItem,
  OverviewGridList,
} from 'src/features/fontOverview/OverviewGridComponents'
import type { GlyphData } from 'src/store'

interface OverviewSection {
  id: string
  label: string
  glyphs: GlyphData[]
}

interface OverviewContentProps {
  activeSection: OverviewSection
  glyphMap: Record<string, GlyphData>
  gridRef: React.RefObject<VirtuosoGridHandle | null>
  restoreSnapshot: GridStateSnapshot | null
  selectedGlyphIds: Set<string>
  topGlyphId: string | null
  visibleSections: OverviewSection[]
  onEnterEditor: (glyphId: string) => void
  onGridStateChange: (state: GridStateSnapshot) => void
  onRangeChange: (range: ListRange) => void
  onSelectGlyph: (glyphId: string, event: MouseEvent) => void
}

export function OverviewContent({
  activeSection,
  glyphMap,
  gridRef,
  restoreSnapshot,
  selectedGlyphIds,
  topGlyphId,
  visibleSections,
  onEnterEditor,
  onGridStateChange,
  onRangeChange,
  onSelectGlyph,
}: OverviewContentProps) {
  const gridComponents = useMemo(
    () => ({
      List: OverviewGridList,
      Item: OverviewGridItem,
    }),
    []
  )

  const getItemKey = useCallback(
    (index: number) => activeSection.glyphs[index]?.id ?? index,
    [activeSection.glyphs]
  )
  const restoreTopIndex = useMemo(
    () =>
      topGlyphId
        ? activeSection.glyphs.findIndex((glyph) => glyph.id === topGlyphId)
        : -1,
    [activeSection.glyphs, topGlyphId]
  )

  const handleReadyStateChange = useCallback(
    (ready: boolean) => {
      if (!ready || restoreTopIndex < 0) {
        return
      }

      gridRef.current?.scrollToIndex({
        index: restoreTopIndex,
        align: 'start',
      })
    },
    [gridRef, restoreTopIndex]
  )

  return (
    <Box
      h="100%"
      overflow="auto"
      p={5}
      bg="field.paper"
      backgroundImage="var(--field-plus-pattern)"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <Stack spacing={5}>
        <Box>
          <Text
            fontSize="10px"
            color="field.muted"
            fontFamily="mono"
            fontWeight="900"
            letterSpacing="0.16em"
          >
            GLYPH INDEX / TOTAL FIELD
          </Text>
          <Heading
            color="field.ink"
            fontSize="52px"
            lineHeight="0.86"
            letterSpacing="0"
          >
            字符總覽
          </Heading>
          <Text fontSize="sm" color="field.muted" mt={2}>
            單擊查看資訊，雙擊進入字符編輯器
          </Text>
        </Box>

        {visibleSections.length === 0 ? (
          <Box p={10} bg="field.panel" borderRadius="sm">
            <Text color="field.muted">目前沒有符合條件的字符。</Text>
          </Box>
        ) : (
          <Box
            p={4}
            bg="field.panel"
            borderRadius="sm"
            h="calc(100vh - 140px)"
            display="flex"
            flexDirection="column"
          >
            <HStack justify="space-between" mb={4}>
              <Heading size="sm" color="field.ink" textTransform="uppercase">
                {activeSection.label}
              </Heading>
              <Tag size="sm" variant="subtle">
                {activeSection.glyphs.length}
              </Tag>
            </HStack>

            <Box flex={1} minH={0}>
              <VirtuosoGrid
                ref={gridRef}
                style={{ height: '100%', width: '100%' }}
                totalCount={activeSection.glyphs.length}
                computeItemKey={getItemKey}
                initialTopMostItemIndex={
                  restoreTopIndex >= 0
                    ? { index: restoreTopIndex, align: 'start' }
                    : { index: 0, align: 'start' }
                }
                restoreStateFrom={restoreSnapshot}
                rangeChanged={onRangeChange}
                readyStateChanged={handleReadyStateChange}
                stateChanged={onGridStateChange}
                increaseViewportBy={{ top: 800, bottom: 1000 }}
                components={gridComponents}
                itemContent={(index) => {
                  const glyph = activeSection.glyphs[index]
                  return (
                    <GlyphCard
                      glyph={glyph}
                      glyphMap={glyphMap}
                      isSelected={selectedGlyphIds.has(glyph.id)}
                      onEnterEditor={onEnterEditor}
                      onSelectGlyph={onSelectGlyph}
                    />
                  )
                }}
              />
            </Box>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
