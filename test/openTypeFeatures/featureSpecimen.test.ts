import { describe, expect, it } from 'vitest'
import { buildFeatureSpecimenGlyphs } from '@/features/common/openTypeFeatures/utils/featureSpecimen'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

const state = {
  features: [
    {
      id: 'f-vert',
      tag: 'vert',
      isActive: true,
      entries: [
        { id: 'e1', script: 'DFLT', language: 'dflt', lookupIds: ['l1'] },
      ],
    },
    {
      id: 'f-liga',
      tag: 'liga',
      isActive: true,
      entries: [
        { id: 'e2', script: 'DFLT', language: 'dflt', lookupIds: ['l2'] },
      ],
    },
  ],
  lookups: [
    {
      id: 'l1',
      rules: [
        {
          id: 'r1',
          kind: 'singleSubstitution',
          target: { kind: 'class', classId: 'c1' },
          replacement: 'comma.vert',
        },
        {
          id: 'r-extra',
          kind: 'singleSubstitution',
          target: { kind: 'glyph', glyph: 'colon' },
          replacement: 'colon.vert',
        },
      ],
    },
    {
      id: 'l2',
      rules: [
        {
          id: 'r2',
          kind: 'ligatureSubstitution',
          components: ['f', 'i'],
          replacement: 'fi',
        },
      ],
    },
  ],
  glyphClasses: [{ id: 'c1', name: 'punct', glyphs: ['comma', 'period'] }],
} as unknown as OpenTypeFeaturesState

describe('feature specimen glyphs', () => {
  it('samples the first rule of each lookup, resolving classes', () => {
    expect(buildFeatureSpecimenGlyphs(state, 'vert')).toEqual(['comma'])
    expect(buildFeatureSpecimenGlyphs(state, 'liga')).toEqual(['f', 'i'])
  })

  it('returns nothing for a tag with no IR rules', () => {
    expect(buildFeatureSpecimenGlyphs(state, 'salt')).toEqual([])
  })
})
