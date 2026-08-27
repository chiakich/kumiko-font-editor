import { describe, expect, it } from 'vitest'
import { loadPyodide } from 'pyodide'
import { parseLegacyKernPairs } from 'src/lib/fontFormats/legacyKernImport'
import {
  buildExportSfntBuffer,
  importBinaryFontFile,
} from 'src/lib/fontFormats/fontBinaryFormat'
import { makeGlyph } from '../openTypeFeatures/openTypeFeatureTestHelpers'

describe('parseLegacyKernPairs', () => {
  it('maps index pairs to glyph selectors and drops zero or missing entries', () => {
    const pairs = parseLegacyKernPairs(
      { '1,2': -80, '2,1': 0, '9,1': -40, bogus: -10 },
      ['.notdef', 'A', 'V']
    )
    expect(pairs).toEqual([
      {
        id: 'kern_legacy_A_V',
        left: { kind: 'glyph', glyph: 'A' },
        right: { kind: 'glyph', glyph: 'V' },
        value: -80,
      },
    ])
  })
})

const ADD_KERN_PYTHON = `
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._k_e_r_n import KernTable_format_0

def kumiko_add_legacy_kern(in_path, out_path):
    font = TTFont(in_path)
    subtable = KernTable_format_0(apple=False)
    subtable.coverage = 1
    subtable.format = 0
    subtable.version = 0
    subtable.kernTable = {("A", "V"): -80, ("V", "A"): -30}
    kern = newTable("kern")
    kern.version = 0
    kern.kernTables = [subtable]
    font["kern"] = kern
    font.save(out_path)
    return {"ok": True}
`

describe('legacy kern table import', () => {
  it(
    'converts kern-table pairs into project kerning when no GPOS kern exists',
    { timeout: 120_000 },
    async () => {
      const sfnt = buildExportSfntBuffer({
        fontData: { unitsPerEm: 1000 },
        glyphs: [
          makeGlyph('.notdef'),
          makeGlyph('A', '0041'),
          makeGlyph('V', '0056'),
        ],
        familyName: 'KumikoLegacyKern',
      })

      const pyodide = await loadPyodide()
      await pyodide.loadPackage('fonttools')
      pyodide.runPython(ADD_KERN_PYTHON)
      pyodide.FS.writeFile('/tmp/legacy-in.otf', new Uint8Array(sfnt))
      pyodide.runPython(
        `kumiko_add_legacy_kern('/tmp/legacy-in.otf', '/tmp/legacy-out.otf')`
      )
      const outBytes = pyodide.FS.readFile('/tmp/legacy-out.otf') as Uint8Array

      const imported = await importBinaryFontFile(
        new File([new Uint8Array(outBytes)], 'legacy.otf', {
          type: 'font/otf',
        })
      )
      const pairs = imported.fontData.kerningPairs ?? []
      expect(pairs).toHaveLength(2)
      expect(pairs).toContainEqual({
        id: 'kern_legacy_A_V',
        left: { kind: 'glyph', glyph: 'A' },
        right: { kind: 'glyph', glyph: 'V' },
        value: -80,
      })
    }
  )
})
