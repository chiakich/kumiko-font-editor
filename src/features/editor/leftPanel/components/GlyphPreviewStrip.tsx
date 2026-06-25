import { Box, Button, Text } from '@chakra-ui/react'
import { forwardRef, useMemo, type HTMLAttributes } from 'react'
import { VirtuosoGrid, type ListRange } from 'react-virtuoso'
import type { GlyphData } from 'src/store'
import { InlineGlyphPreview } from 'src/features/editor/leftPanel/components/InlineGlyphPreview'
import { useTranslation } from 'react-i18next'

const StripList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function StripList({ style, children, ...props }, ref) {
    return (
      <Box
        ref={ref}
        display="flex"
        flexWrap="wrap"
        alignContent="flex-start"
        columnGap="3px"
        rowGap="3px"
        style={style}
        {...props}
      >
        {children}
      </Box>
    )
  }
)

function StripItem({
  style,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <Box style={style} {...props}>
      {children}
    </Box>
  )
}

interface GlyphPreviewStripProps {
  glyphMap: Record<string, GlyphData>
  previewGlyphId: string | null
  resultGlyphs: GlyphData[]
  onPreviewGlyphChange: (glyphId: string) => void
  onRangeChange: (range: ListRange) => void
}

export function GlyphPreviewStrip({
  glyphMap,
  previewGlyphId,
  resultGlyphs,
  onPreviewGlyphChange,
  onRangeChange,
}: GlyphPreviewStripProps) {
  const { t } = useTranslation()

  const gridComponents = useMemo(
    () => ({ List: StripList, Item: StripItem }),
    []
  )

  return (
    <Box
      bg="field.panelMuted"
      borderRadius="sm"
      p="5px"
      flex="1"
      minH="88px"
      overflow="hidden"
    >
      {resultGlyphs.length > 0 ? (
        <VirtuosoGrid
          style={{ height: '100%', width: '100%' }}
          totalCount={resultGlyphs.length}
          components={gridComponents}
          increaseViewportBy={120}
          rangeChanged={onRangeChange}
          itemContent={(index) => {
            const glyph = resultGlyphs[index]
            const isActive = glyph.id === previewGlyphId
            return (
              <Button
                size="sm"
                variant="ghost"
                minW="unset"
                p="3px"
                h="auto"
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
          }}
        />
      ) : (
        <Text fontSize="sm" color="field.muted">
          {t('editor.noDisplayableGlyphs')}
        </Text>
      )}
    </Box>
  )
}
