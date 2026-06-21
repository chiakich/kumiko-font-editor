import type { ProjectDraftSavedMessage } from 'src/lib/project/projectBroadcast'

interface ProjectBroadcastConflictState {
  isDirty: boolean
  localDirtyGlyphIds?: string[]
  localDeletedGlyphIds?: string[]
}

export const projectBroadcastHasCanonicalChanges = (
  message: ProjectDraftSavedMessage
) =>
  message.projectChanged ||
  message.glyphIds.length > 0 ||
  message.deletedGlyphIds.length > 0

export const getProjectBroadcastLocalGlyphOverlap = (
  state: ProjectBroadcastConflictState,
  message: ProjectDraftSavedMessage
) => {
  const locallyChangedGlyphIds = new Set([
    ...(state.localDirtyGlyphIds ?? []),
    ...(state.localDeletedGlyphIds ?? []),
  ])
  if (locallyChangedGlyphIds.size === 0) {
    return []
  }

  return [...new Set([...message.glyphIds, ...message.deletedGlyphIds])].filter(
    (glyphId) => locallyChangedGlyphIds.has(glyphId)
  )
}

export const canMergeProjectBroadcastWhileDirty = (
  state: ProjectBroadcastConflictState,
  message: ProjectDraftSavedMessage
) =>
  state.isDirty &&
  !message.projectChanged &&
  message.deletedGlyphIds.length === 0 &&
  message.glyphIds.length > 0 &&
  getProjectBroadcastLocalGlyphOverlap(state, message).length === 0

export const shouldBlockProjectBroadcastReload = (
  state: ProjectBroadcastConflictState,
  message: ProjectDraftSavedMessage
) =>
  state.isDirty &&
  projectBroadcastHasCanonicalChanges(message) &&
  !canMergeProjectBroadcastWhileDirty(state, message)
