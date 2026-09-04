import { describe, expect, it } from 'vitest'
import { createGlyphsPackageFormatAdapter } from '@/lib/fontFormats/formatAdapter/glyphsPackageFormatAdapter'
import { entityKey } from '@/lib/fontFormats/formatAdapter/types'

const adapter = createGlyphsPackageFormatAdapter({
  root: 'Family.glyphspackage',
  fileNames: { A: 'A_.glyph', 一: 'uni4E00.glyph' },
})

const ownerKey = (path: string) => {
  const entity = adapter.entityOwning(path)
  return entity ? entityKey(entity) : null
}

describe('glyphspackage ownership', () => {
  it('maps package-level files to their entity', () => {
    expect(ownerKey('Family.glyphspackage/fontinfo.plist')).toBe('font:info')
    expect(ownerKey('Family.glyphspackage/order.plist')).toBe('font:order')
  })

  it('resolves glyph files through the name map', () => {
    expect(ownerKey('Family.glyphspackage/glyphs/A_.glyph')).toBe('glyph:A')
    expect(ownerKey('Family.glyphspackage/glyphs/uni4E00.glyph')).toBe(
      'glyph:一'
    )
  })

  it('falls back to the file stem for glyphs only the remote knows', () => {
    expect(ownerKey('Family.glyphspackage/glyphs/B_.glyph')).toBe('glyph:B_')
  })

  it('disowns UI state and anything outside the package', () => {
    expect(ownerKey('Family.glyphspackage/UIState.plist')).toBeNull()
    expect(ownerKey('README.md')).toBeNull()
    expect(ownerKey('Other.glyphspackage/fontinfo.plist')).toBeNull()
    expect(ownerKey('Family.glyphspackage/glyphs/nested/A_.glyph')).toBeNull()
    expect(ownerKey('Family.glyphspackage/glyphs/notes.txt')).toBeNull()
  })

  it('declares UIState as ignored rather than merely unowned', () => {
    expect(adapter.ignoredPaths).toContain('Family.glyphspackage/UIState.plist')
  })

  it('round-trips entity to paths and back', () => {
    for (const path of [
      'Family.glyphspackage/fontinfo.plist',
      'Family.glyphspackage/order.plist',
      'Family.glyphspackage/glyphs/A_.glyph',
    ]) {
      const entity = adapter.entityOwning(path)
      expect(entity).not.toBeNull()
      expect(adapter.pathsOwnedBy(entity!)).toContain(path)
    }
  })

  it('puts every master of a glyph in one file', () => {
    // Unlike UFO, a .glyph carries all masters, so one entity owns one path.
    expect(adapter.pathsOwnedBy({ kind: 'glyph', name: 'A' })).toEqual([
      'Family.glyphspackage/glyphs/A_.glyph',
    ])
  })

  it('treats the order file as derived, like UFO does', () => {
    expect(adapter.mergePolicy({ kind: 'font', part: 'order' })).toBe(
      'setMerge'
    )
    expect(adapter.mergePolicy({ kind: 'glyph', name: 'A' })).toBe('atomic')
  })

  it('has no designspace of its own', () => {
    expect(adapter.pathsOwnedBy({ kind: 'font', part: 'designspace' })).toEqual(
      []
    )
  })
})
