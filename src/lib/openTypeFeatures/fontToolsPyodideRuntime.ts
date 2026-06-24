import { loadPyodide, version as pyodideVersion } from 'pyodide'
import type { PyodideAPI } from 'pyodide'
import { makeDiagnostic } from 'src/lib/openTypeFeatures/diagnostics'
import { FONTTOOLS_COMPILER_PYTHON } from 'src/lib/openTypeFeatures/fontToolsCompilerPython'
import { FONTTOOLS_VARIABLE_FONT_PYTHON } from 'src/lib/fontFormats/fontToolsVariableFontPython'
import type {
  CompileOptions,
  CompileResult,
} from 'src/lib/openTypeFeatures/compilerTypes'

const PYODIDE_INDEX_PATH = '/pyodide/'
const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`

interface FontToolsRuntime {
  pyodide: PyodideAPI
}

interface PythonCompileResult {
  ok: boolean
  message: string
  rawCompilerOutput?: string
}

interface PythonVariableFontResult {
  ok: boolean
  message: string
  rawCompilerOutput?: string
  tables?: string[]
}

interface PyProxyLike {
  destroy?: () => void
  toJs: (options?: { dict_converter?: typeof Object.fromEntries }) => unknown
}

let runtimePromise: Promise<FontToolsRuntime> | null = null

export const getPyodideIndexUrl = () =>
  new URL(PYODIDE_INDEX_PATH, self.location.href).toString()

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  Uint8Array.from(bytes).buffer

const toPythonCompileResult = (value: unknown): PythonCompileResult => {
  const result = value as Partial<PythonCompileResult>

  return {
    ok: result.ok === true,
    message:
      typeof result.message === 'string'
        ? result.message
        : 'fontTools returned an unknown compiler result.',
    rawCompilerOutput:
      typeof result.rawCompilerOutput === 'string'
        ? result.rawCompilerOutput
        : undefined,
  }
}

const toPythonVariableFontResult = (
  value: unknown
): PythonVariableFontResult => {
  const result = value as Partial<PythonVariableFontResult>

  return {
    ok: result.ok === true,
    message:
      typeof result.message === 'string'
        ? result.message
        : 'fontTools returned an unknown variable font result.',
    rawCompilerOutput:
      typeof result.rawCompilerOutput === 'string'
        ? result.rawCompilerOutput
        : undefined,
    tables: Array.isArray(result.tables)
      ? result.tables.filter(
          (table): table is string => typeof table === 'string'
        )
      : undefined,
  }
}

const runPythonCompile = (
  pyodide: PyodideAPI,
  inputPath: string,
  feaPath: string,
  outputPath: string,
  options: CompileOptions
) => {
  const resultProxy = pyodide.runPython(
    `kumiko_compile_fea(${JSON.stringify(inputPath)}, ${JSON.stringify(
      feaPath
    )}, ${JSON.stringify(outputPath)}, ${JSON.stringify(options.affectedTables)})`
  ) as PyProxyLike

  try {
    return toPythonCompileResult(
      resultProxy.toJs({ dict_converter: Object.fromEntries })
    )
  } finally {
    resultProxy.destroy?.()
  }
}

const runPythonVariableBuild = (
  pyodide: PyodideAPI,
  designspacePath: string,
  outputPath: string
) => {
  const resultProxy = pyodide.runPython(
    `kumiko_build_variable_font(${JSON.stringify(
      designspacePath
    )}, ${JSON.stringify(outputPath)})`
  ) as PyProxyLike

  try {
    return toPythonVariableFontResult(
      resultProxy.toJs({ dict_converter: Object.fromEntries })
    )
  } finally {
    resultProxy.destroy?.()
  }
}

const cleanFile = (pyodide: PyodideAPI, path: string) => {
  try {
    pyodide.FS.unlink(path)
  } catch {
    // Files are best-effort cleanup inside Pyodide's MEMFS.
  }
}

const loadFontToolsRuntime = async (): Promise<FontToolsRuntime> => {
  const pyodide = await loadPyodide({
    indexURL: getPyodideIndexUrl(),
    packageBaseUrl: PYODIDE_PACKAGE_BASE_URL,
  })

  await pyodide.loadPackage('fonttools')
  pyodide.runPython(FONTTOOLS_COMPILER_PYTHON)
  pyodide.runPython(FONTTOOLS_VARIABLE_FONT_PYTHON)

  return { pyodide }
}

export const buildVariableFontWithFontToolsRuntime = async (input: {
  designspaceText: string
  masters: Array<{ fileName: string; fontBuffer: ArrayBuffer }>
}): Promise<{ fontBuffer: ArrayBuffer; tables?: string[] }> => {
  const { pyodide } = await getFontToolsRuntime()
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const designspacePath = `/tmp/kumiko_variable_${nonce}.designspace`
  const outputPath = `/tmp/kumiko_variable_${nonce}.otf`
  const masterPaths = input.masters.map((master) => `/tmp/${master.fileName}`)

  try {
    pyodide.FS.writeFile(designspacePath, input.designspaceText)
    input.masters.forEach((master, index) => {
      pyodide.FS.writeFile(
        masterPaths[index],
        new Uint8Array(master.fontBuffer)
      )
    })

    const result = runPythonVariableBuild(pyodide, designspacePath, outputPath)
    if (!result.ok) {
      throw Object.assign(new Error(result.message), {
        rawCompilerOutput: result.rawCompilerOutput,
      })
    }

    const output = pyodide.FS.readFile(outputPath)
    return {
      fontBuffer: toArrayBuffer(output),
      tables: result.tables,
    }
  } finally {
    cleanFile(pyodide, designspacePath)
    cleanFile(pyodide, outputPath)
    masterPaths.forEach((path) => cleanFile(pyodide, path))
  }
}

export const getFontToolsRuntime = () => {
  runtimePromise ??= loadFontToolsRuntime()
  return runtimePromise
}

export const compileWithFontToolsRuntime = async (
  inputFontBuffer: ArrayBuffer,
  generatedFea: string,
  options: CompileOptions
): Promise<CompileResult> => {
  const { pyodide } = await getFontToolsRuntime()
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const inputPath = `/tmp/kumiko_input_${nonce}.font`
  const feaPath = `/tmp/kumiko_features_${nonce}.fea`
  const outputPath = `/tmp/kumiko_output_${nonce}.font`

  try {
    pyodide.FS.writeFile(inputPath, new Uint8Array(inputFontBuffer))
    pyodide.FS.writeFile(feaPath, generatedFea)

    const result = runPythonCompile(
      pyodide,
      inputPath,
      feaPath,
      outputPath,
      options
    )

    if (!result.ok) {
      throw Object.assign(new Error(result.message), {
        rawCompilerOutput: result.rawCompilerOutput,
      })
    }

    const output = pyodide.FS.readFile(outputPath)

    return {
      fontBuffer: toArrayBuffer(output),
      diagnostics: [],
      rawCompilerOutput: result.rawCompilerOutput,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'fontTools compilation failed.'
    const rawCompilerOutput =
      error instanceof Error &&
      'rawCompilerOutput' in error &&
      typeof error.rawCompilerOutput === 'string'
        ? error.rawCompilerOutput
        : error instanceof Error
          ? error.stack
          : undefined

    return Promise.reject({
      diagnostics: [
        makeDiagnostic('error', message, { kind: 'global' }, [
          'fonttools',
          'compile',
        ]),
      ],
      message,
      rawCompilerOutput,
    })
  } finally {
    cleanFile(pyodide, inputPath)
    cleanFile(pyodide, feaPath)
    cleanFile(pyodide, outputPath)
  }
}
