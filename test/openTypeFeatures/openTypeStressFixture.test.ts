import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { loadPyodide } from 'pyodide'

import { importBinaryFontFile } from 'src/lib/fontFormats/fontBinaryFormat'
import { FONTTOOLS_COMPILER_PYTHON } from 'src/lib/openTypeFeatures/fontToolsCompilerPython'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { shapeTextWithHarfBuzz } from 'src/lib/openTypeFeatures/shapeTextWithHarfBuzz'

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

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

const compileGeneratedFea = async (
  inputBuffer: ArrayBuffer,
  generatedFea: string
) => {
  const pyodide = await loadPyodide()
  await pyodide.loadPackage('fonttools')
  pyodide.runPython(FONTTOOLS_COMPILER_PYTHON)
  pyodide.FS.writeFile('/tmp/stress-in.otf', new Uint8Array(inputBuffer))
  pyodide.FS.writeFile('/tmp/stress-generated.fea', generatedFea)

  const result = pyodide.runPython(
    `kumiko_compile_fea('/tmp/stress-in.otf', '/tmp/stress-generated.fea', '/tmp/stress-out.otf', ["GSUB", "GPOS", "GDEF"])`
  ) as {
    toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
    destroy?: () => void
  }
  try {
    const compiled = result.toJs({ dict_converter: Object.fromEntries }) as {
      ok: boolean
      message: string
      rawCompilerOutput?: string
    }
    expect(compiled.ok, compiled.rawCompilerOutput).toBe(true)
    return toArrayBuffer(pyodide.FS.readFile('/tmp/stress-out.otf'))
  } finally {
    result.destroy?.()
  }
}

const shapeComparable = async (fontBuffer: ArrayBuffer, text: string) => {
  const result = await shapeTextWithHarfBuzz(fontBuffer, text, {
    features: ['calt=1', 'frac=1', 'kern=1', 'liga=1', 'mark=1', 'mkmk=1'],
    script: 'latn',
  })

  expect(result.ok).toBe(true)
  return result.glyphs
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
          lookupType: 'chainingContextPos',
          editable: true,
          rules: expect.arrayContaining([
            expect.objectContaining({ kind: 'contextualPositioning' }),
          ]),
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
        expect.objectContaining({ kind: 'contextualPositioning' }),
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

  it('preserves shaping behavior after generated FEA is rebuilt', async () => {
    const sourceBuffer = await readFile(STRESS_FIXTURE_URL)
    const sourceArrayBuffer = toArrayBuffer(sourceBuffer)
    const imported = await importBinaryFontFile(
      new File([sourceBuffer], 'KumikoOpenTypeStress.otf', {
        type: 'font/otf',
      })
    )
    const rebuiltBuffer = await compileGeneratedFea(
      sourceArrayBuffer,
      generateFea(imported.fontData.openTypeFeatures!).text
    )

    for (const text of ['fi', 'A-A', 'AV', 'A\u0301', 'A\u0301\u0300']) {
      expect(await shapeComparable(rebuiltBuffer, text)).toEqual(
        await shapeComparable(sourceArrayBuffer, text)
      )
    }

    expect(await shapeComparable(sourceArrayBuffer, 'fi')).toEqual([
      expect.objectContaining({ glyphId: 7 }),
    ])
    expect((await shapeComparable(sourceArrayBuffer, 'A-A'))[1]).toEqual(
      expect.objectContaining({ glyphId: 11 })
    )
    expect(
      (await shapeComparable(sourceArrayBuffer, 'AV'))[1].xAdvance
    ).toBeLessThan((await shapeComparable(sourceArrayBuffer, 'BV'))[1].xAdvance)
  }, 180000)
})
