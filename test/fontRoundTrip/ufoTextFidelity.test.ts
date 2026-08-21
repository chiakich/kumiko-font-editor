import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import {
  glyphRecordToLayerContent,
  parseGlifText,
  parseXmlPlist,
  pathToUfoContour,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontFormats/ufoFormat'
import { detectUfoTextStyle } from 'src/lib/fontFormats/ufoTextStyle'
import type { UfoGlyphRecord } from 'src/lib/fontFormats/ufoTypes'

const testWindow = new Window()
globalThis.DOMParser ??= testWindow.DOMParser as typeof globalThis.DOMParser
globalThis.Node ??= testWindow.Node as typeof globalThis.Node
globalThis.Element ??= testWindow.Element as typeof globalThis.Element

const UFO_ROOT = join(
  process.cwd(),
  'test/fixtures/ufo/OpenSourceFont-Light.ufo'
)

const asRecord = (text: string, fileName: string): UfoGlyphRecord => ({
  ...parseGlifText(text, fileName),
  projectId: 'fidelity',
  ufoId: 'Font.ufo',
  layerId: 'public.default',
  dirty: false,
  dirtyIndex: 0,
  updatedAt: 1,
})

const rewrite = (
  text: string,
  fileName: string,
  style = detectUfoTextStyle({})
): string => serializeGlifRecord(asRecord(text, fileName), style)

// What sync actually does: the record becomes canonical PathData and is written
// back from there. Testing only parse → serialize missed that the export
// rotated every contour that began with off-curve points, which rewrote 12,600
// files in a real repository.
const rewriteThroughCanonicalPaths = (
  text: string,
  fileName: string,
  style = detectUfoTextStyle({})
): string => {
  const record = asRecord(text, fileName)
  const content = glyphRecordToLayerContent(record, () => null)
  return serializeGlifRecord(
    { ...record, contours: content.paths.map(pathToUfoContour) },
    style
  )
}

// Sync compares blob OIDs, so re-writing an untouched file with different
// whitespace reads as a change in every glyph. These are the two producer
// styles Kumiko actually meets.
const GLYPHS_STYLE_GLIF = `<?xml version='1.0' encoding='UTF-8'?>
<glyph name="A" format="2">
  <advance width="1024" height="1024" />
  <unicode hex="0041" />
  <note>
hand written
</note>
  <anchor x="371" y="0" name="bottom" identifier="a0" />
  <outline>
    <contour>
      <point x="75" y="-6" />
      <point x="49" y="21" />
      <point x="49" y="40" type="qcurve" smooth="yes" />
      <point x="309" y="662" type="line" />
    </contour>
    <component base="acute" xOffset="10" yOffset="20" />
  </outline>
  <lib>
    <dict>
      <key>com.schriftgestaltung.Glyphs.lastChange</key>
      <string>2022-12-09 11:01:52 +0000</string>
    </dict>
  </lib>
</glyph>
`

// A blank glyph that still carries the empty element, as Glyphs writes it.
const GLYPHS_STYLE_BLANK = `<?xml version='1.0' encoding='UTF-8'?>
<glyph name="space" format="2">
  <advance width="300" />
  <unicode hex="0020" />
  <outline>
  </outline>
</glyph>
`

const GLYPHS_STYLE_PLIST = `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>copyright</key>
    <string>distributed on an &quot;AS IS&quot; BASIS</string>
    <key>italicAngle</key>
    <integer>0</integer>
    <key>openTypeOS2Panose</key>
    <array>
      <integer>2</integer>
      <integer>11</integer>
    </array>
    <key>styleMapStyleName</key>
    <false/>
  </dict>
</plist>
`

describe('UFO text fidelity: Glyphs style', () => {
  const style = detectUfoTextStyle({
    glif: GLYPHS_STYLE_GLIF,
    plist: GLYPHS_STYLE_PLIST,
  })

  it('detects the style the source was written in', () => {
    expect(style).toEqual({
      xmlQuote: "'",
      selfClosingSpace: true,
      plistIndent: '  ',
      plistIndentRoot: true,
      escapeQuotesInText: true,
    })
  })

  it('rewrites a glif byte for byte', () => {
    expect(rewrite(GLYPHS_STYLE_GLIF, 'A_.glif', style)).toBe(GLYPHS_STYLE_GLIF)
  })

  it('keeps the node order a contour was written with', () => {
    // This contour starts with two off-curve points, as Glyphs writes them.
    expect(
      rewriteThroughCanonicalPaths(GLYPHS_STYLE_GLIF, 'A_.glif', style)
    ).toBe(GLYPHS_STYLE_GLIF)
  })

  it('keeps the empty outline element of a blank glyph', () => {
    expect(rewrite(GLYPHS_STYLE_BLANK, 'space.glif', style)).toBe(
      GLYPHS_STYLE_BLANK
    )
  })

  it('rewrites a plist byte for byte', () => {
    expect(serializeXmlPlist(parseXmlPlist(GLYPHS_STYLE_PLIST), style)).toBe(
      GLYPHS_STYLE_PLIST
    )
  })
})

describe('UFO text fidelity: fontTools style', () => {
  const readFixture = (name: string) => readFile(join(UFO_ROOT, name), 'utf8')

  it('rewrites every glif in the fixture byte for byte', async () => {
    const style = detectUfoTextStyle({
      glif: await readFixture('glyphs/A_.glif'),
      plist: await readFixture('fontinfo.plist'),
    })
    const names = (await readdir(join(UFO_ROOT, 'glyphs'))).filter((name) =>
      name.endsWith('.glif')
    )
    expect(names.length).toBeGreaterThan(10)

    for (const name of names) {
      const raw = await readFixture(`glyphs/${name}`)
      expect(rewrite(raw, name, style), name).toBe(raw)
      expect(rewriteThroughCanonicalPaths(raw, name, style), name).toBe(raw)
    }
  })

  it('rewrites the font-level plists byte for byte', async () => {
    const style = detectUfoTextStyle({
      glif: await readFixture('glyphs/A_.glif'),
      plist: await readFixture('fontinfo.plist'),
    })
    for (const name of [
      'metainfo.plist',
      'fontinfo.plist',
      'lib.plist',
      'groups.plist',
      'kerning.plist',
      'glyphs/contents.plist',
    ]) {
      const raw = await readFixture(name)
      expect(serializeXmlPlist(parseXmlPlist(raw), style), name).toBe(raw)
    }
  })
})

describe('UFO text fidelity: defaults', () => {
  it('writes fontTools style when nothing is known about the source', () => {
    const out = serializeXmlPlist({ a: 1 })
    expect(out.split('\n')[0]).toBe("<?xml version='1.0' encoding='UTF-8'?>")
    expect(out).toContain('\n<dict>\n\t<key>a</key>')
  })

  it('never pads self-closing tags inside a plist', () => {
    expect(
      serializeXmlPlist({ flag: false }, { selfClosingSpace: true })
    ).toContain('<false/>')
  })
})
