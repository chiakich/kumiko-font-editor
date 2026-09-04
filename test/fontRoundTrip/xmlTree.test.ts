import { describe, expect, it } from 'vitest'

import {
  childrenNamed,
  findDescendant,
  firstChildNamed,
  parseXmlTree,
} from '@/lib/fontFormats/xmlTree'

// No DOMParser stub anywhere in this file on purpose: the parser must work
// where there is no DOM, which is the whole reason it exists.
describe('parseXmlTree', () => {
  it('reads elements, attributes and nesting', () => {
    const root = parseXmlTree(
      `<glyph name="A" format="2">
        <advance width="600"/>
        <outline>
          <contour>
            <point x="1" y="2" type="line"/>
          </contour>
        </outline>
      </glyph>`,
      'A_.glif'
    )

    expect(root.tag).toBe('glyph')
    expect(root.attrs).toEqual({ name: 'A', format: '2' })
    expect(firstChildNamed(root, 'advance')?.attrs.width).toBe('600')
    const contour = firstChildNamed(firstChildNamed(root, 'outline'), 'contour')
    expect(childrenNamed(contour, 'point')).toHaveLength(1)
  })

  it('skips the declaration, DOCTYPE and comments', () => {
    const root = parseXmlTree(
      `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- written by hand -->
<plist version="1.0"><dict><key>a</key><integer>1</integer></dict></plist>`,
      'metainfo.plist'
    )

    expect(root.tag).toBe('plist')
    expect(root.children[0].children.map((child) => child.tag)).toEqual([
      'key',
      'integer',
    ])
  })

  it('accepts both quote styles on attributes and the declaration', () => {
    const root = parseXmlTree(
      `<?xml version="1.0"?><glyph name='A' format="2"/>`,
      'A_.glif'
    )
    expect(root.attrs).toEqual({ name: 'A', format: '2' })
  })

  it('resolves the predefined entities and numeric references', () => {
    const root = parseXmlTree(
      `<dict><key>a&amp;b</key><string>&lt;tag&gt; &quot;q&quot; &apos;a&apos; &#26085; &#x672C;</string></dict>`,
      'lib.plist'
    )
    expect(root.children[0].text).toBe('a&b')
    expect(root.children[1].text).toBe(`<tag> "q" 'a' 日 本`)
  })

  it('keeps text exactly as written, newlines included', () => {
    const root = parseXmlTree(`<glyph><note>\nCR\n</note></glyph>`, 'C_R_.glif')
    expect(firstChildNamed(root, 'note')?.text).toBe('\nCR\n')
  })

  it('treats an empty element and a self-closing one alike', () => {
    const withPair = parseXmlTree(`<glyph><outline>\n  </outline></glyph>`, 'a')
    const selfClosed = parseXmlTree(`<glyph><outline/></glyph>`, 'b')
    expect(firstChildNamed(withPair, 'outline')?.children).toEqual([])
    expect(firstChildNamed(selfClosed, 'outline')?.children).toEqual([])
  })

  it('finds an element anywhere below', () => {
    const root = parseXmlTree(`<a><b><c id="x"/></b></a>`, 'a')
    expect(findDescendant(root, 'c')?.attrs.id).toBe('x')
    expect(findDescendant(root, 'zzz')).toBeNull()
  })

  it('rejects malformed input instead of guessing', () => {
    // DOMParser answers with a <parsererror> document rather than throwing, and
    // silently parsing garbage is how corrupt glyph data gets written back.
    expect(() => parseXmlTree('<glyph><outline></glyph>', 'a')).toThrow(
      /Malformed XML/
    )
    expect(() => parseXmlTree('<glyph>', 'a')).toThrow(/Malformed XML/)
    expect(() => parseXmlTree('not xml at all', 'a')).toThrow(/Malformed XML/)
    expect(() => parseXmlTree('<a/><b/>', 'a')).toThrow(/Malformed XML/)
  })
})
