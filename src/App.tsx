import { lazy, Suspense } from 'react'
import { preloadEditorLayout } from '@/features/editor/preloadEditorLayout'
import { OverviewReturnHeroOverlay } from '@/features/common/viewTransition/OverviewReturnHeroOverlay'
import { useAutoDraftSave } from '@/hooks/useAutoDraftSave'
import { useProjectBroadcastSync } from '@/hooks/useProjectBroadcastSync'
import { useApplyColorMode } from '@/lib/preferences/colorMode'
import { useStore } from '@/store'

const Home = lazy(() =>
  import('@/features/home/Home').then((module) => ({ default: module.Home }))
)
const FontOverviewScreen = lazy(() =>
  import('@/features/fontOverview/FontOverviewScreen').then((module) => ({
    default: module.FontOverviewScreen,
  }))
)
const EditorLayout = lazy(() =>
  preloadEditorLayout().then((module) => ({ default: module.EditorLayout }))
)
const FeatureWorkspaceScreen = lazy(() =>
  import('@/features/featureWorkspace/FeatureWorkspaceScreen').then(
    (module) => ({ default: module.FeatureWorkspaceScreen })
  )
)

function App() {
  const fontData = useStore((state) => state.fontData)
  const workspaceView = useStore((state) => state.workspaceView)

  useApplyColorMode()
  useAutoDraftSave()
  useProjectBroadcastSync()

  if (!fontData) {
    return (
      <Suspense fallback={null}>
        <Home />
      </Suspense>
    )
  }

  if (workspaceView === 'features') {
    return (
      <Suspense fallback={null}>
        <FeatureWorkspaceScreen />
      </Suspense>
    )
  }

  if (workspaceView === 'overview') {
    return (
      <>
        <Suspense fallback={null}>
          <FontOverviewScreen />
        </Suspense>
        <OverviewReturnHeroOverlay />
      </>
    )
  }

  return (
    <>
      <Suspense fallback={null}>
        <EditorLayout />
      </Suspense>
      <OverviewReturnHeroOverlay />
    </>
  )
}

export default App
