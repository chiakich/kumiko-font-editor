import { describe, expect, it } from 'vitest'
import {
  buildDisabledFeatureList,
  buildShapingFeatureList,
  isFeatureOnByDefault,
  listPreviewFeatureToggles,
} from '@/features/common/projectControl/fontSettings/features/utils/shapingPreviewModel'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

const state = (partial: Partial<OpenTypeFeaturesState>) =>
  partial as OpenTypeFeaturesState

describe('preview feature toggles', () => {
  it('lists IR features and raw snippet features once each', () => {
    const toggles = listPreviewFeatureToggles(
      state({
        features: [
          { id: 'f1', tag: 'liga' },
          { id: 'f2', tag: 'ss01' },
        ] as OpenTypeFeaturesState['features'],
        rawFeatureSnippets: [
          {
            id: 's1',
            kind: 'feature',
            tag: 'ss01',
            text: 'feature ss01 {} ss01;',
          },
          {
            id: 's2',
            kind: 'feature',
            tag: 'vert',
            text: 'feature vert {} vert;',
          },
          {
            id: 's3',
            kind: 'prefix',
            text: 'feature kern {\n  pos A B -20;\n} kern;',
          },
          {
            id: 's4',
            kind: 'feature',
            tag: 'salt',
            text: 'feature salt {} salt;',
            disabled: true,
          },
        ],
      })
    )

    expect(toggles.map((toggle) => toggle.tag)).toEqual([
      'kern',
      'liga',
      'ss01',
      'vert',
    ])
    expect(toggles.find((toggle) => toggle.tag === 'liga')?.defaultOn).toBe(
      true
    )
    expect(toggles.find((toggle) => toggle.tag === 'ss01')?.defaultOn).toBe(
      false
    )
  })

  it('returns nothing without a feature state', () => {
    expect(listPreviewFeatureToggles(undefined)).toEqual([])
  })
})

describe('shaping feature lists', () => {
  const toggles = [
    { tag: 'liga', defaultOn: true },
    { tag: 'ss01', defaultOn: false },
  ]

  it('says only what deviates from the defaults', () => {
    expect(buildShapingFeatureList(toggles, {})).toEqual([])
    expect(buildShapingFeatureList(toggles, { liga: false })).toEqual(['-liga'])
    expect(buildShapingFeatureList(toggles, { ss01: true })).toEqual(['+ss01'])
  })

  it('forces every feature off for the before run', () => {
    expect(buildDisabledFeatureList(toggles)).toEqual(['-liga', '-ss01'])
  })
})

describe('harfbuzz default set', () => {
  it('knows kern and liga are on, stylistic sets are off', () => {
    expect(isFeatureOnByDefault('kern')).toBe(true)
    expect(isFeatureOnByDefault('ss07')).toBe(false)
  })

  it('turns horizontal-only features off and vertical features on for ttb', () => {
    expect(isFeatureOnByDefault('kern', 'ttb')).toBe(false)
    expect(isFeatureOnByDefault('liga', 'ttb')).toBe(false)
    expect(isFeatureOnByDefault('vert', 'ttb')).toBe(true)
    // hb-ot-shape enables only vert for vertical; vrt2/vkrn need an explicit
    // toggle, so their chips must start off to make +vkrn emittable.
    expect(isFeatureOnByDefault('vkrn', 'ttb')).toBe(false)
    expect(isFeatureOnByDefault('vrt2', 'ttb')).toBe(false)
    // Direction-independent defaults stay on.
    expect(isFeatureOnByDefault('ccmp', 'ttb')).toBe(true)
    expect(isFeatureOnByDefault('mark', 'ttb')).toBe(true)
  })

  it('keeps horizontal-only features on for ltr', () => {
    for (const tag of ['calt', 'clig', 'curs', 'dist', 'liga', 'rclt']) {
      expect(isFeatureOnByDefault(tag)).toBe(true)
    }
  })
})
