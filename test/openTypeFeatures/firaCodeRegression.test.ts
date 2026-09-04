import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { importBinaryFontFile } from '@/lib/fontFormats/fontBinaryFormat'
import { FONTTOOLS_COMPILER_PYTHON } from '@/lib/openTypeFeatures/fontToolsCompilerPython'
import { generateFea } from '@/lib/openTypeFeatures/generateFea'

const FIRA_CODE_URL = new URL(
  '../../test_glyphs/FiraCode-Regular.otf',
  import.meta.url
)
const FIRA_CODE_PATH = fileURLToPath(FIRA_CODE_URL)
const itWithFiraCode = existsSync(FIRA_CODE_PATH) ? it : it.skip

const loadFiraCode = async () => {
  const buffer = await readFile(FIRA_CODE_PATH)
  return new File([buffer], 'FiraCode-Regular.otf', { type: 'font/otf' })
}

const hasOnlyFormat3Subtables = (formats: unknown) =>
  Array.isArray(formats) && formats.every((format) => format === 3)

const compileWithFontTools = async (
  inputBuffer: Uint8Array,
  generatedFea: string
) => {
  const { loadPyodide } = await import('pyodide')
  const pyodide = await loadPyodide()
  await pyodide.loadPackage('fonttools')
  pyodide.runPython(FONTTOOLS_COMPILER_PYTHON)
  pyodide.FS.writeFile('/tmp/fira-in.otf', inputBuffer)
  pyodide.FS.writeFile('/tmp/fira-generated.fea', generatedFea)

  const result = pyodide.runPython(
    `kumiko_compile_fea('/tmp/fira-in.otf', '/tmp/fira-generated.fea', '/tmp/fira-out.otf')`
  ) as {
    toJs: (o?: { dict_converter?: typeof Object.fromEntries }) => unknown
    destroy?: () => void
  }
  try {
    return result.toJs({ dict_converter: Object.fromEntries }) as {
      ok: boolean
      message: string
      rawCompilerOutput?: string
    }
  } finally {
    result.destroy?.()
  }
}

describe('Fira Code OpenType feature regression', () => {
  itWithFiraCode(
    'reconstructs calt GSUB type 6 format 3 lookups without unsupported fallback',
    async () => {
      const imported = await importBinaryFontFile(await loadFiraCode())
      const state = imported.fontData.openTypeFeatures!
      const caltFeature = state.features.find(
        (feature) => feature.tag === 'calt'
      )
      const caltLookupIds = new Set(
        caltFeature?.entries.flatMap((entry) => entry.lookupIds) ?? []
      )
      const caltLookups = state.lookups.filter((lookup) =>
        caltLookupIds.has(lookup.id)
      )
      const gsubSection = state.sourceSections.find(
        (section) => section.id === 'source_compiled_gsub'
      )

      expect(imported.fontData.glyphOrder).toHaveLength(1617)
      expect(caltFeature).toBeDefined()
      expect(caltLookups).toHaveLength(124)
      expect(
        caltLookups.every(
          (lookup) =>
            lookup.lookupType === 'chainingContextSubst' &&
            lookup.editable &&
            hasOnlyFormat3Subtables(lookup.meta?.subtableFormats)
        )
      ).toBe(true)
      expect(
        caltLookups.reduce((sum, lookup) => sum + lookup.rules.length, 0)
      ).toBe(552)
      expect(state.unsupportedLookups).toEqual([])
      expect(state.diagnostics ?? []).toEqual([])
      expect(state.glyphClasses.length).toBeGreaterThan(0)
      expect(gsubSection).toMatchObject({
        status: 'classified',
        preservationPolicy: 'editable-rebuild',
      })
      expect(
        gsubSection?.recordRefs.some((ref) => ref.kind === 'glyphClass')
      ).toBe(true)
    }
  )

  itWithFiraCode(
    'compiles generated FEA from reconstructed contextual lookups',
    async () => {
      const buffer = await readFile(FIRA_CODE_PATH)
      const imported = await importBinaryFontFile(
        new File([buffer], 'FiraCode-Regular.otf', { type: 'font/otf' })
      )
      const generated = generateFea(imported.fontData.openTypeFeatures!)
      const compiled = await compileWithFontTools(
        new Uint8Array(buffer),
        generated.text
      )

      expect(compiled.ok, compiled.rawCompilerOutput).toBe(true)
    },
    180000
  )
})
