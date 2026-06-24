import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide, type PyodideAPI } from 'pyodide'
import opentype from 'opentype.js'

import { FONTTOOLS_COMPILER_PYTHON } from 'src/lib/openTypeFeatures/fontToolsCompilerPython'
import { FONTTOOLS_VARIABLE_FONT_PYTHON } from 'src/lib/fontFormats/fontToolsVariableFontPython'

// Exercises the real fontTools FEA compiler the worker runs
// (FONTTOOLS_COMPILER_PYTHON + kumiko_compile_fea), driven through pyodide in
// Node instead of the browser Worker. This is the only path that verifies
// OpenType features actually land in the exported binary.
//
// First run downloads the fonttools wheel from the pyodide CDN (needs network)
// and caches it in node_modules/pyodide; later runs are offline. The pyodide
// boot + wheel load is why beforeAll uses a long timeout.

const TEST_INSPECT_PYTHON = `
from fontTools.ttLib import TTFont

def kumiko_test_inspect(path):
    font = TTFont(path)
    feature_tags = []
    if "GSUB" in font and font["GSUB"].table.FeatureList:
        feature_tags = sorted(
            {record.FeatureTag for record in font["GSUB"].table.FeatureList.FeatureRecord}
        )
    return {"tables": sorted(font.keys()), "features": feature_tags}
`

const FEATURE_TEXT = `feature ss01 {
    sub A by B;
} ss01;
`

const REPLACEMENT_FEATURE_TEXT = `feature ss02 {
    sub A by B;
} ss02;
`

const rectPath = (x: number, w: number, h = 700) => {
  const path = new opentype.Path()
  path.moveTo(x, 0)
  path.lineTo(x + w, 0)
  path.lineTo(x + w, h)
  path.lineTo(x, h)
  path.close()
  return path
}

// A minimal CFF font with glyphs A/B and no layout tables.
const buildPlainFont = (): ArrayBuffer => {
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
      name: 'B',
      unicode: 0x42,
      advanceWidth: 600,
      path: rectPath(80, 440),
    }),
  ]
  const font = new opentype.Font({
    familyName: 'KumikoCompileTest',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
  })
  return font.toArrayBuffer()
}

const buildMasterFont = (weight: number, styleName: string): ArrayBuffer => {
  const glyphs = [
    new opentype.Glyph({
      name: '.notdef',
      advanceWidth: 600,
      path: new opentype.Path(),
    }),
    new opentype.Glyph({
      name: 'A',
      unicode: 0x41,
      advanceWidth: 500 + weight,
      path: rectPath(50, 300 + weight, 700),
    }),
  ]
  const font = new opentype.Font({
    familyName: 'KumikoVariableTest',
    styleName,
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
  })
  return font.toArrayBuffer()
}

const inspect = (pyodide: PyodideAPI, path: string) => {
  const proxy = pyodide.runPython(
    `kumiko_test_inspect(${JSON.stringify(path)})`
  ) as {
    toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
    destroy?: () => void
  }
  try {
    return proxy.toJs({ dict_converter: Object.fromEntries }) as {
      tables: string[]
      features: string[]
    }
  } finally {
    proxy.destroy?.()
  }
}

describe('fontTools FEA compile runtime', () => {
  let pyodide: PyodideAPI

  beforeAll(async () => {
    pyodide = await loadPyodide()
    await pyodide.loadPackage('fonttools')
    pyodide.runPython(FONTTOOLS_COMPILER_PYTHON)
    pyodide.runPython(FONTTOOLS_VARIABLE_FONT_PYTHON)
    pyodide.runPython(TEST_INSPECT_PYTHON)
  }, 180000)

  it('compiles a GSUB feature into the binary', () => {
    const inputPath = '/tmp/in.otf'
    const feaPath = '/tmp/feat.fea'
    const outputPath = '/tmp/out.otf'
    pyodide.FS.writeFile(inputPath, new Uint8Array(buildPlainFont()))
    pyodide.FS.writeFile(feaPath, FEATURE_TEXT)

    // Sanity: the source font has no GSUB to begin with.
    const before = inspect(pyodide, inputPath)
    expect(before.tables).not.toContain('GSUB')

    const result = pyodide.runPython(
      `kumiko_compile_fea(${JSON.stringify(inputPath)}, ${JSON.stringify(
        feaPath
      )}, ${JSON.stringify(outputPath)}, None, None)`
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

    // The compiled binary now carries a GSUB table with the ss01 feature.
    const after = inspect(pyodide, outputPath)
    expect(after.tables).toContain('GSUB')
    expect(after.features).toContain('ss01')

    // And the output is still a valid, parseable font.
    const outBytes = pyodide.FS.readFile(outputPath) as Uint8Array
    const reparsed = opentype.parse(
      outBytes.buffer.slice(
        outBytes.byteOffset,
        outBytes.byteOffset + outBytes.byteLength
      )
    )
    expect(reparsed.glyphs.length).toBe(3)
  })

  it('removes affected layout tables before compiling replacement FEA', () => {
    const inputPath = '/tmp/replace-in.otf'
    const firstFeaPath = '/tmp/replace-first.fea'
    const firstOutputPath = '/tmp/replace-first-out.otf'
    const secondFeaPath = '/tmp/replace-second.fea'
    const secondOutputPath = '/tmp/replace-second-out.otf'
    pyodide.FS.writeFile(inputPath, new Uint8Array(buildPlainFont()))
    pyodide.FS.writeFile(firstFeaPath, FEATURE_TEXT)
    pyodide.FS.writeFile(secondFeaPath, REPLACEMENT_FEATURE_TEXT)

    const firstResult = pyodide.runPython(
      `kumiko_compile_fea(${JSON.stringify(inputPath)}, ${JSON.stringify(
        firstFeaPath
      )}, ${JSON.stringify(firstOutputPath)}, ["GSUB"])`
    ) as {
      toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
      destroy?: () => void
    }
    const firstCompiled = firstResult.toJs({
      dict_converter: Object.fromEntries,
    }) as { ok: boolean; message: string }
    firstResult.destroy?.()
    expect(firstCompiled.ok, firstCompiled.message).toBe(true)
    expect(inspect(pyodide, firstOutputPath).features).toEqual(['ss01'])

    const secondResult = pyodide.runPython(
      `kumiko_compile_fea(${JSON.stringify(
        firstOutputPath
      )}, ${JSON.stringify(secondFeaPath)}, ${JSON.stringify(
        secondOutputPath
      )}, ["GSUB"])`
    ) as {
      toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
      destroy?: () => void
    }
    const secondCompiled = secondResult.toJs({
      dict_converter: Object.fromEntries,
    }) as { ok: boolean; message: string }
    secondResult.destroy?.()
    expect(secondCompiled.ok, secondCompiled.message).toBe(true)
    expect(inspect(pyodide, secondOutputPath).features).toEqual(['ss02'])
  })

  it('reports a diagnostic for invalid FEA instead of throwing', () => {
    const inputPath = '/tmp/in2.otf'
    const feaPath = '/tmp/bad.fea'
    const outputPath = '/tmp/out2.otf'
    pyodide.FS.writeFile(inputPath, new Uint8Array(buildPlainFont()))
    // References a glyph that does not exist in the font.
    pyodide.FS.writeFile(feaPath, 'feature ss01 { sub A by ZZZ; } ss01;\n')

    const result = pyodide.runPython(
      `kumiko_compile_fea(${JSON.stringify(inputPath)}, ${JSON.stringify(
        feaPath
      )}, ${JSON.stringify(outputPath)}, None, None)`
    ) as {
      toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
      destroy?: () => void
    }
    const compiled = result.toJs({ dict_converter: Object.fromEntries }) as {
      ok: boolean
      message: string
    }
    result.destroy?.()
    expect(compiled.ok).toBe(false)
    expect(compiled.message.length).toBeGreaterThan(0)
  })

  it('builds a variable OTF from CFF masters and a designspace', () => {
    pyodide.FS.writeFile(
      '/tmp/var-light.otf',
      new Uint8Array(buildMasterFont(0, 'Light'))
    )
    pyodide.FS.writeFile(
      '/tmp/var-bold.otf',
      new Uint8Array(buildMasterFont(100, 'Bold'))
    )
    pyodide.FS.writeFile(
      '/tmp/var.designspace',
      `<?xml version="1.0" encoding="UTF-8"?>
<designspace format="4.1">
  <axes>
    <axis tag="wght" name="Weight" minimum="0" maximum="100" default="0"/>
  </axes>
  <sources>
    <source filename="var-light.otf" name="Light" stylename="Light">
      <info copy="1"/>
      <location><dimension name="Weight" xvalue="0"/></location>
    </source>
    <source filename="var-bold.otf" name="Bold" stylename="Bold">
      <location><dimension name="Weight" xvalue="100"/></location>
    </source>
  </sources>
</designspace>`
    )

    const result = pyodide.runPython(
      `kumiko_build_variable_font('/tmp/var.designspace', '/tmp/var-out.otf')`
    ) as {
      toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
      destroy?: () => void
    }
    const built = result.toJs({ dict_converter: Object.fromEntries }) as {
      ok: boolean
      message: string
      tables: string[]
    }
    result.destroy?.()

    expect(built.ok, built.message).toBe(true)
    expect(built.tables).toContain('fvar')
    expect(built.tables).toContain('CFF2')
    expect(built.tables).toContain('HVAR')
  })
})
