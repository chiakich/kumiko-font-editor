import { describe, expect, it } from 'vitest'
import {
  getStylisticSetName,
  isStylisticSetTag,
  setStylisticSetName,
} from '@/features/common/projectControl/fontSettings/features/utils/featureParamsEdit'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

const state = (featureParams?: unknown) =>
  ({
    features: [{ id: 'f1', tag: 'ss01', isActive: true, featureParams }],
  }) as OpenTypeFeaturesState

describe('stylistic set params editing', () => {
  it('recognizes ss01–ss20 only', () => {
    expect(isStylisticSetTag('ss01')).toBe(true)
    expect(isStylisticSetTag('ss20')).toBe(true)
    expect(isStylisticSetTag('ss21')).toBe(false)
    expect(isStylisticSetTag('liga')).toBe(false)
  })

  it('sets and reads the menu name', () => {
    const next = setStylisticSetName(state(), 'f1', '圓點標點')
    expect(getStylisticSetName(next, 'f1')).toBe('圓點標點')
  })

  it('keeps localized names when editing the first entry', () => {
    const initial = state({
      kind: 'stylisticSet',
      names: [{ text: 'Old' }, { text: '舊', nameId: 257 }],
    })
    const next = setStylisticSetName(initial, 'f1', 'New')
    const params = next.features[0].featureParams
    expect(params?.kind === 'stylisticSet' && params.names).toEqual([
      { text: 'New' },
      { text: '舊', nameId: 257 },
    ])
  })

  it('drops the params block when the last name is cleared', () => {
    const initial = state({ kind: 'stylisticSet', names: [{ text: 'Only' }] })
    const next = setStylisticSetName(initial, 'f1', '  ')
    expect(next.features[0].featureParams).toBeUndefined()
  })
})

describe('character variant label editing', () => {
  it('validates cv tags', async () => {
    const { isCharacterVariantTag } =
      await import('@/features/common/projectControl/fontSettings/features/utils/featureParamsEdit')
    expect(isCharacterVariantTag('cv01')).toBe(true)
    expect(isCharacterVariantTag('cv99')).toBe(true)
    expect(isCharacterVariantTag('cv00')).toBe(false)
    expect(isCharacterVariantTag('ss01')).toBe(false)
  })
})
