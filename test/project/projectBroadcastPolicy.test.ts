import { describe, expect, it } from 'vitest'
import {
  canMergeProjectBroadcastWhileDirty,
  getProjectBroadcastLocalGlyphOverlap,
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
        { isDirty: true, localDirtyGlyphIds: ['A'] },
        makeMessage({ glyphIds: ['A'] })
      )
    ).toBe(true)
    expect(
      shouldBlockProjectBroadcastReload(
        { isDirty: true, localDirtyGlyphIds: ['B'] },
        makeMessage({ glyphIds: ['A'] })
      )
    ).toBe(false)
    expect(
      shouldBlockProjectBroadcastReload(
        { isDirty: false },
        makeMessage({ glyphIds: ['A'] })
      )
    ).toBe(false)
  })

  it('finds glyph overlaps between local and remote canonical changes', () => {
    expect(
      getProjectBroadcastLocalGlyphOverlap(
        {
          isDirty: true,
          localDirtyGlyphIds: ['A'],
          localDeletedGlyphIds: ['B'],
        },
        makeMessage({ glyphIds: ['A', 'C'], deletedGlyphIds: ['B'] })
      )
    ).toEqual(['A', 'B'])
  })

  it('allows dirty tabs to merge independent glyph updates', () => {
    expect(
      canMergeProjectBroadcastWhileDirty(
        { isDirty: true, localDirtyGlyphIds: ['A'] },
        makeMessage({ glyphIds: ['B'] })
      )
    ).toBe(true)
    expect(
      canMergeProjectBroadcastWhileDirty(
        { isDirty: true, localDirtyGlyphIds: ['A'] },
        makeMessage({ projectChanged: true, glyphIds: ['B'] })
      )
    ).toBe(false)
    expect(
      canMergeProjectBroadcastWhileDirty(
        { isDirty: true, localDirtyGlyphIds: ['A'] },
        makeMessage({ deletedGlyphIds: ['B'] })
      )
    ).toBe(false)
  })
})
