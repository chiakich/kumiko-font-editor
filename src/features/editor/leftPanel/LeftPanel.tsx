import { Box } from '@chakra-ui/react'
import { useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useStore } from 'src/store'
import { LeftPanelContent } from 'src/features/editor/leftPanel/components/LeftPanelContent'
import { getEditorGlyphHeroSourceRect } from 'src/features/common/viewTransition/overviewReturnHeroGeometry'
import { startOverviewReturnHeroOverlay } from 'src/features/common/viewTransition/overviewReturnHeroOverlayStore'

export function LeftPanel() {
  const fontData = useStore((state) => state.fontData)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const addGlyphToEditor = useStore((state) => state.addGlyphToEditor)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)

  const glyphs = useMemo(
    () => Object.values(fontData?.glyphs ?? {}),
    [fontData]
  )
  const glyphMap = useMemo(
    () => Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
    [glyphs]
  )
  const selectedGlyph = selectedGlyphId
    ? (glyphMap[selectedGlyphId] ?? null)
    : null

  const handleBack = useCallback(() => {
    const transitionGlyphId = selectedGlyphId
    const hasStartViewTransition = 'startViewTransition' in document
    const sourceRect = getEditorGlyphHeroSourceRect()

    const armReturnOverlay = () => {
      if (!transitionGlyphId) {
        return
      }

      startOverviewReturnHeroOverlay(transitionGlyphId, sourceRect)
    }

    if (!hasStartViewTransition) {
      flushSync(() => {
        setWorkspaceView('overview')
      })
      window.requestAnimationFrame(() => {
        armReturnOverlay()
      })
      return
    }

    const transition = document.startViewTransition(() => {
      flushSync(() => setWorkspaceView('overview'))
    })

    void transition.ready.then(armReturnOverlay).catch(armReturnOverlay)
  }, [selectedGlyphId, setWorkspaceView])

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
      <LeftPanelContent
        key={selectedGlyph?.id ?? 'none'}
        glyphMap={glyphMap}
        glyphs={glyphs}
        selectedGlyph={selectedGlyph}
        onAddGlyphToEditor={addGlyphToEditor}
        onBack={handleBack}
      />
    </Box>
  )
}
