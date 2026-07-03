import { Box } from '@chakra-ui/react'
import { useMemo } from 'react'
import { useStore, type GlyphData } from 'src/store'
import { LeftPanelContent } from 'src/features/editor/leftPanel/components/LeftPanelContent'

const EMPTY_GLYPH_MAP: Record<string, GlyphData> = {}

export function LeftPanel() {
  const fontData = useStore((state) => state.fontData)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const glyphMap = fontData?.glyphs ?? EMPTY_GLYPH_MAP

  const glyphs = useMemo(() => Object.values(glyphMap), [glyphMap])
  const selectedGlyph = selectedGlyphId
    ? (glyphMap[selectedGlyphId] ?? null)
    : null

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
      <LeftPanelContent
        key={selectedGlyph?.id ?? 'none'}
        glyphMap={glyphMap}
        glyphs={glyphs}
        selectedGlyph={selectedGlyph}
      />
    </Box>
  )
}
