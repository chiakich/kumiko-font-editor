import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { getEditorGlyphHeroSourceRect } from '@/features/common/viewTransition/overviewReturnHeroGeometry'
import { startOverviewReturnHeroOverlay } from '@/features/common/viewTransition/overviewReturnHeroOverlayStore'
import { useStore } from '@/store'

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
