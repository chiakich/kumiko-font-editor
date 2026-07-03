import { Box, Button, HStack, Stack, Tag, Text } from '@chakra-ui/react'
import { NavArrowRight, PageSearch, Trash } from 'iconoir-react'
import { useTranslation } from 'react-i18next'

interface SelectedGlyphsCardProps {
  selectedGlyphCount: number
  onDeleteGlyphs: () => void
  onEnterEditor: () => void
  onOpenQualityCheck: () => void
}

export function SelectedGlyphsCard({
  selectedGlyphCount,
  onDeleteGlyphs,
  onEnterEditor,
  onOpenQualityCheck,
}: SelectedGlyphsCardProps) {
  const { t } = useTranslation()

  return (
    <Box borderWidth={1} borderColor="border" bg="card" p={4}>
      <Stack gap={3}>
        <HStack justify="space-between" gap={3} align="start">
          <Box>
            <Text fontSize="lg" fontWeight="900" color="foreground">
              {t('fontOverview.selection.selectedGlyphs', {
                count: selectedGlyphCount,
              })}
            </Text>
            <Text fontSize="xs" color="mutedForeground" mt={1}>
              {t('fontOverview.selection.description')}
            </Text>
          </Box>
          <Tag.Root size="sm" colorPalette="orange" flexShrink={0}>
            {t('fontOverview.selection.badge')}
          </Tag.Root>
        </HStack>

        <Stack gap={2}>
          <Button size="sm" onClick={onEnterEditor}>
            <NavArrowRight width={14} height={14} />
            {t('glyphInspector.enterGlyphEditor')}
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenQualityCheck}>
            <PageSearch width={14} height={14} />
            {t('qualityCheck.title')}
          </Button>
          <Button size="sm" variant="outline" onClick={onDeleteGlyphs}>
            <Trash width={14} height={14} />
            {t('glyphInspector.deleteGlyph')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  )
}
