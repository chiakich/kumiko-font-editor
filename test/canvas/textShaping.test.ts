import { describe, expect, it } from 'vitest'
import {
  createEmptyOpenTypeFeaturesState,
  upsertCombinationBehavior,
} from '@/lib/openTypeFeatures'
import { shapeGlyphRuns } from '@/features/editor/canvas/workspace/layout/textShaping'
import type { FontData } from '@/store'

describe('text shaping layout', () => {
  it('maps combination behavior ligatures to display glyph runs', () => {
    const openTypeFeatures = upsertCombinationBehavior(
      createEmptyOpenTypeFeaturesState(),
      {
        input: 'f+i',
        output: 'f_i',
        type: 'standardLigature',
      }
    )
    const fontData = {
      glyphs: {
        f: makeGlyph('f'),
        i: makeGlyph('i'),
        f_i: makeGlyph('f_i'),
      },
      openTypeFeatures,
    } satisfies FontData

    expect(shapeGlyphRuns(fontData, ['f', 'i'])).toEqual([
      {
        glyphId: 'f_i',
        sourceGlyphIds: ['f', 'i'],
        sourceStartIndex: 0,
        sourceLength: 2,
      },
    ])
  })
})

function makeGlyph(id: string) {
  return {
    id,
    name: id,
    paths: [],
    components: [],
    componentRefs: [],
    anchors: [],
    guidelines: [],
    metrics: {
      lsb: 0,
      rsb: 500,
      width: 500,
    },
  }
}
