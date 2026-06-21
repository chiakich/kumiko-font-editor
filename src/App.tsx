import { lazy, Suspense } from 'react'
import { preloadEditorLayout } from 'src/features/editor/preloadEditorLayout'
import { OverviewReturnHeroOverlay } from 'src/features/common/viewTransition/OverviewReturnHeroOverlay'
import { useAutoDraftSave } from 'src/hooks/useAutoDraftSave'
import { useProjectBroadcastSync } from 'src/hooks/useProjectBroadcastSync'
import { useStore } from 'src/store'

const Home = lazy(() =>
  import('src/features/home/Home').then((module) => ({ default: module.Home }))
)
const FontOverviewScreen = lazy(() =>
  import('src/features/fontOverview/FontOverviewScreen').then((module) => ({
    default: module.FontOverviewScreen,
  }))
)
const EditorLayout = lazy(() =>
  preloadEditorLayout().then((module) => ({ default: module.EditorLayout }))
)

function App() {
  const fontData = useStore((state) => state.fontData)
  const workspaceView = useStore((state) => state.workspaceView)

  useAutoDraftSave()
  useProjectBroadcastSync()

  if (!fontData) {
    return (
      <Suspense fallback={null}>
        <Home />
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
