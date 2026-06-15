import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react'
import { GlyphReadonlyReference } from 'src/features/editor/leftPanel/components/GlyphReadonlyReference'
import type { Rect } from 'src/lib/components/componentAssembly'
import type { GlyphData } from 'src/store'
import { useTranslation } from 'react-i18next'

interface GlyphPreviewCardProps {
  glyph: GlyphData | null
  glyphMap: Record<string, GlyphData>
  targetRect?: Rect | null
  onAddToEditor: (glyphId: string) => void
}

export function GlyphPreviewCard({
  glyph,
  glyphMap,
  targetRect,
  onAddToEditor,
}: GlyphPreviewCardProps) {
  const { t } = useTranslation()

  if (!glyph) {
    return null
  }

  return (
    <Box flexShrink={0} minH={0}>
      <VStack align="stretch" spacing={2} h="100%">
        <HStack justify="space-between" align="center">
          <Box minW={0}>
            <Text fontSize="sm" color="field.ink" fontWeight="900">
              {t('editor.componentPreview')}
            </Text>
            <Text
              fontSize="xs"
              color="field.muted"
              noOfLines={1}
              fontFamily="mono"
            >
              {glyph.id}
            </Text>
          </Box>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onAddToEditor(glyph.id)}
          >
            {t('editor.addToEditor')}
          </Button>
        </HStack>
        <GlyphReadonlyReference
          glyph={glyph}
          glyphMap={glyphMap}
          targetRect={targetRect}
        />
      </VStack>
    </Box>
  )
}
