import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRadarReferenceData } from '@/lib/qualityCheck/radarReferenceData'

const datasetPath =
  'public/quality-reference/noto-sans-cjk-tc-regular-radar-residuals.json'

describe('parseRadarReferenceData', () => {
  it('loads the committed Noto Sans CJK TC residual dataset', () => {
    const parsed = parseRadarReferenceData(
      JSON.parse(readFileSync(datasetPath, 'utf-8'))
    )

    expect(parsed?.source).toBe('Noto Sans CJK TC Regular')
    expect(parsed?.defaultConfidence).toBe(0.75)
    expect(
      Object.keys(parsed?.residualsByCharacter ?? {}).length
    ).toBeGreaterThan(20000)

    for (const character of ['人', '永', '中']) {
      expect(parsed?.residualsByCharacter[character]).toEqual(
        expect.objectContaining({
          'face:widthRatio': expect.any(Number),
          'face:heightRatio': expect.any(Number),
          'balance:centroidX': expect.any(Number),
          'balance:centroidY': expect.any(Number),
        })
      )
    }
    expect(parsed?.residualsByCharacter['口']).toEqual(
      expect.objectContaining({
        'balance:centroidX': expect.any(Number),
        'balance:centroidY': expect.any(Number),
      })
    )
  })

  it('filters malformed characters, unknown features, and invalid residuals', () => {
    const parsed = parseRadarReferenceData({
      source: 'Fixture',
      defaultConfidence: 0.5,
      residualsByCharacter: {
        人: {
          'face:widthRatio': 0.12,
          'balance:centroidY': { value: -0.03, confidence: 0.8 },
          'ink:toEm': 0.9,
        },
        口口: {
          'face:widthRatio': 0.1,
        },
        永: {
          'face:heightRatio': Number.NaN,
        },
      },
    })

    expect(parsed).toEqual({
      source: 'Fixture',
      defaultConfidence: 0.5,
      residualsByCharacter: {
        人: {
          'face:widthRatio': 0.12,
          'balance:centroidY': { value: -0.03, confidence: 0.8 },
        },
      },
    })
  })
})
