import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import opentype from 'opentype.js'

export interface CalibrationFontFace {
  label: string
  font: opentype.Font
}

const temporaryDirectories: string[] = []

const parseFontFile = (fontPath: string) => {
  const buffer = readFileSync(fontPath)
  return opentype.parse(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
  )
}

const findFontToolsWheel = (repoRoot: string) => {
  const pyodideDir = path.join(repoRoot, 'node_modules', 'pyodide')
  const wheel = readdirSync(pyodideDir).find((file) =>
    /^fonttools-.*\.whl$/u.test(file)
  )
  if (!wheel) {
    throw new Error('找不到 Pyodide 內附的 fontTools wheel，無法解析 TTC')
  }
  return path.join(pyodideDir, wheel)
}

const TTC_EXTRACT_PYTHON = String.raw`
import json
import os
import sys
from fontTools.ttLib import TTCollection

source_path, output_dir = sys.argv[1], sys.argv[2]
collection = TTCollection(source_path)
result = []
for index, font in enumerate(collection.fonts):
    output_path = os.path.join(output_dir, f"face-{index}.ttf")
    font.flavor = None
    font.save(output_path)
    name = font["name"].getDebugName(4) or font["name"].getDebugName(1) or f"face-{index}"
    result.append({"index": index, "name": name, "path": output_path})
print(json.dumps(result, ensure_ascii=False))
`

const extractTtcFaces = (
  fontPath: string,
  repoRoot: string
): CalibrationFontFace[] => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'kumiko-quality-ttc-'))
  temporaryDirectories.push(outputDir)
  const result = spawnSync(
    process.env.PYTHON ?? 'python3',
    ['-c', TTC_EXTRACT_PYTHON, fontPath, outputDir],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: [findFontToolsWheel(repoRoot), process.env.PYTHONPATH]
          .filter(Boolean)
          .join(path.delimiter),
      },
    }
  )
  if (result.status !== 0) {
    throw new Error(
      `TTC face 抽取失敗：${result.stderr.trim() || result.stdout.trim()}`
    )
  }
  const faces = JSON.parse(result.stdout) as Array<{
    index: number
    name: string
    path: string
  }>
  return faces.map((face) => ({
    label: `${path.basename(fontPath)}#${face.index}:${face.name}`,
    font: parseFontFile(face.path),
  }))
}

export const loadCalibrationFontFaces = (
  fontDir: string,
  repoRoot: string
): CalibrationFontFace[] => {
  const faces: CalibrationFontFace[] = []
  for (const file of readdirSync(fontDir).sort()) {
    const fontPath = path.join(fontDir, file)
    if (/\.(?:otf|ttf)$/iu.test(file)) {
      faces.push({ label: file, font: parseFontFile(fontPath) })
    } else if (/\.ttc$/iu.test(file)) {
      faces.push(...extractTtcFaces(fontPath, repoRoot))
    }
  }
  return faces
}

export const cleanupCalibrationFontFaces = () => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
}
