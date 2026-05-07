import type { GlobalState } from 'src/store/types'

export const markGlyphDirty = (state: GlobalState, glyphId: string) => {
  state.isDirty = true
  state.hasLocalChanges = true
  if (!state.dirtyGlyphIds.includes(glyphId)) {
    state.dirtyGlyphIds.push(glyphId)
  }
  if (!state.localDirtyGlyphIds.includes(glyphId)) {
    state.localDirtyGlyphIds.push(glyphId)
  }
}
