import { describe, expect, it } from 'vitest'
import { createUfoFormatAdapter } from '@/lib/fontFormats/formatAdapter/ufoFormatAdapter'
import { entityKey } from '@/lib/fontFormats/formatAdapter/types'

const adapter = createUfoFormatAdapter({
  relativePath: 'Kumiko.ufo',
  glyphDir: 'glyphs',
  designspacePath: 'Family.designspace',
  contents: { A: 'A_.glif', 一: 'uni4E00.glif' },
})

const ownerKey = (path: string) => {
  const entity = adapter.entityOwning(path)
  return entity ? entityKey(entity) : null
}

describe('UFO format adapter ownership', () => {
  it('maps font-level files to their owning entity', () => {
    expect(ownerKey('Kumiko.ufo/fontinfo.plist')).toBe('font:info')
    expect(ownerKey('Kumiko.ufo/metainfo.plist')).toBe('font:info')
    expect(ownerKey('Kumiko.ufo/lib.plist')).toBe('font:info')
    expect(ownerKey('Kumiko.ufo/layercontents.plist')).toBe('font:info')
    expect(ownerKey('Kumiko.ufo/groups.plist')).toBe('font:kerning')
    expect(ownerKey('Kumiko.ufo/kerning.plist')).toBe('font:kerning')
    expect(ownerKey('Kumiko.ufo/features.fea')).toBe('font:features')
    expect(ownerKey('Kumiko.ufo/glyphs/contents.plist')).toBe('font:order')
    expect(ownerKey('Family.designspace')).toBe('font:designspace')
  })

  it('resolves glyph files through the contents map', () => {
    expect(ownerKey('Kumiko.ufo/glyphs/A_.glif')).toBe('glyph:A')
    expect(ownerKey('Kumiko.ufo/glyphs/uni4E00.glif')).toBe('glyph:一')
  })

  it('falls back to the file stem for glyphs only the remote knows', () => {
    expect(ownerKey('Kumiko.ufo/glyphs/B_.glif')).toBe('glyph:B_')
  })

  it('disowns paths outside the source tree', () => {
    expect(ownerKey('README.md')).toBeNull()
    expect(ownerKey('Other.ufo/fontinfo.plist')).toBeNull()
    expect(ownerKey('Kumiko.ufo/glyphs/nested/A_.glif')).toBeNull()
    expect(ownerKey('Kumiko.ufo/glyphs/notes.txt')).toBeNull()
    expect(ownerKey('Kumiko.ufo/data/org.example.plist')).toBeNull()
  })

  it('round-trips entity to paths and back', () => {
    for (const path of [
      'Kumiko.ufo/fontinfo.plist',
      'Kumiko.ufo/glyphs/contents.plist',
      'Kumiko.ufo/glyphs/A_.glif',
      'Family.designspace',
    ]) {
      const entity = adapter.entityOwning(path)
      expect(entity).not.toBeNull()
      expect(adapter.pathsOwnedBy(entity!)).toContain(path)
    }
  })

  it('groups both kerning files under one entity', () => {
    expect(adapter.pathsOwnedBy({ kind: 'font', part: 'kerning' })).toEqual([
      'Kumiko.ufo/groups.plist',
      'Kumiko.ufo/kerning.plist',
    ])
  })

  it('reports no designspace path when the project has none', () => {
    const flat = createUfoFormatAdapter({
      relativePath: 'Kumiko.ufo',
      glyphDir: 'glyphs',
    })
    expect(flat.pathsOwnedBy({ kind: 'font', part: 'designspace' })).toEqual([])
    expect(flat.entityOwning('Family.designspace')).toBeNull()
  })
})
