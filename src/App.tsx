import { lazy, Suspense } from 'react'
import { useAutoDraftSave } from 'src/hooks/useAutoDraftSave'
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
  import('src/features/editor/EditorLayout').then((module) => ({
    default: module.EditorLayout,
  }))
)

function App() {
  const fontData = useStore((state) => state.fontData)
  const workspaceView = useStore((state) => state.workspaceView)

  useAutoDraftSave()

  if (!fontData) {
    return (
      <Suspense fallback={null}>
        <Home />
      </Suspense>
    )
  }

  if (workspaceView === 'overview') {
    return (
      <Suspense fallback={null}>
        <FontOverviewScreen />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={null}>
      <EditorLayout />
    </Suspense>
  )
}

export default App
