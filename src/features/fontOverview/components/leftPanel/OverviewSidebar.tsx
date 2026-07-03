import {
  Box,
  Button,
  Heading,
  HStack,
  Text,
  VStack,
  Separator,
} from '@chakra-ui/react'
import type { GlyphOverviewTreeNode } from 'src/lib/glyph/glyphOverview'
import { OverviewSearchInput } from 'src/features/fontOverview/components/leftPanel/OverviewSearchInput'
import { OverviewTreeNav } from 'src/features/fontOverview/components/leftPanel/OverviewTreeNav'
import type { OverviewSearchOptionsState } from 'src/store'
import { useTranslation } from 'react-i18next'

interface OverviewSidebarProps {
  currentSearchQuery: string
  isClosingProject: boolean
  overviewSearchOptions: OverviewSearchOptionsState
  projectTitle: string
  selectedSectionId: string
  totalGlyphCount: number
  treeNodes: GlyphOverviewTreeNode[]
  visibleGlyphCount: number
  onCloseProject: () => void
  onSearchQueryChange: (value: string) => void
  onSearchOptionsChange: (options: Partial<OverviewSearchOptionsState>) => void
  onSectionSelect: (sectionId: string) => void
}

export function OverviewSidebar({
  currentSearchQuery,
  isClosingProject,
  overviewSearchOptions,
  projectTitle,
  selectedSectionId,
  totalGlyphCount,
  treeNodes,
  visibleGlyphCount,
  onCloseProject,
  onSearchQueryChange,
  onSearchOptionsChange,
  onSectionSelect,
}: OverviewSidebarProps) {
  const { t } = useTranslation()

  return (
    <Box
      p={4}
      h="100%"
      display="flex"
      flexDirection="column"
      bg="background"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <VStack align="stretch" gap={3} mb={4}>
        <HStack justify="space-between" align="flex-start">
          <Box>
            <Text
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="0.16em"
              color="mutedForeground"
              mb={1}
              fontFamily="mono"
              fontWeight="900"
            >
              {t('fontOverview.kumikoFontEditor')}
            </Text>
            <Heading
              color="foreground"
              fontSize="28px"
              lineHeight="0.98"
              letterSpacing="0"
            >
              {t('fontOverview.glyphOverview')}
            </Heading>
            <Text fontSize="sm" color="mutedForeground" mt={2} lineClamp={2}>
              {projectTitle}
            </Text>
          </Box>
          <Button
            size="sm"
            variant="ghost"
            loading={isClosingProject}
            loadingText={t('fontOverview.saving')}
            onClick={onCloseProject}
          >
            {t('fontOverview.backHome')}
          </Button>
        </HStack>

        <OverviewSearchInput
          currentSearchQuery={currentSearchQuery}
          overviewSearchOptions={overviewSearchOptions}
          onSearchOptionsChange={onSearchOptionsChange}
          onSearchQueryChange={onSearchQueryChange}
        />

        <Text fontSize="sm" color="mutedForeground" fontFamily="mono">
          {t('fontOverview.visibleTotalCount', {
            total: totalGlyphCount.toLocaleString(),
            visible: visibleGlyphCount.toLocaleString(),
          })}
        </Text>
      </VStack>
      <Separator mb={4} borderColor="haze" opacity={0.55} />
      <Box flex={1} minH={0} bg="card" borderRadius="sm" overflow="auto" p={2}>
        <OverviewTreeNav
          nodes={treeNodes}
          selectedSectionId={selectedSectionId}
          onSectionSelect={onSectionSelect}
        />
      </Box>
    </Box>
  )
}
