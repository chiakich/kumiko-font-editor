import { describe, expect, it } from 'vitest'
import {
  projectBroadcastHasCanonicalChanges,
  shouldBlockProjectBroadcastReload,
} from 'src/lib/project/projectBroadcastPolicy'
import type { ProjectDraftSavedMessage } from 'src/lib/project/projectBroadcast'

const makeMessage = (
  update: Partial<ProjectDraftSavedMessage> = {}
): ProjectDraftSavedMessage => ({
  type: 'project-draft-saved',
  originId: 'tab-a',
  projectId: 'project-a',
  revision: 1,
  projectChanged: false,
  uiStateChanged: false,
  glyphIds: [],
  deletedGlyphIds: [],
  savedAt: 10,
  ...update,
})

describe('project broadcast policy', () => {
  it('treats project and glyph updates as canonical changes', () => {
    expect(
      projectBroadcastHasCanonicalChanges(makeMessage({ projectChanged: true }))
    ).toBe(true)
    expect(
      projectBroadcastHasCanonicalChanges(makeMessage({ glyphIds: ['A'] }))
    ).toBe(true)
    expect(
      projectBroadcastHasCanonicalChanges(
        makeMessage({ deletedGlyphIds: ['B'] })
      )
    ).toBe(true)
  })

  it('does not treat UI-only updates as canonical changes', () => {
    expect(
      projectBroadcastHasCanonicalChanges(makeMessage({ uiStateChanged: true }))
    ).toBe(false)
  })

  it('blocks reload only when a dirty tab receives canonical changes', () => {
    expect(
      shouldBlockProjectBroadcastReload(
        { isDirty: true },
        makeMessage({ uiStateChanged: true })
      )
    ).toBe(false)
    expect(
      shouldBlockProjectBroadcastReload(
        { isDirty: true },
        makeMessage({ glyphIds: ['A'] })
      )
    ).toBe(true)
    expect(
      shouldBlockProjectBroadcastReload(
        { isDirty: false },
        makeMessage({ glyphIds: ['A'] })
      )
    ).toBe(false)
  })
})
