import { describe, expect, it } from 'vitest'
import { getLayoutTableSummaries } from 'src/features/common/projectControl/fontSettings/features/components/openTypeOutlineModel'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

describe('OpenType outline model', () => {
  it('handles legacy feature state without source sections', () => {
    const state = {
      features: [
        {
          id: 'feature_liga',
          tag: 'liga',
          isActive: true,
          entries: [],
          origin: 'imported',
          meta: { table: 'GSUB' },
        },
      ],
      lookups: [],
      unsupportedLookups: [],
    } as unknown as OpenTypeFeaturesState

    expect(getLayoutTableSummaries(state)).toEqual([
      {
        featureCount: 1,
        lookupCount: 0,
        sourceCount: 0,
        table: 'GSUB',
        unsupportedCount: 0,
      },
    ])
  })
})
