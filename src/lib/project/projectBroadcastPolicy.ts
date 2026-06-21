import type { ProjectDraftSavedMessage } from 'src/lib/project/projectBroadcast'

interface ProjectBroadcastConflictState {
  isDirty: boolean
}

export const projectBroadcastHasCanonicalChanges = (
  message: ProjectDraftSavedMessage
) =>
  message.projectChanged ||
  message.glyphIds.length > 0 ||
  message.deletedGlyphIds.length > 0

export const shouldBlockProjectBroadcastReload = (
  state: ProjectBroadcastConflictState,
  message: ProjectDraftSavedMessage
) => state.isDirty && projectBroadcastHasCanonicalChanges(message)
