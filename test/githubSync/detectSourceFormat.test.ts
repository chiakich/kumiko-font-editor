import { describe, expect, it } from 'vitest'
import {
  detectSourceFormats,
  hasSupportedSourceFormat,
} from '@/lib/fontFormats/formatAdapter/detectSourceFormat'

describe('source format detection', () => {
  it('finds UFO trees at the repo root', () => {
    expect(
      detectSourceFormats([
        'Kumiko.ufo/fontinfo.plist',
        'Kumiko.ufo/glyphs/A_.glif',
        'README.md',
      ])
    ).toEqual([{ id: 'ufo', root: '', label: 'UFO' }])
  })

  it('finds UFO trees nested in a sources directory', () => {
    expect(
      detectSourceFormats(['sources/Light.ufo/fontinfo.plist']).map(
        (found) => found.root
      )
    ).toEqual(['sources'])
  })

  it('finds a glyphspackage and names its root', () => {
    expect(
      detectSourceFormats([
        'Family.glyphspackage/fontinfo.plist',
        'Family.glyphspackage/glyphs/A_.glyph',
      ])
    ).toEqual([
      {
        id: 'glyphspackage',
        root: 'Family.glyphspackage',
        label: 'Family.glyphspackage (Glyphs package)',
      },
    ])
  })

  it('reports both when a repo carries UFO and glyphspackage', () => {
    const found = detectSourceFormats([
      'sources/Light.ufo/fontinfo.plist',
      'sources/Family.glyphspackage/fontinfo.plist',
    ])
    expect(found.map((entry) => entry.id).sort()).toEqual([
      'glyphspackage',
      'ufo',
    ])
  })

  it('reports nothing for a repo with no source tree', () => {
    expect(detectSourceFormats(['README.md', 'build.py'])).toEqual([])
    expect(hasSupportedSourceFormat(['README.md'])).toBe(false)
  })

  it('does not mistake a similarly named directory for a source tree', () => {
    expect(detectSourceFormats(['notaufo/glyphs/A.glif'])).toEqual([])
    expect(detectSourceFormats(['Family.glyphspackages/x.glyph'])).toEqual([])
  })
})
