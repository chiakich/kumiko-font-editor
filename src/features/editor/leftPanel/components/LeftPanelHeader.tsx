import { Box, Button, Heading, HStack, Text } from '@chakra-ui/react'
import { useReturnToOverview } from 'src/features/editor/leftPanel/hooks/useReturnToOverview'
import { useTranslation } from 'react-i18next'

interface LeftPanelHeaderProps {
  hasSelectedGlyph: boolean
  isCjkGlyph: boolean
}

export function LeftPanelHeader({
  hasSelectedGlyph,
  isCjkGlyph,
}: LeftPanelHeaderProps) {
  const { t } = useTranslation()
  const returnToOverview = useReturnToOverview()

  return (
    <>
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
            {t('editor.kumikoFontEditor')}
          </Text>
          <Heading
            color="foreground"
            fontSize="34px"
            lineHeight="0.86"
            letterSpacing="0"
          >
            {isCjkGlyph ? '部件檢索' : '相關字形'}
          </Heading>
        </Box>

        <Button size="sm" variant="ghost" onClick={returnToOverview}>
          {t('editor.backToAllGlyphs')}
        </Button>
      </HStack>

      {!hasSelectedGlyph ? (
        <Text fontSize="sm" color="mutedForeground">
          {t('editor.selectGlyphFirst')}
        </Text>
      ) : null}
    </>
  )
}
