import {
  Box,
  Button,
  Heading,
  HStack,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { MasterSwitcher } from 'src/features/common/masterSwitcher/MasterSwitcher'
import {
  VirtuosoGrid,
  type GridStateSnapshot,
  type ListRange,
  type VirtuosoGridHandle,
} from 'react-virtuoso'
import { GlyphCard } from 'src/features/fontOverview/components/GlyphCard'
import {
  OverviewGridItem,
  OverviewGridList,
} from 'src/features/fontOverview/components/OverviewGridComponents'
import type { GlyphPreviewData } from 'src/lib/glyph/glyphPreviewData'
import type { GlyphData } from 'src/store'
import { useTranslation } from 'react-i18next'

interface OverviewSection {
  id: string
  label: string
  glyphs: GlyphData[]
}

interface OverviewContentProps {
  activeSection: OverviewSection
  gridRef: React.RefObject<VirtuosoGridHandle | null>
  glyphMap: Record<string, GlyphData>
  glyphPreviews: Record<string, GlyphPreviewData>
  restoreSnapshot: GridStateSnapshot | null
  selectedGlyphIds: Set<string>
  topGlyphId: string | null
  transitioningGlyphId?: string | null
  visibleSections: OverviewSection[]
  onEnterEditor: (glyphId: string) => void
  onOpenAddGlyphModal: () => void
  onGridStateChange: (state: GridStateSnapshot) => void
  onRangeChange: (range: ListRange) => void
  onSelectGlyph: (glyphId: string, event: MouseEvent) => void
}

export function OverviewContent({
  activeSection,
  gridRef,
  glyphMap,
  glyphPreviews,
  restoreSnapshot,
  selectedGlyphIds,
  topGlyphId,
  transitioningGlyphId,
  visibleSections,
  onEnterEditor,
  onOpenAddGlyphModal,
  onGridStateChange,
  onRangeChange,
  onSelectGlyph,
}: OverviewContentProps) {
  const { t } = useTranslation()

  const gridComponents = useMemo(
    () => ({
      List: OverviewGridList,
      Item: OverviewGridItem,
    }),
    []
  )
  const restoreFrameRef = useRef<number | null>(null)
  const restoredSnapshotRef = useRef<GridStateSnapshot | null>(null)

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
  useEffect(
    () => () => {
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current)
        restoreFrameRef.current = null
      }
    },
    []
  )

  const cancelPendingRestore = useCallback(() => {
    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }
  }, [])

  useEffect(() => {
    restoredSnapshotRef.current = null
  }, [restoreSnapshot])

  const handleReadyStateChange = useCallback(
    (ready: boolean) => {
      if (!ready) {
        return
      }

      if (restoreSnapshot && restoredSnapshotRef.current !== restoreSnapshot) {
        restoredSnapshotRef.current = restoreSnapshot
        cancelPendingRestore()
        restoreFrameRef.current = window.requestAnimationFrame(() => {
          restoreFrameRef.current = null
          gridRef.current?.scrollTo({
            top: restoreSnapshot.scrollTop,
          })
        })
        return
      }

      if (restoreSnapshot || restoreTopIndex < 0) {
        return
      }

      cancelPendingRestore()
      gridRef.current?.scrollToIndex({
        index: restoreTopIndex,
        align: 'start',
      })
    },
    [cancelPendingRestore, gridRef, restoreSnapshot, restoreTopIndex]
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
        <HStack justify="space-between" align="flex-start" spacing={4}>
          <Box>
            <Text
              fontSize="10px"
              color="field.muted"
              fontFamily="mono"
              fontWeight="900"
              letterSpacing="0.16em"
            >
              {t('fontOverview.glyphIndexTotalField')}
            </Text>
            <Heading
              color="field.ink"
              fontSize="52px"
              lineHeight="0.86"
              letterSpacing="0"
            >
              {t('fontOverview.glyphOverview')}
            </Heading>
            <Text fontSize="sm" color="field.muted" mt={2}>
              {t('fontOverview.glyphCardHint')}
            </Text>
          </Box>
          <HStack spacing={3} flexShrink={0} align="center">
            <MasterSwitcher />
            <Button
              size="sm"
              flexShrink={0}
              variant="solid"
              fontWeight="900"
              _hover={{ bg: 'field.yellow.200' }}
              _active={{ bg: 'field.yellow.400' }}
              onClick={onOpenAddGlyphModal}
            >
              {t('fontOverview.addGlyphButton')}
            </Button>
          </HStack>
        </HStack>

        {visibleSections.length === 0 ? (
          <Box p={10} bg="field.panel" borderRadius="sm">
            <Text color="field.muted">
              {t('fontOverview.noMatchingGlyphs')}
            </Text>
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
                increaseViewportBy={{ top: 320, bottom: 480 }}
                components={gridComponents}
                itemContent={(index) => {
                  const glyph = activeSection.glyphs[index]
                  return (
                    <GlyphCard
                      glyph={glyph}
                      glyphMap={glyphMap}
                      preview={glyphPreviews[glyph.id] ?? null}
                      isSelected={selectedGlyphIds.has(glyph.id)}
                      isTransitioning={transitioningGlyphId === glyph.id}
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
