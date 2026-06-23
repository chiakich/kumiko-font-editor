import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { getEditorGlyphHeroSourceRect } from 'src/features/common/viewTransition/overviewReturnHeroGeometry'
import { startOverviewReturnHeroOverlay } from 'src/features/common/viewTransition/overviewReturnHeroOverlayStore'
import { useStore } from 'src/store'

export function useReturnToOverview() {
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)

  return useCallback(() => {
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
}
