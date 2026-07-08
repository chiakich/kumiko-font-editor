import { describe, expect, it } from 'vitest'
import {
  buildGlyphsFeatureFieldsFromSnippets,
  buildRawFeatureSnippetsFromGlyphsDocument,
} from 'src/lib/fontFormats/glyphsFeatures'
import { buildFontDataFromGlyphsDocument } from 'src/lib/fontFormats/glyphsImport'
import { createBaseGlyphsDocument } from 'src/lib/fontFormats/glyphsExport'
import { getRawFeatureText } from 'src/lib/openTypeFeatures/rawFeatureSnippets'
import type { GlyphsDocument } from 'src/lib/fontFormats/glyphsDocument'

const GLYPHS_DOCUMENT: GlyphsDocument = {
  familyName: 'Test',
  unitsPerEm: 1000,
  fontMaster: [{ id: 'm01' }],
  glyphs: [],
  classes: [{ automatic: 1, name: 'Lower', code: 'a b c' }],
  featurePrefixes: [
    { name: 'Languagesystems', code: 'languagesystem DFLT dflt;\n' },
  ],
  features: [
    { name: 'liga', code: 'sub f i by f_i;\n', automatic: 1 },
    { tag: 'ss01', code: 'sub a by a.ss01;\n', disabled: 1 },
  ],
}

describe('Glyphs feature import/export', () => {
  it('converts classes, prefixes, and features into raw feature snippets', () => {
    const snippets = buildRawFeatureSnippetsFromGlyphsDocument(GLYPHS_DOCUMENT)

    expect(
      snippets.map((snippet) => [snippet.kind, snippet.tag ?? snippet.name])
    ).toEqual([
      ['prefix', '@Lower'],
      ['prefix', 'Languagesystems'],
      ['feature', 'liga'],
      ['feature', 'ss01'],
    ])
    expect(snippets[0].text).toBe('@Lower = [a b c];')
    expect(snippets[2].text).toBe('feature liga {\n  sub f i by f_i;\n} liga;')
    expect(snippets[2].meta).toMatchObject({ glyphsAutomatic: true })
    expect(snippets[3].disabled).toBe(true)
  })

  it('imports Glyphs features into openTypeFeatures with classification', () => {
    const fontData = buildFontDataFromGlyphsDocument(GLYPHS_DOCUMENT)
    const state = fontData.openTypeFeatures

    expect(state).toBeDefined()
    expect(state?.rawFeatureSnippets).toHaveLength(4)
    expect(state?.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      kind: 'glyphs-fea',
      origin: 'glyphs-import',
    })
    // liga classifies into the model; the disabled ss01 stays out.
    expect(state?.features.map((feature) => feature.tag)).toContain('liga')
    expect(state?.features.map((feature) => feature.tag)).not.toContain('ss01')
    // The raw editor still sees the disabled snippet text.
    expect(state ? getRawFeatureText(state) : '').toContain('feature ss01 {')
    expect(
      state ? getRawFeatureText(state, { includeDisabled: false }) : ''
    ).not.toContain('feature ss01 {')
  })

  it('round-trips snippets back into Glyphs document fields on export', () => {
    const fontData = buildFontDataFromGlyphsDocument(GLYPHS_DOCUMENT)
    const fields = buildGlyphsFeatureFieldsFromSnippets(
      fontData.openTypeFeatures
    )

    expect(fields?.classes).toEqual([
      { automatic: 1, name: 'Lower', code: 'a b c' },
    ])
    expect(fields?.featurePrefixes).toEqual([
      { name: 'Languagesystems', code: 'languagesystem DFLT dflt;\n' },
    ])
    expect(fields?.features).toEqual([
      { automatic: 1, name: 'liga', code: 'sub f i by f_i;\n' },
      { disabled: 1, name: 'ss01', code: 'sub a by a.ss01;\n' },
    ])
  })

  it('uses snippet-derived feature fields in the exported base document', () => {
    const fontData = buildFontDataFromGlyphsDocument(GLYPHS_DOCUMENT)
    const document = createBaseGlyphsDocument(fontData, {
      familyName: 'Test',
      features: [{ name: 'stale', code: 'sub x by y;' }],
    })

    expect(
      (document.features ?? []).map(
        (entry) => (entry as { name?: string }).name
      )
    ).toEqual(['liga', 'ss01'])
  })

  it('falls back to project metadata when there are no snippets', () => {
    const document = createBaseGlyphsDocument(
      { glyphs: {}, unitsPerEm: 1000 } as never,
      { familyName: 'Test', features: [{ name: 'kern', code: 'pos A V -10;' }] }
    )
    expect(document.features).toEqual([{ name: 'kern', code: 'pos A V -10;' }])
  })
})
