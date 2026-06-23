import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { importBinaryFontFile } from 'src/lib/fontFormats/fontBinaryFormat'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'

const STRESS_FIXTURE_URL = new URL(
  '../fixtures/otf/KumikoOpenTypeStress.otf',
  import.meta.url
)

const loadStressFixture = async () => {
  const buffer = await readFile(STRESS_FIXTURE_URL)
  return new File([buffer], 'KumikoOpenTypeStress.otf', {
    type: 'font/otf',
  })
}

describe('Kumiko synthetic OpenType stress fixture', () => {
  it('imports editable GSUB, GPOS, and GDEF coverage from the generated fixture', async () => {
    const imported = await importBinaryFontFile(await loadStressFixture())
    const state = imported.fontData.openTypeFeatures!

    expect(imported.fontData.glyphOrder).toEqual([
      '.notdef',
      'A',
      'A.alt',
      'B',
      'V',
      'f',
      'i',
      'f_i',
      'less',
      'exclam',
      'hyphen',
      'LIG',
      'one',
      'two',
      'one.numr',
      'two.numr',
      'slash',
      'acutecomb',
      'gravecomb',
    ])
    expect(state.features.map((feature) => feature.tag).sort()).toEqual([
      'aalt',
      'calt',
      'frac',
      'kern',
      'liga',
      'mark',
      'mkmk',
      'salt',
    ])
    expect(state.unsupportedLookups).toEqual([])
    expect(state.diagnostics ?? []).toEqual([])

    expect(state.lookups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lookupType: 'singleSubst',
          editable: true,
        }),
        expect.objectContaining({
          lookupType: 'ligatureSubst',
          editable: true,
        }),
        expect.objectContaining({
          lookupType: 'chainingContextSubst',
          editable: true,
          meta: expect.objectContaining({
            subtableFormats: expect.arrayContaining([3]),
          }),
        }),
        expect.objectContaining({
          lookupType: 'pairPos',
          editable: true,
        }),
        expect.objectContaining({
          lookupType: 'markToBasePos',
          editable: true,
        }),
        expect.objectContaining({
          lookupType: 'markToLigaturePos',
          editable: true,
        }),
        expect.objectContaining({
          lookupType: 'markToMarkPos',
          editable: true,
        }),
      ])
    )
    expect(state.lookups.flatMap((lookup) => lookup.rules)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'singleSubstitution' }),
        expect.objectContaining({ kind: 'ligatureSubstitution' }),
        expect.objectContaining({ kind: 'contextualSubstitution' }),
        expect.objectContaining({ kind: 'pairPositioning' }),
        expect.objectContaining({ kind: 'markToBase' }),
        expect.objectContaining({ kind: 'markToLigature' }),
        expect.objectContaining({ kind: 'markToMark' }),
      ])
    )
    expect(state.markClasses).toHaveLength(3)
    expect(state.gdef).toMatchObject({
      glyphClasses: {
        base: expect.arrayContaining(['A', 'A.alt', 'B', 'V']),
        ligature: ['f_i'],
        mark: ['acutecomb', 'gravecomb'],
      },
      ligatureCarets: [{ glyph: 'f_i', carets: [250] }],
    })
    expect(generateFea(state).text).toContain('feature calt')
  })
})
