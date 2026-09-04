import { describe, expect, it } from 'vitest'
import { loadPyodide } from 'pyodide'
import { buildExportSfntBuffer } from '@/lib/fontFormats/fontBinaryFormat'
import { extractBinaryFeatures } from '@/lib/openTypeFeatures/extractBinaryFeatures'
import { parseFvarAxisTags } from '@/lib/openTypeFeatures/featureVariationsParser'
import { makeGlyph } from './openTypeFeatureTestHelpers'

const ADD_VARIATIONS_PYTHON = `
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._f_v_a_r import Axis
from fontTools.varLib.featureVars import addFeatureVariations

def kumiko_add_feature_variations(in_path, out_path):
    font = TTFont(in_path)
    fvar = newTable("fvar")
    axis = Axis()
    axis.axisTag = "wght"
    axis.minValue = 100
    axis.defaultValue = 400
    axis.maxValue = 900
    axis.axisNameID = 256
    fvar.axes = [axis]
    font["fvar"] = fvar
    addFeatureVariations(font, [([{"wght": (0.5, 1.0)}], {"a": "a.round"})])
    font.save(out_path)
    return {"ok": True}
`

describe('FeatureVariations import summary', () => {
  it(
    'summarizes axis conditions and substituted features',
    { timeout: 120_000 },
    async () => {
      const sfnt = buildExportSfntBuffer({
        fontData: { unitsPerEm: 1000 },
        glyphs: [
          makeGlyph('.notdef'),
          makeGlyph('a', '0061'),
          makeGlyph('a.round'),
        ],
        familyName: 'KumikoFeatureVariations',
      })

      const pyodide = await loadPyodide()
      await pyodide.loadPackage('fonttools')
      pyodide.runPython(ADD_VARIATIONS_PYTHON)
      pyodide.FS.writeFile('/tmp/fv-in.otf', new Uint8Array(sfnt))
      pyodide.runPython(
        `kumiko_add_feature_variations('/tmp/fv-in.otf', '/tmp/fv-out.otf')`
      )
      const outBytes = pyodide.FS.readFile('/tmp/fv-out.otf') as Uint8Array
      const buffer = outBytes.buffer.slice(
        outBytes.byteOffset,
        outBytes.byteOffset + outBytes.byteLength
      )

      expect(parseFvarAxisTags(buffer)).toEqual(['wght'])

      const state = extractBinaryFeatures(buffer, null, [
        '.notdef',
        'a',
        'a.round',
      ])
      const summaries = state.featureVariations ?? []
      expect(summaries).toHaveLength(1)
      expect(summaries[0].table).toBe('GSUB')
      const record = summaries[0].records[0]
      expect(record.conditions).toEqual([
        { axisIndex: 0, axisTag: 'wght', min: 0.5, max: 1 },
      ])
      expect(record.substitutions.length).toBeGreaterThan(0)
      expect(record.substitutions[0].featureTag).toBe('rvrn')
      expect(record.substitutions[0].alternateLookupCount).toBeGreaterThan(0)
    }
  )
})
