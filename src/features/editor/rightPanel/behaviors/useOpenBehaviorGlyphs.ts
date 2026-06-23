import { useCallback } from 'react'
import { useStore } from 'src/store'

export function useOpenGlyphInEditor() {
  const addGlyphToEditor = useStore((state) => state.addGlyphToEditor)
  const setSelectedGlyphId = useStore((state) => state.setSelectedGlyphId)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)

  return useCallback(
    (glyphId: string) => {
      if (!useStore.getState().fontData?.glyphs[glyphId]) {
        return
      }

      addGlyphToEditor(glyphId)
      setSelectedGlyphId(glyphId)
      setWorkspaceView('editor')
    },
    [addGlyphToEditor, setSelectedGlyphId, setWorkspaceView]
  )
}

export function useOpenSpacingPairInEditor() {
  const addGlyphToEditor = useStore((state) => state.addGlyphToEditor)
  const insertGlyphIntoEditor = useStore((state) => state.insertGlyphIntoEditor)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)

  return useCallback(
    (left: string, right: string) => {
      const glyphs = useStore.getState().fontData?.glyphs
      if (!glyphs?.[left] || !glyphs[right]) {
        return
      }

      addGlyphToEditor(left)
      insertGlyphIntoEditor(right, left)
      setWorkspaceView('editor')
    },
    [addGlyphToEditor, insertGlyphIntoEditor, setWorkspaceView]
  )
}
