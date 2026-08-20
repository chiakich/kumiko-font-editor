import 'fake-indexeddb/auto'

import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import {
  importUfoWorkspaceEntries,
  type UfoWorkspaceEntry,
} from 'src/lib/fontFormats/ufoFormat'
import { fontDataToKumikoGlyphRecordBatches } from 'src/lib/project/kumikoFontDataAdapter'

const testWindow = new Window()
globalThis.DOMParser ??= testWindow.DOMParser as typeof globalThis.DOMParser
globalThis.Node ??= testWindow.Node as typeof globalThis.Node
globalThis.Element ??= testWindow.Element as typeof globalThis.Element

const UFO_NAME = 'Quadratic-Regular.ufo'

const plist = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${body}
</plist>
`

// A TrueType-flavoured UFO: qcurve points, no com.kumiko settings in lib.plist.
const quadraticEntries = (): UfoWorkspaceEntry[] => [
  {
    relativePath: `${UFO_NAME}/metainfo.plist`,
    text: plist(
      '<dict><key>creator</key><string>org.fonttools.ufoLib</string><key>formatVersion</key><integer>3</integer></dict>'
    ),
  },
  {
    relativePath: `${UFO_NAME}/fontinfo.plist`,
    text: plist(
      '<dict><key>familyName</key><string>Quadratic</string><key>styleName</key><string>Regular</string><key>unitsPerEm</key><integer>1000</integer></dict>'
    ),
  },
  {
    relativePath: `${UFO_NAME}/layercontents.plist`,
    text: plist(
      '<array><array><string>public.default</string><string>glyphs</string></array></array>'
    ),
  },
  {
    relativePath: `${UFO_NAME}/glyphs/contents.plist`,
    text: plist(
      '<dict><key>A</key><string>A_.glif</string><key>space</key><string>space.glif</string><key>box</key><string>box.glif</string><key>B</key><string>B_.glif</string></dict>'
    ),
  },
  {
    relativePath: `${UFO_NAME}/glyphs/A_.glif`,
    text: `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="A" format="2">
  <advance width="600"/>
  <unicode hex="0041"/>
  <outline>
    <contour>
      <point x="100" y="0" type="qcurve"/>
      <point x="300" y="400"/>
      <point x="500" y="0" type="qcurve"/>
    </contour>
    <contour>
      <point x="150" y="50" type="qcurve"/>
      <point x="300" y="300"/>
      <point x="450" y="50" type="qcurve"/>
    </contour>
  </outline>
</glyph>
`,
  },
  // no outline at all
  {
    relativePath: `${UFO_NAME}/glyphs/space.glif`,
    text: `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="space" format="2">
  <advance width="250"/>
  <unicode hex="0020"/>
</glyph>
`,
  },
  // a single cubic glyph in an otherwise quadratic source — legal, and real
  // sources do carry a few converted glyphs like this
  {
    relativePath: `${UFO_NAME}/glyphs/B_.glif`,
    text: `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="B" format="2">
  <advance width="600"/>
  <unicode hex="0042"/>
  <outline>
    <contour>
      <point x="100" y="0" type="curve"/>
      <point x="200" y="300"/>
      <point x="400" y="300"/>
      <point x="500" y="0" type="curve"/>
    </contour>
  </outline>
</glyph>
`,
  },
  // straight lines only — compatible with either outline type
  {
    relativePath: `${UFO_NAME}/glyphs/box.glif`,
    text: `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="box" format="2">
  <advance width="600"/>
  <outline>
    <contour>
      <point x="100" y="0" type="line"/>
      <point x="500" y="0" type="line"/>
      <point x="500" y="400" type="line"/>
      <point x="100" y="400" type="line"/>
    </contour>
  </outline>
</glyph>
`,
  },
]

describe('quadratic UFO import', () => {
  it('infers a quadratic project outline type from the outlines', async () => {
    const imported = await importUfoWorkspaceEntries(quadraticEntries(), {
      title: 'Quadratic',
      sourceFolderName: UFO_NAME,
    })

    expect(imported.fontData.settings?.outlineType).toBe('quadratic')
  })

  it('serializes curve-less layers without an outline kind mismatch', async () => {
    const imported = await importUfoWorkspaceEntries(quadraticEntries(), {
      title: 'Quadratic',
      sourceFolderName: UFO_NAME,
    })

    const records = [
      ...fontDataToKumikoGlyphRecordBatches({
        projectId: 'quadratic-ufo',
        fontData: imported.fontData,
        updatedAt: 1,
      }),
    ].flat()
    const outlineKindOf = (glyphId: string) => {
      const record = records.find((entry) => entry.glyphId === glyphId)!
      return Object.values(record.layers)[0].outlineKind
    }

    expect(outlineKindOf('A')).toBe('quadratic')
    // curve-less layers follow the project instead of defaulting to cubic
    expect(outlineKindOf('space')).toBe('quadratic')
    expect(outlineKindOf('box')).toBe('quadratic')
    // a deviating glyph keeps its own kind rather than failing the import
    expect(outlineKindOf('B')).toBe('cubic')
  })
})
