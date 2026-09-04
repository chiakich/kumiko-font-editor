import { describe, expect, it } from 'vitest'
import { loadPyodide } from 'pyodide'
import { buildExportSfntBuffer } from '@/lib/fontFormats/fontBinaryFormat'
import { FONTTOOLS_COMPILER_PYTHON } from '@/lib/openTypeFeatures/fontToolsCompilerPython'
import { createEmptyOpenTypeFeaturesState } from '@/lib/openTypeFeatures/defaults'
import { generateFea } from '@/lib/openTypeFeatures/generateFea'
import { synthesizeKerningFea } from '@/lib/openTypeFeatures/synthesizeKerning'
import { shapeTextWithHarfBuzz } from '@/lib/openTypeFeatures/shapeTextWithHarfBuzz'
import type { GlyphData } from '@/store'
import type { Rule, OpenTypeFeaturesState } from '@/lib/openTypeFeatures/types'

// CJK-scale regression: the preview/export pipeline must survive a font with
// thousands of glyphs, a large kerning set, and a large substitution feature.
// The numbers here are deliberately below a real 14k-glyph font to keep CI
// sane, but large enough that quadratic behavior or per-glyph overhead shows.
const GLYPH_COUNT = 4000
const KERN_PAIR_COUNT = 1500
const SUB_RULE_COUNT = 800

const glyphName = (index: number) =>
  `uni${(0x4e00 + index).toString(16).toUpperCase()}`

const makeCjkGlyph = (index: number): GlyphData => {
  const name = glyphName(index)
  // Two rectangular contours: enough outline work per glyph to be honest
  // about serialization cost without drowning the test in geometry.
  const rect = (pathId: string, x: number, y: number, w: number, h: number) =>
    ({
      id: pathId,
      closed: true,
      nodes: [
        { id: `${pathId}_1`, kind: 'oncurve' as const, x, y },
        { id: `${pathId}_2`, kind: 'oncurve' as const, x: x + w, y },
        { id: `${pathId}_3`, kind: 'oncurve' as const, x: x + w, y: y + h },
        { id: `${pathId}_4`, kind: 'oncurve' as const, x, y: y + h },
      ],
    }) as GlyphData['paths'][number]
  const paths = [
    rect(`${name}_p1`, 60, 0, 380, 300),
    rect(`${name}_p2`, 60, 400, 380, 300),
  ]
  const metrics = { lsb: 60, rsb: 60, width: 1000 }
  return {
    id: name,
    name,
    paths,
    components: [],
    componentRefs: [],
    anchors: [],
    guidelines: [],
    metrics,
    // The export reads outlines from the active layer, not the legacy
    // top-level fields.
    activeLayerId: 'public.default',
    layerOrder: ['public.default'],
    layers: {
      'public.default': {
        id: 'public.default',
        name: 'public.default',
        type: 'master',
        paths,
        componentRefs: [],
        anchors: [],
        guidelines: [],
        metrics,
      },
    },
    unicodes: [(0x4e00 + index).toString(16).toUpperCase().padStart(4, '0')],
  }
}

const buildLargeFontInputs = () => {
  const glyphs: GlyphData[] = [
    {
      id: '.notdef',
      name: '.notdef',
      paths: [],
      components: [],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 600 },
      unicodes: [],
    },
    ...Array.from({ length: GLYPH_COUNT }, (_, index) => makeCjkGlyph(index)),
  ]

  const kerningPairs = Array.from({ length: KERN_PAIR_COUNT }, (_, index) => ({
    left: { kind: 'glyph' as const, glyph: glyphName(index) },
    right: {
      kind: 'glyph' as const,
      glyph: glyphName((index + 7) % GLYPH_COUNT),
    },
    value: -20 - (index % 80),
  }))

  const rules: Rule[] = Array.from({ length: SUB_RULE_COUNT }, (_, index) => ({
    id: `rule_${index}`,
    kind: 'singleSubstitution',
    target: { kind: 'glyph', glyph: glyphName(index) },
    replacement: glyphName(index + SUB_RULE_COUNT),
    meta: { origin: 'manual' },
  }))
  const state: OpenTypeFeaturesState = {
    ...createEmptyOpenTypeFeaturesState(),
    lookups: [
      {
        id: 'lookup_ss01',
        name: 'ss01_singles',
        table: 'GSUB',
        lookupType: 'singleSubst',
        lookupFlag: {},
        rules,
        editable: true,
        origin: 'manual',
      },
    ],
    features: [
      {
        id: 'feature_ss01',
        tag: 'ss01',
        isActive: true,
        origin: 'manual',
        entries: [
          {
            id: 'feature_ss01_entry',
            script: 'DFLT',
            language: 'dflt',
            lookupIds: ['lookup_ss01'],
          },
        ],
      },
    ],
  }

  return { glyphs, kerningPairs, state }
}

describe('large font compile pipeline', () => {
  it(
    'builds, compiles, and shapes a 4k-glyph font with kerning and ss01',
    { timeout: 300_000 },
    async () => {
      const { glyphs, kerningPairs, state } = buildLargeFontInputs()

      const sfntStart = performance.now()
      const sfntBuffer = buildExportSfntBuffer({
        fontData: { unitsPerEm: 1000 },
        glyphs,
        familyName: 'KumikoLargeStress',
      })
      const sfntMs = performance.now() - sfntStart
      expect(sfntBuffer.byteLength).toBeGreaterThan(100_000)

      const generated = generateFea(state)
      const kern = synthesizeKerningFea({
        kerningGroups: undefined,
        kerningPairs,
        availableGlyphIds: new Set(glyphs.map((glyph) => glyph.id)),
        state,
      })
      expect(kern?.pairCount).toBe(KERN_PAIR_COUNT)
      const feaText = `${generated.text}\n${kern!.text}`

      const pyodide = await loadPyodide()
      await pyodide.loadPackage('fonttools')
      pyodide.runPython(FONTTOOLS_COMPILER_PYTHON)
      pyodide.FS.writeFile('/tmp/large-in.ttf', new Uint8Array(sfntBuffer))
      pyodide.FS.writeFile('/tmp/large.fea', feaText)
      const compileStart = performance.now()
      const resultProxy = pyodide.runPython(
        `kumiko_compile_fea('/tmp/large-in.ttf', '/tmp/large.fea', '/tmp/large-out.ttf', ["GSUB", "GPOS", "GDEF"])`
      ) as {
        toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
        destroy?: () => void
      }
      const compiled = resultProxy.toJs({
        dict_converter: Object.fromEntries,
      }) as { ok: boolean; message: string; rawCompilerOutput?: string }
      resultProxy.destroy?.()
      const compileMs = performance.now() - compileStart
      expect(compiled.ok, compiled.rawCompilerOutput).toBe(true)
      const outBytes = pyodide.FS.readFile('/tmp/large-out.ttf') as Uint8Array
      const outBuffer = outBytes.buffer.slice(
        outBytes.byteOffset,
        outBytes.byteOffset + outBytes.byteLength
      )

      // Shape a run that crosses a kerned pair and an ss01-substituted glyph.
      const text =
        String.fromCodePoint(0x4e00) +
        String.fromCodePoint(0x4e07) +
        String.fromCodePoint(0x4e01)
      const off = await shapeTextWithHarfBuzz(outBuffer, text, {
        features: ['-kern', '-ss01'],
      })
      const on = await shapeTextWithHarfBuzz(outBuffer, text, {
        features: ['+kern', '+ss01'],
      })
      expect(off.ok && on.ok).toBe(true)
      if (!off.ok || !on.ok) {
        return
      }
      // kern: first advance shrinks; ss01: glyph ids change.
      expect(on.glyphs[0].xAdvance).toBeLessThan(off.glyphs[0].xAdvance)
      expect(on.glyphs.map((glyph) => glyph.glyphId)).not.toEqual(
        off.glyphs.map((glyph) => glyph.glyphId)
      )

      // Not assertions (CI machines vary), but visible in the test log so a
      // regression in pipeline cost is noticeable.
      console.info(
        `large font pipeline: sfnt ${sfntMs.toFixed(0)}ms, feaLib compile ${compileMs.toFixed(0)}ms, fea ${Math.round(feaText.length / 1024)}KB`
      )
    }
  )
})
