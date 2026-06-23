import { describe, expect, it } from 'vitest'
import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import { computeRadarFromSamples } from 'src/lib/qualityCheck/qualityRadar'

const bodyBox = { top: 880, bottom: -120, unitsPerEm: 1000 }

const makeSample = (
  character: string,
  bearing: number,
  id = character
): GlyphGeometrySample => {
  const bounds = {
    xMin: bearing,
    xMax: 1000 - bearing,
    yMin: bodyBox.bottom + bearing,
    yMax: bodyBox.top - bearing,
  }
  return {
    glyphId: `glyph-${id}`,
    glyphName: character,
    character,
    advance: 1000,
    bounds,
    sides: {
      left: { type: 'framing', bearing, coverage: 1 },
      right: { type: 'framing', bearing, coverage: 1 },
      top: { type: 'framing', bearing, coverage: 1 },
      bottom: { type: 'framing', bearing, coverage: 1 },
    },
    ink: {
      bounds,
      inkArea: 10000,
      faceArea:
        Math.max(0, bounds.xMax - bounds.xMin) *
        Math.max(0, bounds.yMax - bounds.yMin),
      inkToFaceRatio: null,
      inkToEmRatio: null,
      centroidX: null,
      centroidY: null,
      spreadX: null,
      spreadY: null,
    },
  }
}

describe('qualityRadar ruler stats', () => {
  it('uses fixed ruler stats for boundary advice when available', () => {
    const rulerBearings = [48, 49, 50, 51, 52, 49, 51, 50]
    const rulerChars = ['口', '日', '目', '田', '回', '因', '固', '国']
    const peerChars = [
      '測',
      '試',
      '編',
      '輯',
      '字',
      '形',
      '建',
      '議',
      '校',
      '準',
      '參',
      '照',
      '外',
      '框',
      '尺',
    ]
    const samples = [
      ...rulerChars.map((character, index) =>
        makeSample(character, rulerBearings[index])
      ),
      ...peerChars.map((character) => makeSample(character, 90)),
    ]

    const radar = computeRadarFromSamples(samples, bodyBox)
    const target = radar?.evaluationByGlyphId.get('glyph-測')
    const leftBearingReason = target?.reasons.find(
      (reason) => reason.key === 'bearing:left:framing'
    )

    expect(radar?.rulerStatsByKey.size).toBeGreaterThan(0)
    expect(leftBearingReason?.basis).toBe('ruler')
    expect(leftBearingReason?.median).toBe(50)
    expect(leftBearingReason?.zScore).toBeGreaterThan(2)
  })
})
