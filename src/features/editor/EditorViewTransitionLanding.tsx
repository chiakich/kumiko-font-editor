import { Box } from '@chakra-ui/react'
import { useMemo, useSyncExternalStore } from 'react'
import {
  getEditorViewTransitionLandingGlyphId,
  subscribeEditorViewTransitionLanding,
} from 'src/features/editor/editorViewTransitionLandingStore'
import { GlyphPreview } from 'src/features/common/glyphPreview/GlyphPreview'
import { useStore } from 'src/store'

export function EditorViewTransitionLanding() {
  const fontData = useStore((state) => state.fontData)
  const glyphMap = useMemo(() => fontData?.glyphs ?? {}, [fontData?.glyphs])
  const landingGlyphId = useSyncExternalStore(
    subscribeEditorViewTransitionLanding,
    getEditorViewTransitionLandingGlyphId,
    getEditorViewTransitionLandingGlyphId
  )
  const landingGlyph = landingGlyphId
    ? (glyphMap[landingGlyphId] ?? null)
    : null

  return (
    <Box
      position="fixed"
      top="0px"
      left="50%"
      transform="translateX(-50%)"
      w="110vh"
      h="100vh"
      color="white"
      pointerEvents="none"
      aria-hidden="true"
      style={{ viewTransitionName: 'glyph-preview' }}
    >
      {landingGlyph ? (
        <GlyphPreview
          glyph={landingGlyph}
          glyphMap={glyphMap}
          inheritFallbackColor
        />
      ) : null}
    </Box>
  )
}
