import { describe, expect, it } from 'vitest'
import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import type { StructureBodyBox } from 'src/lib/qualityCheck/hanClassification'
import {
  buildStructureRuler,
  isStructureRulerCharacter,
} from 'src/lib/qualityCheck/structureRuler'

const bodyBox: StructureBodyBox = { top: 880, bottom: -120, unitsPerEm: 1000 }

const makeSample = (
  character: string,
  bearings = { left: 50, right: 50, top: 80, bottom: 40 }
): GlyphGeometrySample => {
  const bounds = {
    xMin: bearings.left,
    xMax: 1000 - bearings.right,
    yMin: bodyBox.bottom + bearings.bottom,
    yMax: bodyBox.top - bearings.top,
  }
  return {
    glyphId: `glyph-${character}`,
    glyphName: character,
    character,
    advance: 1000,
    bounds,
    sides: {
      left: { type: 'framing', bearing: bearings.left, coverage: 1 },
      right: { type: 'framing', bearing: bearings.right, coverage: 1 },
      top: { type: 'framing', bearing: bearings.top, coverage: 1 },
      bottom: { type: 'framing', bearing: bearings.bottom, coverage: 1 },
    },
    ink: {
      bounds,
      inkArea: 10000,
      faceArea: 10000,
      inkToFaceRatio: null,
      inkToEmRatio: null,
      centroidX: null,
      centroidY: null,
      spreadX: null,
      spreadY: null,
      gapX: null,
      gapY: null,
    },
  }
}

describe('structureRuler', () => {
  it('recognizes curated ruler characters', () => {
    expect(isStructureRulerCharacter('日')).toBe(true)
    expect(isStructureRulerCharacter('測')).toBe(false)
  })

  it('builds a fixed ruler baseline from matched glyph samples', () => {
    const ruler = buildStructureRuler(
      ['口', '日', '目', '田', '一', '二', '永'].map((character) =>
        makeSample(character)
      ),
      bodyBox
    )

    expect(ruler?.sampleCount).toBe(7)
    expect(ruler?.baseline?.sides.left.framing?.count).toBe(7)
    expect(
      ruler?.groups.find((group) => group.id === 'enclosure')?.box
    ).toEqual({
      xMin: 50,
      xMax: 950,
      yMin: -80,
      yMax: 800,
      width: 900,
      height: 880,
    })
    expect(ruler?.missingCharacters).toContain('國')
  })
})
