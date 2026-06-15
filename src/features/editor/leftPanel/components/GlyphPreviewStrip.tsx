import { Box, Button, Text } from '@chakra-ui/react'
import type { GlyphData } from 'src/store'
import { InlineGlyphPreview } from 'src/features/editor/leftPanel/components/InlineGlyphPreview'
import { useTranslation } from 'react-i18next'

interface GlyphPreviewStripProps {
  glyphMap: Record<string, GlyphData>
  previewGlyphId: string | null
  resultGlyphs: GlyphData[]
  onPreviewGlyphChange: (glyphId: string) => void
}

export function GlyphPreviewStrip({
  glyphMap,
  previewGlyphId,
  resultGlyphs,
  onPreviewGlyphChange,
}: GlyphPreviewStripProps) {
  const { t } = useTranslation()

  return (
    <Box
      bg="field.panelMuted"
      borderRadius="sm"
      p="5px"
      minH="88px"
      flexShrink={1}
      overflow="scroll"
    >
      {resultGlyphs.length > 0 ? (
        <Box
          display="flex"
          flexWrap="wrap"
          alignItems="center"
          alignContent="flex-start"
          columnGap="3px"
          rowGap="3px"
        >
          {resultGlyphs.map((glyph) => {
            const isActive = glyph.id === previewGlyphId
            return (
              <Button
                key={glyph.id}
                size="m"
                variant="ghost"
                minW="unset"
                p="3px"
                h="auto"
                color={isActive ? 'field.ink' : 'field.ink'}
                bg={isActive ? 'field.yellow.400' : 'transparent'}
                _hover={{
                  bg: isActive ? 'field.yellow.400' : 'field.panelMuted',
                  color: 'field.ink',
                }}
                onClick={() => onPreviewGlyphChange(glyph.id)}
                title={glyph.id}
              >
                <InlineGlyphPreview glyph={glyph} glyphMap={glyphMap} />
              </Button>
            )
          })}
        </Box>
      ) : (
        <Text fontSize="sm" color="field.muted">
          {t('editor.noDisplayableGlyphs')}
        </Text>
      )}
    </Box>
  )
}
