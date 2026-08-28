import { describe, expect, it } from 'vitest'
import { loadPyodide } from 'pyodide'
import { buildExportSfntBuffer } from 'src/lib/fontFormats/fontBinaryFormat'
import { FONTTOOLS_COMPILER_PYTHON } from 'src/lib/openTypeFeatures/fontToolsCompilerPython'
import { synthesizeKerningFea } from 'src/lib/openTypeFeatures/synthesizeKerning'
import { shapeTextWithHarfBuzz } from 'src/lib/openTypeFeatures/shapeTextWithHarfBuzz'
import { makeGlyph } from './openTypeFeatureTestHelpers'
import type { KerningPair } from 'src/store/types'

const pair = (
  left: string,
  right: string,
  value: number,
  id = `${left}_${right}`
): KerningPair => ({
  id,
  left: { kind: 'glyph', glyph: left },
  right: { kind: 'glyph', glyph: right },
  value,
})

describe('vertical kerning synthesis', () => {
  it('emits kern and vkrn blocks with explicit y-advance records', () => {
    const result = synthesizeKerningFea({
      kerningPairs: [pair('A', 'V', -50)],
      verticalKerningPairs: [pair('A', 'V', -80)],
      availableGlyphIds: new Set(['A', 'V']),
    })
    expect(result?.pairCount).toBe(2)
    expect(result?.text).toContain('feature kern {')
    expect(result?.text).toContain('pos A V -50;')
    expect(result?.text).toContain('feature vkrn {')
    expect(result?.text).toContain('pos A V <0 0 0 -80>;')
  })

  it('emits only vkrn when the project has no horizontal pairs', () => {
    const result = synthesizeKerningFea({
      verticalKerningPairs: [pair('A', 'V', -80)],
      availableGlyphIds: new Set(['A', 'V']),
    })
    expect(result?.pairCount).toBe(1)
    expect(result?.text).not.toContain('feature kern {')
    expect(result?.text).toContain('feature vkrn {')
  })

  it(
    'compiled vkrn adjusts the y-advance in top-to-bottom shaping',
    { timeout: 120_000 },
    async () => {
      const sfnt = buildExportSfntBuffer({
        fontData: { unitsPerEm: 1000 },
        glyphs: [
          makeGlyph('.notdef'),
          makeGlyph('A', '0041'),
          makeGlyph('V', '0056'),
        ],
        familyName: 'KumikoVkrnTest',
      })
      const fea = synthesizeKerningFea({
        verticalKerningPairs: [pair('A', 'V', -80)],
        availableGlyphIds: new Set(['.notdef', 'A', 'V']),
      })!

      const pyodide = await loadPyodide()
      await pyodide.loadPackage('fonttools')
      pyodide.runPython(FONTTOOLS_COMPILER_PYTHON)
      pyodide.FS.writeFile('/tmp/vkrn-in.otf', new Uint8Array(sfnt))
      pyodide.FS.writeFile('/tmp/vkrn.fea', fea.text)
      const resultProxy = pyodide.runPython(
        `kumiko_compile_fea('/tmp/vkrn-in.otf', '/tmp/vkrn.fea', '/tmp/vkrn-out.otf', ["GSUB", "GPOS", "GDEF"])`
      ) as {
        toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
        destroy?: () => void
      }
      const compiled = resultProxy.toJs({
        dict_converter: Object.fromEntries,
      }) as { ok: boolean; rawCompilerOutput?: string }
      resultProxy.destroy?.()
      expect(compiled.ok, compiled.rawCompilerOutput).toBe(true)
      const outBytes = pyodide.FS.readFile('/tmp/vkrn-out.otf') as Uint8Array
      const buffer = outBytes.buffer.slice(
        outBytes.byteOffset,
        outBytes.byteOffset + outBytes.byteLength
      )

      // The compiled GPOS is what real shapers consume: assert the pair
      // carries the y-advance value record.
      const inspect = pyodide.runPython(`
import json
from fontTools.ttLib import TTFont
_f = TTFont('/tmp/vkrn-out.otf')
_g = _f['GPOS'].table
_st = _g.LookupList.Lookup[0].SubTable[0]
_pv = _st.PairSet[0].PairValueRecord[0]
json.dumps({
    "features": [fr.FeatureTag for fr in _g.FeatureList.FeatureRecord],
    "valueFormat1": _st.ValueFormat1,
    "secondGlyph": _pv.SecondGlyph,
    "yAdvance": _pv.Value1.YAdvance,
})
`) as string
      const gpos = JSON.parse(inspect) as {
        features: string[]
        valueFormat1: number
        secondGlyph: string
        yAdvance: number
      }
      expect(gpos.features).toContain('vkrn')
      // ValueFormat 0x0008 = YAdvance only.
      expect(gpos.valueFormat1).toBe(8)
      expect(gpos.secondGlyph).toBe('V')
      expect(gpos.yAdvance).toBe(-80)

      // The vendored harfbuzzjs build re-enables vertical layout
      // (vendor/harfbuzzjs, HB_NO_VERTICAL removed), so the in-app ttb
      // preview applies the pair for real: 80 units tighter.
      const shape = (features: string[]) =>
        shapeTextWithHarfBuzz(buffer, 'AV', { direction: 'ttb', features })
      const off = await shape(['-vkrn'])
      const on = await shape(['+vkrn'])
      expect(off.ok && on.ok).toBe(true)
      if (!off.ok || !on.ok) {
        return
      }
      expect(Math.abs(on.glyphs[0].yAdvance - off.glyphs[0].yAdvance)).toBe(80)
      // Horizontal shaping ignores vkrn entirely.
      const horizontalOn = await shapeTextWithHarfBuzz(buffer, 'AV', {
        features: ['+vkrn'],
      })
      const horizontalOff = await shapeTextWithHarfBuzz(buffer, 'AV', {
        features: ['-vkrn'],
      })
      expect(horizontalOn.ok && horizontalOff.ok).toBe(true)
      if (horizontalOn.ok && horizontalOff.ok) {
        expect(horizontalOn.glyphs[0].xAdvance).toBe(
          horizontalOff.glyphs[0].xAdvance
        )
        expect(horizontalOn.glyphs[0].yAdvance).toBe(0)
      }
    }
  )
})
