import { describe, expect, it } from 'vitest'
import { buildRadarAdvice } from 'src/features/common/qualityCheck/utils/radarAdvice'
import type { RadarReason } from 'src/features/common/qualityCheck/utils/qualityRadar'

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

  it('describes framing symmetry offset without hitting the per-side path', () => {
    // 回歸：bearing:symmetryH 帶 bearing: 前綴，曾被逐側邊距分支
    // 攔截並以 'symmetryH' 查 BEARING_ACTIONS 而拋例外
    const advice = buildRadarAdvice(
      makeReason({
        key: 'bearing:symmetryH',
        label: '左右置中偏移',
        dimension: 'balance',
        value: 80,
        median: 0,
        p10: -10,
        p90: 10,
        zScore: 3.1,
      })
    )
    expect(advice.title).toContain('未視覺置中')
    expect(advice.title).toContain('偏右')
    // 建議平移量 = (80 − 0) / 2
    expect(advice.action).toContain('往左')
    expect(advice.action).toContain('40')
  })
})
