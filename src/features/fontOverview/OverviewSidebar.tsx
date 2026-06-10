import {
  Box,
  Button,
  Checkbox,
  Divider,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react'
import type { GlyphOverviewTreeNode } from 'src/lib/glyphOverview'
import { OverviewTreeNav } from 'src/features/fontOverview/OverviewTreeNav'
import { useTranslation } from 'react-i18next'

interface OverviewSidebarProps {
  currentSearchQuery: string
  isClosingProject: boolean
  overviewGlyphCount: number
  projectTitle: string
  selectedSectionId: string
  showOnlyEmptyGlyphs: boolean
  treeNodes: GlyphOverviewTreeNode[]
  onCloseProject: () => void
  onSearchQueryChange: (value: string) => void
  onSectionSelect: (sectionId: string) => void
  onShowOnlyEmptyGlyphsChange: (value: boolean) => void
  onOpenCoverage: () => void
}

export function OverviewSidebar({
  currentSearchQuery,
  isClosingProject,
  overviewGlyphCount,
  projectTitle,
  selectedSectionId,
  showOnlyEmptyGlyphs,
  treeNodes,
  onCloseProject,
  onSearchQueryChange,
  onSectionSelect,
  onShowOnlyEmptyGlyphsChange,
  onOpenCoverage,
}: OverviewSidebarProps) {
  const { t } = useTranslation()

  return (
    <Box
      p={4}
      h="100%"
      display="flex"
      flexDirection="column"
      bg="field.paper"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <VStack align="stretch" spacing={3} mb={4}>
        <HStack justify="space-between" align="flex-start">
          <Box>
            <Text
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="0.16em"
              color="field.muted"
              mb={1}
              fontFamily="mono"
              fontWeight="900"
            >
              {t('fontOverview.kumikoFontEditor')}
            </Text>
            <Heading
              color="field.ink"
              fontSize="38px"
              lineHeight="0.86"
              letterSpacing="0"
            >
              {t('fontOverview.allGlyphs')}
            </Heading>
            <Text fontSize="sm" color="field.muted" mt={2} noOfLines={2}>
              {projectTitle}
            </Text>
          </Box>
          <Button
            size="sm"
            variant="ghost"
            isLoading={isClosingProject}
            loadingText="儲存中"
            onClick={onCloseProject}
          >
            {t('fontOverview.backHome')}
          </Button>
        </HStack>

        <Input
          placeholder={t('fontOverview.searchPlaceholder')}
          value={currentSearchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />

        <Text fontSize="sm" color="field.muted" fontFamily="mono">
          {t('fontOverview.currentTotalPrefix')}{' '}
          {overviewGlyphCount.toLocaleString()}{' '}
          {t('fontOverview.glyphCountSuffix')}
        </Text>

        <Checkbox
          isChecked={showOnlyEmptyGlyphs}
          onChange={(event) =>
            onShowOnlyEmptyGlyphsChange(event.target.checked)
          }
          size="sm"
          color="field.ink"
        >
          {t('fontOverview.showOnlyEmptyGlyphs')}
        </Checkbox>

        <Button size="sm" variant="outline" onClick={onOpenCoverage}>
          {t('fontOverview.charsetCoverage')}
        </Button>
      </VStack>

      <Divider mb={4} borderColor="field.haze" opacity={0.55} />

      <Box flex={1} minH={0} bg="white" borderRadius="sm" overflow="auto" p={2}>
        <OverviewTreeNav
          nodes={treeNodes}
          selectedSectionId={selectedSectionId}
          onSectionSelect={onSectionSelect}
        />
      </Box>
    </Box>
  )
}
