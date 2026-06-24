import { useEffect } from 'react'
import { shouldIgnoreGlobalShortcut } from 'src/features/common/keyboardShortcutTargets'
import { useStore } from 'src/store'

/**
 * Wires Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y (redo) to the
 * zundo temporal store so font edits made from the overview (e.g. batch
 * transforms) can be reverted. The editor canvas has its own equivalent
 * inside useCanvasKeyboardShortcuts; this is the overview-only counterpart.
 */
export function useHistoryShortcuts() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        return
      }

      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') {
        return
      }

      if (shouldIgnoreGlobalShortcut(event.target)) {
        return
      }

      event.preventDefault()
      const temporal = useStore.temporal.getState()
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey)
      if (isRedo) {
        temporal.redo()
      } else {
        temporal.undo()
      }
      // undo/redo restores fontData only; rebuild the overview grid list so it
      // re-renders against the reverted glyph data.
      useStore.getState().refreshFilteredGlyphList()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
}
