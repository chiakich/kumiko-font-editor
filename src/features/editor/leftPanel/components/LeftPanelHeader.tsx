import { Box, Button, Heading, HStack, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'

interface LeftPanelHeaderProps {
  hasSelectedGlyph: boolean
  isCjkGlyph: boolean
  onBack: () => void
}

export function LeftPanelHeader({
  hasSelectedGlyph,
  isCjkGlyph,
  onBack,
}: LeftPanelHeaderProps) {
  const { t } = useTranslation()

  return (
    <>
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
            {t('editor.kumikoFontEditor')}
          </Text>
          <Heading
            color="field.ink"
            fontSize="34px"
            lineHeight="0.86"
            letterSpacing="0"
          >
            {isCjkGlyph ? '部件檢索' : '相關字形'}
          </Heading>
        </Box>

        <Button size="sm" variant="ghost" onClick={onBack}>
          {t('editor.backToAllGlyphs')}
        </Button>
      </HStack>

      {!hasSelectedGlyph ? (
        <Text fontSize="sm" color="field.muted">
          {t('editor.selectGlyphFirst')}
        </Text>
      ) : null}
    </>
  )
}
