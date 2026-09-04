import { describe, expect, it } from 'vitest'
import { canUseCanonicalUfoZipExport } from '@/features/common/fontExport/exportDraftPolicy'

describe('font export draft policy', () => {
  it('uses source-backed clean marking for UFO and designspace zip exports', () => {
    expect(canUseCanonicalUfoZipExport('ufo')).toBe(true)
    expect(canUseCanonicalUfoZipExport('designspace')).toBe(true)
    expect(canUseCanonicalUfoZipExport('glyphs')).toBe(false)
  })
})
