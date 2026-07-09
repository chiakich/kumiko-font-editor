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

describe('qualityRadar perceptual scale floor', () => {
  it('ignores imperceptible deviations in ultra-tight populations, still flags real ones', () => {
    // 高度一致的母體：邊距 48–52，MAD 遠低於感知下限
    const characters = '口日目田回因固国測試編輯字形建議校準參照外框'
    const samples = [...characters].map((character, index) =>
      makeSample(character, 48 + (index % 5))
    )
    // 8 units 的偏差在字身框尺度下難以目視分辨，不該有建議
    samples.push(makeSample('近', 58))
    // 70 units 的偏差是真問題
    samples.push(makeSample('遠', 120))

    const radar = computeRadarFromSamples(samples, bodyBox)!
    const near = radar.evaluationByGlyphId.get('glyph-近')!
    const far = radar.evaluationByGlyphId.get('glyph-遠')!

    expect(radar.suspects.some((entry) => entry.glyphId === 'glyph-近')).toBe(
      false
    )
    expect(
      near.reasons.filter((reason) => reason.key.startsWith('bearing:'))
    ).toEqual([])
    expect(radar.suspects.some((entry) => entry.glyphId === 'glyph-遠')).toBe(
      true
    )
    expect(
      far.reasons.some((reason) => reason.key.startsWith('bearing:'))
    ).toBe(true)
  })
})
