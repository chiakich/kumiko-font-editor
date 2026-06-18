import type { GlobalState } from 'src/store/types'

export const markProjectDirty = (state: GlobalState) => {
  state.isDirty = true
  state.hasLocalChanges = true
  state.persistenceStatus = 'queued'
  state.persistenceError = null
}

export const markGlyphDirty = (state: GlobalState, glyphId: string) => {
  markProjectDirty(state)
  state.glyphEditTimes[glyphId] = Date.now()
  if (!state.dirtyGlyphIds.includes(glyphId)) {
    state.dirtyGlyphIds.push(glyphId)
  }
  if (!state.localDirtyGlyphIds.includes(glyphId)) {
    state.localDirtyGlyphIds.push(glyphId)
  }
}

// An added glyph is dirty and must drop any pending deletion of the same id.
export const markGlyphAdded = (state: GlobalState, glyphId: string) => {
  markGlyphDirty(state, glyphId)
  state.deletedGlyphIds = state.deletedGlyphIds.filter((id) => id !== glyphId)
  state.localDeletedGlyphIds = state.localDeletedGlyphIds.filter(
    (id) => id !== glyphId
  )
}

// A deleted glyph drops its dirty/edit-time tracking and is queued for removal.
export const markGlyphDeleted = (state: GlobalState, glyphId: string) => {
  markProjectDirty(state)
  delete state.glyphEditTimes[glyphId]
  state.dirtyGlyphIds = state.dirtyGlyphIds.filter((id) => id !== glyphId)
  state.localDirtyGlyphIds = state.localDirtyGlyphIds.filter(
    (id) => id !== glyphId
  )
  if (!state.deletedGlyphIds.includes(glyphId)) {
    state.deletedGlyphIds.push(glyphId)
  }
  if (!state.localDeletedGlyphIds.includes(glyphId)) {
    state.localDeletedGlyphIds.push(glyphId)
  }
}
