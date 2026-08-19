import {
  extractGlyphsMetadata,
  type GlyphsDocument,
} from 'src/lib/fontFormats/glyphsDocument'
import {
  createBaseGlyphsDocument,
  createGlyphsDocumentFromFontData,
  createGlyphsRecordFromFontDataGlyph,
  getGlyphExportWarnings,
  type GlyphsExportWarning,
  serializeOpenStepValue,
} from 'src/lib/fontFormats/glyphsExport'
import { parseOpenStep } from 'src/lib/fontFormats/openstepParser'
import type { FontData, GlyphData } from 'src/store'

export interface GlyphsPackageData {
  packageName: string
}

export interface GeneratedGlyphsPackageData extends GlyphsPackageData {
  files: Record<string, string>
}

export interface GlyphsPackageBatchResult extends GeneratedGlyphsPackageData {
  totalGlyphs: number
  warnings: GlyphsExportWarning[]
}

interface ParsedGlyphFileEntry {
  glyph: Record<string, unknown>
  relativePath: string
}

export interface ParsedGlyphsPackage {
  document: GlyphsDocument
  packageData: GlyphsPackageData
  projectMetadata: Record<string, unknown>
}

const normalizeSeparators = (value: string) => value.replace(/\\/g, '/')

const findPackageRoot = (relativePath: string) => {
  const normalized = normalizeSeparators(relativePath).replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)

  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index]?.endsWith('.glyphspackage')) {
      return {
        packageName: segments[index] ?? 'Untitled.glyphspackage',
        innerPath: segments.slice(index + 1).join('/'),
      }
    }
  }

  return null
}

const sortGlyphEntries = (
  entries: ParsedGlyphFileEntry[],
  orderedGlyphNames: string[]
) => {
  const orderIndex = new Map(
    orderedGlyphNames.map((glyphName, index) => [
      glyphName.toLowerCase(),
      index,
    ])
  )

  return [...entries].sort((left, right) => {
    const leftName =
      typeof left.glyph.glyphname === 'string'
        ? left.glyph.glyphname.toLowerCase()
        : ''
    const rightName =
      typeof right.glyph.glyphname === 'string'
        ? right.glyph.glyphname.toLowerCase()
        : ''
    const leftOrder = orderIndex.get(leftName)
    const rightOrder = orderIndex.get(rightName)

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder
    }
    if (leftOrder !== undefined) {
      return -1
    }
    if (rightOrder !== undefined) {
      return 1
    }
    return left.relativePath.localeCompare(right.relativePath)
  })
}

export const readGlyphsPackageFromFiles = async (
  inputFiles: FileList | File[]
): Promise<ParsedGlyphsPackage> => {
  const files = Array.from(inputFiles)
  if (files.length === 0) {
    throw new Error('未選取任何 .glyphspackage 檔案')
  }

  const fileEntries = await Promise.all(
    files.map(async (file) => {
      const text = await file.text()
      const packageRoot = findPackageRoot(file.webkitRelativePath || file.name)
      return {
        packageRoot,
        text,
      }
    })
  )

  const packageNames = [
    ...new Set(
      fileEntries.map((entry) => entry.packageRoot?.packageName).filter(Boolean)
    ),
  ]
  if (packageNames.length === 0) {
    throw new Error('選到的資料夾裡沒有找到 .glyphspackage')
  }
  if (packageNames.length > 1) {
    throw new Error('選到的資料夾裡有多個 .glyphspackage，請一次只選一個專案')
  }

  const packageName = packageNames[0] ?? 'Untitled.glyphspackage'

  const fileMap = Object.fromEntries(
    fileEntries
      .filter(
        (entry) =>
          entry.packageRoot?.packageName === packageName &&
          entry.packageRoot.innerPath
      )
      .map((entry) => [entry.packageRoot!.innerPath, entry.text] as const)
  )
  const fontInfoText = fileMap['fontinfo.plist']
  if (!fontInfoText) {
    throw new Error('找不到 fontinfo.plist，這不是有效的 .glyphspackage')
  }

  const orderText = fileMap['order.plist']
  const orderedGlyphNames = orderText
    ? ((parseOpenStep(orderText) as string[]) ?? [])
    : []
  const baseDocument = parseOpenStep(fontInfoText) as GlyphsDocument

  const glyphEntries = Object.entries(fileMap)
    .filter(
      ([relativePath]) =>
        relativePath.startsWith('glyphs/') && relativePath.endsWith('.glyph')
    )
    .map(([relativePath, text]) => ({
      glyph: parseOpenStep(text) as Record<string, unknown>,
      relativePath,
    }))

  const sortedGlyphEntries = sortGlyphEntries(glyphEntries, orderedGlyphNames)
  const document = {
    ...baseDocument,
    glyphs: sortedGlyphEntries.map((entry) => entry.glyph),
  } as GlyphsDocument

  return {
    document,
    packageData: {
      packageName,
    },
    projectMetadata: extractGlyphsMetadata(document) ?? {},
  }
}

const sanitizeGlyphFileName = (glyphName: string) =>
  glyphName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') ||
  'untitled'

const ensureGlyphsPackageName = (value: string | null | undefined) => {
  const packageName = value?.trim() || 'Untitled.glyphspackage'
  return packageName.toLowerCase().endsWith('.glyphspackage')
    ? packageName
    : `${packageName}.glyphspackage`
}

// One glyph file name, unique within the package. Exported so the materializer
// and the path lister agree on names without duplicating the rule.
export const sanitizeGlyphsPackageFileName = (
  glyphName: string,
  usedNames: Set<string>
) => {
  const baseName = sanitizeGlyphFileName(glyphName)
  let index = 0
  while (true) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const fileName = `${baseName}${suffix}.glyph`
    if (!usedNames.has(fileName)) {
      usedNames.add(fileName)
      return fileName
    }
    index += 1
  }
}

const getUniqueGlyphPath = (glyphName: string, usedPaths: Set<string>) => {
  const baseName = sanitizeGlyphFileName(glyphName)
  let index = 0
  while (true) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const relativePath = `glyphs/${baseName}${suffix}.glyph`
    if (!usedPaths.has(relativePath)) {
      usedPaths.add(relativePath)
      return relativePath
    }
    index += 1
  }
}

export const createGlyphsPackageDataFromFontData = (input: {
  fontData: FontData
  projectMetadata: Record<string, unknown> | null
  packageName?: string | null
}): GeneratedGlyphsPackageData => {
  const document = createGlyphsDocumentFromFontData(
    input.fontData,
    input.projectMetadata,
    3
  )
  const fontInfoDocument = { ...document }
  delete fontInfoDocument.glyphs

  const files: Record<string, string> = {
    'fontinfo.plist': `${serializeOpenStepValue(fontInfoDocument)}\n`,
  }
  const usedPaths = new Set<string>()
  const orderedGlyphNames: string[] = []

  for (const glyph of document.glyphs ?? []) {
    const glyphName =
      typeof glyph.glyphname === 'string' && glyph.glyphname.length > 0
        ? glyph.glyphname
        : 'untitled'
    const relativePath = getUniqueGlyphPath(glyphName, usedPaths)
    files[relativePath] = `${serializeOpenStepValue(glyph)}\n`
    orderedGlyphNames.push(glyphName)
  }

  files['order.plist'] = `${serializeOpenStepValue(orderedGlyphNames)}\n`

  return {
    packageName: ensureGlyphsPackageName(input.packageName),
    files,
  }
}

export const createGlyphsPackageDataFromGlyphBatches = async (input: {
  baseFontData: FontData
  projectMetadata: Record<string, unknown> | null
  glyphBatches: AsyncIterable<GlyphData[]>
  packageName?: string | null
}): Promise<GlyphsPackageBatchResult> => {
  const document = createBaseGlyphsDocument(
    input.baseFontData,
    input.projectMetadata
  )
  document['.formatVersion'] = 3

  const fontInfoDocument = { ...document }
  delete fontInfoDocument.glyphs

  const files: Record<string, string> = {
    'fontinfo.plist': `${serializeOpenStepValue(fontInfoDocument)}\n`,
  }
  const usedPaths = new Set<string>()
  const orderedGlyphNames: string[] = []
  const warnings: GlyphsExportWarning[] = []
  let totalGlyphs = 0

  for await (const glyphBatch of input.glyphBatches) {
    for (const glyph of glyphBatch) {
      const glyphRecord = createGlyphsRecordFromFontDataGlyph(
        undefined,
        glyph,
        3
      )
      const glyphName =
        typeof glyphRecord.glyphname === 'string' &&
        glyphRecord.glyphname.length > 0
          ? glyphRecord.glyphname
          : 'untitled'
      const relativePath = getUniqueGlyphPath(glyphName, usedPaths)
      files[relativePath] = `${serializeOpenStepValue(glyphRecord)}\n`
      orderedGlyphNames.push(glyphName)
      warnings.push(...getGlyphExportWarnings(glyph, 3))
      totalGlyphs += 1
    }
  }

  files['order.plist'] = `${serializeOpenStepValue(orderedGlyphNames)}\n`

  return {
    packageName: ensureGlyphsPackageName(input.packageName),
    files,
    totalGlyphs,
    warnings,
  }
}

export const writeGlyphsPackageToDirectory = async (
  packageData: GeneratedGlyphsPackageData
) => {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker

  if (!picker) {
    throw new Error('目前瀏覽器不支援資料夾輸出，請使用 Chrome 或 Edge')
  }

  const rootHandle = await picker({ mode: 'readwrite' })
  const packageHandle = await rootHandle.getDirectoryHandle(
    packageData.packageName,
    { create: true }
  )

  for (const relativePath of Object.keys(packageData.files)) {
    const text = packageData.files[relativePath]
    if (typeof text !== 'string') {
      continue
    }

    const parts = normalizeSeparators(relativePath).split('/').filter(Boolean)
    if (parts.length === 0) {
      continue
    }

    let directoryHandle = packageHandle
    for (const part of parts.slice(0, -1)) {
      directoryHandle = await directoryHandle.getDirectoryHandle(part, {
        create: true,
      })
    }

    const fileName = parts[parts.length - 1]
    if (!fileName) {
      continue
    }

    const fileHandle = await directoryHandle.getFileHandle(fileName, {
      create: true,
    })
    const writable = await fileHandle.createWritable()
    await writable.write(text)
    await writable.close()
  }
}
