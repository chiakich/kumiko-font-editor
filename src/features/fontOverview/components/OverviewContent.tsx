import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  Stack,
  Tag,
  Text,
  Tooltip,
} from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { Minus, Plus } from 'iconoir-react'
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
import { useGlyphColorLabelDisplayMode } from 'src/lib/preferences/appPreferences'
import type { GlyphData } from 'src/store'
import { useTranslation } from 'react-i18next'
import type { OverviewGridZoomLayout } from 'src/features/fontOverview/utils/overviewGridZoom'

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
  zoomLayout: OverviewGridZoomLayout
  zoomSizeInputValue: string
  canZoomIn: boolean
  canZoomOut: boolean
  onEnterEditor: (glyphId: string) => void
  onOpenAddGlyphModal: () => void
  onGridStateChange: (state: GridStateSnapshot) => void
  onZoomSizeInputBlur: () => void
  onZoomSizeInputChange: (value: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
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
  zoomLayout,
  zoomSizeInputValue,
  canZoomIn,
  canZoomOut,
  onEnterEditor,
  onOpenAddGlyphModal,
  onGridStateChange,
  onZoomSizeInputBlur,
  onZoomSizeInputChange,
  onZoomIn,
  onZoomOut,
  onRangeChange,
  onSelectGlyph,
}: OverviewContentProps) {
  const { t } = useTranslation()
  const glyphColorLabelDisplayMode = useGlyphColorLabelDisplayMode()

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
      overflow="hidden"
      position="relative"
      bg="field.paper"
      backgroundImage="var(--field-plus-pattern)"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <Box h="100%" overflow="auto" p={5}>
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

              <Box
                flex={1}
                minH={0}
                sx={{
                  '--overview-card-min-width': `${zoomLayout.cardMinWidth}px`,
                  '--overview-grid-gap': `${zoomLayout.gap}px`,
                }}
              >
                <VirtuosoGrid
                  key={zoomLayout.id}
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
                        cardHeight={zoomLayout.cardHeight}
                        previewHeight={zoomLayout.previewHeight}
                        showGlyphName={zoomLayout.showGlyphName}
                        colorLabelDisplayMode={glyphColorLabelDisplayMode}
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

      <HStack
        position="absolute"
        right={5}
        bottom={5}
        zIndex={2}
        spacing={1}
        p={1}
        bg="field.panel"
        border="1px solid"
        borderColor="field.line"
        borderRadius="sm"
        boxShadow="floating"
      >
        <Tooltip label={t('fontOverview.zoomOut')}>
          <IconButton
            aria-label={t('fontOverview.zoomOut')}
            icon={<Minus width={16} height={16} aria-hidden="true" />}
            isDisabled={!canZoomOut}
            size="sm"
            variant="ghost"
            onClick={onZoomOut}
          />
        </Tooltip>
        <Input
          aria-label={t('fontOverview.zoomSize')}
          value={zoomSizeInputValue}
          type="text"
          inputMode="decimal"
          w="76px"
          h={8}
          px={2}
          textAlign="center"
          fontFamily="mono"
          fontSize="xs"
          fontWeight="900"
          onBlur={onZoomSizeInputBlur}
          onChange={(event) => onZoomSizeInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
        <Tooltip label={t('fontOverview.zoomIn')}>
          <IconButton
            aria-label={t('fontOverview.zoomIn')}
            icon={<Plus width={16} height={16} aria-hidden="true" />}
            isDisabled={!canZoomIn}
            size="sm"
            variant="ghost"
            onClick={onZoomIn}
          />
        </Tooltip>
      </HStack>
    </Box>
  )
}
