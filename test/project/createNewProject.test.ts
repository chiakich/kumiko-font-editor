import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import { createNewBlankProject } from 'src/features/home/utils/createNewProject'
import {
  loadProjectDraftMetadata,
  loadProjectGlyphGeometry,
} from 'src/lib/project/projectRepository'

describe('new blank project creation', () => {
  it('creates a saved project with required font info and .notdef', async () => {
    const created = await createNewBlankProject('New Test Font')

    const draft = await loadProjectDraftMetadata(created.id)
    const notdefGeometry = await loadProjectGlyphGeometry(created.id, '.notdef')

    expect(created.summary.title).toBe('New Test Font')
    expect(draft?.fontData?.fontInfo?.familyName).toBe('New Test Font')
    expect(draft?.fontData?.glyphOrder).toEqual(['.notdef'])
    expect(draft?.projectUiState).toMatchObject({
      selectedGlyphId: '.notdef',
      selectedLayerId: 'public.default',
      overviewSectionId: 'all',
    })
    expect(notdefGeometry?.layers?.['public.default']?.metrics).toEqual({
      width: 1000,
      lsb: 0,
      rsb: 1000,
    })
  })
})
