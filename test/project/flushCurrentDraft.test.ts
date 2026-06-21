import { describe, expect, it } from 'vitest'
import { canFlushCurrentDraft } from 'src/features/common/projectPersistence/useFlushCurrentDraft'
import type { FontData } from 'src/store'

const fontData = { glyphs: {}, glyphOrder: [] } satisfies FontData

describe('canFlushCurrentDraft', () => {
  it('blocks ordinary flushes while local persistence is in an error state', () => {
    expect(
      canFlushCurrentDraft({
        projectId: 'project-a',
        projectTitle: 'Project A',
        fontData,
        persistenceStatus: 'error',
      })
    ).toBe(false)
  })

  it('allows explicit retry flushes from an error state', () => {
    expect(
      canFlushCurrentDraft(
        {
          projectId: 'project-a',
          projectTitle: 'Project A',
          fontData,
          persistenceStatus: 'error',
        },
        { allowErrorRetry: true }
      )
    ).toBe(true)
  })
})
