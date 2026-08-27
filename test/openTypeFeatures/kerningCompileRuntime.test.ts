import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide, type PyodideAPI } from 'pyodide'
import opentype from 'opentype.js'
import { FONTTOOLS_COMPILER_PYTHON } from 'src/lib/openTypeFeatures/fontToolsCompilerPython'
import { synthesizeKerningFea } from 'src/lib/openTypeFeatures/synthesizeKerning'

const rectPath = (x: number, w: number, h = 700) => {
  const path = new opentype.Path()
  path.moveTo(x, 0)
  path.lineTo(x + w, 0)
  path.lineTo(x + w, h)
  path.lineTo(x, h)
  path.close()
  return path
}

const buildFont = (): ArrayBuffer => {
  const glyphs = [
    new opentype.Glyph({
      name: '.notdef',
      advanceWidth: 600,
      path: new opentype.Path(),
    }),
    new opentype.Glyph({
      name: 'A',
      unicode: 0x41,
      advanceWidth: 600,
      path: rectPath(50, 500),
    }),
    new opentype.Glyph({
      name: 'V',
      unicode: 0x56,
      advanceWidth: 600,
      path: rectPath(80, 440),
    }),
  ]
  const font = new opentype.Font({
    familyName: 'KumikoKernTest',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
  })
  return font.toArrayBuffer()
}

const INSPECT_PYTHON = `
from fontTools.ttLib import TTFont

def kumiko_kern_inspect(path):
    font = TTFont(path)
    has_gpos = "GPOS" in font
    features = []
    if has_gpos and font["GPOS"].table.FeatureList:
        features = sorted(
            {record.FeatureTag for record in font["GPOS"].table.FeatureList.FeatureRecord}
    )
    return {"hasGpos": has_gpos, "features": features}
`

// The synthesized kern feature is only worth anything if feaLib actually
// accepts it, so this compiles the real output through the real compiler.
describe('synthesized kerning compile runtime', () => {
  let pyodide: PyodideAPI

  beforeAll(async () => {
    pyodide = await loadPyodide()
    await pyodide.loadPackage('fonttools')
    pyodide.runPython(FONTTOOLS_COMPILER_PYTHON)
    pyodide.runPython(INSPECT_PYTHON)
  }, 180000)

  it('lands project kerning in the binary GPOS table', () => {
    const synthetic = synthesizeKerningFea({
      kerningGroups: [
        { id: 'g1', side: 'right', name: 'public.kern2.V', glyphs: ['V'] },
      ],
      kerningPairs: [
        {
          left: { kind: 'glyph', glyph: 'A' },
          right: { kind: 'class', classId: 'g1' },
          value: -80,
        },
      ],
      availableGlyphIds: new Set(['A', 'V']),
    })
    expect(synthetic?.pairCount).toBe(1)

    pyodide.FS.writeFile('/tmp/kern-in.otf', new Uint8Array(buildFont()))
    pyodide.FS.writeFile('/tmp/kern.fea', synthetic!.text)
    const result = pyodide.runPython(
      `kumiko_compile_fea("/tmp/kern-in.otf", "/tmp/kern.fea", "/tmp/kern-out.otf", None, None)`
    ) as {
      toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
      destroy?: () => void
    }
    const compiled = result.toJs({ dict_converter: Object.fromEntries }) as {
      ok: boolean
      message: string
    }
    result.destroy?.()
    expect(compiled.ok, compiled.message).toBe(true)

    const inspect = pyodide.runPython(
      `kumiko_kern_inspect("/tmp/kern-out.otf")`
    ) as {
      toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
      destroy?: () => void
    }
    const info = inspect.toJs({ dict_converter: Object.fromEntries }) as {
      hasGpos: boolean
      features: string[]
    }
    inspect.destroy?.()
    expect(info.hasGpos).toBe(true)
    expect(info.features).toContain('kern')
  })
})
