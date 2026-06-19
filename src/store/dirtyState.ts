import type { GlobalState } from 'src/store/types'

const markPersistenceQueued = (state: GlobalState) => {
  state.isDirty = true
  state.persistenceStatus = 'queued'
  state.persistenceError = null
  state.persistenceQueue.status = 'queued'
  state.persistenceQueue.lastError = null
}

const nextPersistenceRevision = (state: GlobalState) => {
  state.persistenceQueue.revision += 1
  return state.persistenceQueue.revision
}

const addUnique = (values: string[], value: string) => {
  if (!values.includes(value)) {
    values.push(value)
  }
}

const removeValue = (values: string[], value: string) =>
  values.filter((item) => item !== value)

export const markProjectDirty = (state: GlobalState) => {
  const revision = nextPersistenceRevision(state)
  markPersistenceQueued(state)
  state.hasLocalChanges = true
  state.persistenceQueue.projectQueued = true
  state.persistenceQueue.projectRevision = revision
}

export const markUiStateDirty = (state: GlobalState) => {
  const revision = nextPersistenceRevision(state)
  markPersistenceQueued(state)
  state.persistenceQueue.uiStateQueued = true
  state.persistenceQueue.uiStateRevision = revision
}

export const markGlyphDirty = (state: GlobalState, glyphId: string) => {
  const revision = nextPersistenceRevision(state)
  markPersistenceQueued(state)
  state.hasLocalChanges = true
  state.glyphEditTimes[glyphId] = Date.now()
  addUnique(state.dirtyGlyphIds, glyphId)
  addUnique(state.localDirtyGlyphIds, glyphId)
  addUnique(state.persistenceQueue.glyphIds, glyphId)
  state.persistenceQueue.glyphRevisions[glyphId] = revision
  state.persistenceQueue.deletedGlyphIds = removeValue(
    state.persistenceQueue.deletedGlyphIds,
    glyphId
  )
  delete state.persistenceQueue.deletedGlyphRevisions[glyphId]
}

// An added glyph is dirty and must drop any pending deletion of the same id.
export const markGlyphAdded = (state: GlobalState, glyphId: string) => {
  markGlyphDirty(state, glyphId)
  markProjectDirty(state)
  state.deletedGlyphIds = removeValue(state.deletedGlyphIds, glyphId)
  state.localDeletedGlyphIds = removeValue(state.localDeletedGlyphIds, glyphId)
}

// A deleted glyph drops its dirty/edit-time tracking and is queued for removal.
export const markGlyphDeleted = (state: GlobalState, glyphId: string) => {
  const revision = nextPersistenceRevision(state)
  markPersistenceQueued(state)
  state.hasLocalChanges = true
  delete state.glyphEditTimes[glyphId]
  state.dirtyGlyphIds = removeValue(state.dirtyGlyphIds, glyphId)
  state.localDirtyGlyphIds = removeValue(state.localDirtyGlyphIds, glyphId)
  state.persistenceQueue.glyphIds = removeValue(
    state.persistenceQueue.glyphIds,
    glyphId
  )
  delete state.persistenceQueue.glyphRevisions[glyphId]
  addUnique(state.deletedGlyphIds, glyphId)
  addUnique(state.localDeletedGlyphIds, glyphId)
  addUnique(state.persistenceQueue.deletedGlyphIds, glyphId)
  state.persistenceQueue.deletedGlyphRevisions[glyphId] = revision
  markProjectDirty(state)
}
