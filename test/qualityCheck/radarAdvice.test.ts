import { describe, expect, it } from 'vitest'
import { buildRadarAdvice } from 'src/features/common/qualityCheck/radarAdvice'
import type { RadarReason } from 'src/features/common/qualityCheck/qualityRadar'

const makeReason = (overrides: Partial<RadarReason>): RadarReason => ({
  key: 'bearing:top:branching',
  label: '頂部樹枝筆畫邊距',
  dimension: 'boundary',
  format: 'units',
  value: 153,
  median: 80,
  p10: 60,
  p90: 100,
  zScore: 2.8,
  ...overrides,
})

describe('buildRadarAdvice', () => {
  it('describes excessive top bearing with direction and delta', () => {
    const advice = buildRadarAdvice(makeReason({}))
    expect(advice.title).toContain('頂部')
    expect(advice.title).toContain('多')
    expect(advice.action).toContain('往上延伸')
    expect(advice.action).toContain('73')
    expect(advice.detail).toContain('60–100')
  })

  it('flips direction for negative z-score', () => {
    const advice = buildRadarAdvice(makeReason({ value: 20, zScore: -2.6 }))
    expect(advice.title).toContain('少')
    expect(advice.action).toContain('往下收')
  })

  it('maps severity from z-score magnitude', () => {
    expect(buildRadarAdvice(makeReason({ zScore: 2.1 })).severity).toBe(
      'notice'
    )
    expect(buildRadarAdvice(makeReason({ zScore: -3.2 })).severity).toBe(
      'warning'
    )
  })

  it('describes size features relative to similar-complexity glyphs', () => {
    const advice = buildRadarAdvice(
      makeReason({
        key: 'face:widthRatio',
        format: 'percent',
        value: 0.92,
        median: 0.8,
        p10: 0.76,
        p90: 0.84,
        zScore: 2.4,
      })
    )
    expect(advice.title).toContain('偏寬')
    expect(advice.detail).toContain('複雜度相近')
    expect(advice.detail).toContain('76.0%–84.0%')
  })

  it('describes centroid imbalance with a corrective direction', () => {
    const advice = buildRadarAdvice(
      makeReason({
        key: 'balance:centroidX',
        format: 'percent',
        value: 0.04,
        median: 0,
        p10: -0.01,
        p90: 0.01,
        zScore: 2.7,
      })
    )
    expect(advice.title).toContain('偏右')
    expect(advice.action).toContain('往左')
  })
})
