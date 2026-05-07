import {
  extractGlyphsMetadata,
  type GlyphsDocument,
} from 'src/lib/glyphsDocument'
import { serializeOpenStepValue } from 'src/lib/glyphsExport'
import { patchGlyphText } from 'src/lib/glyphsPatchExport'
import { parseOpenStep } from 'src/lib/openstepParser'
import type { GlyphData } from 'src/store'

export interface GlyphsPackageData {
  packageName: string
  files: Record<string, string>
  glyphFileMap: Record<string, string>
}

export interface PatchedGlyphsPackageData extends GlyphsPackageData {
  changedPaths: string[]
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

const getGlyphKeysFromRawGlyph = (glyph: Record<string, unknown>) => {
  const keys = new Set<string>()
  const glyphName = typeof glyph.glyphname === 'string' ? glyph.glyphname : null
  const unicode = typeof glyph.unicode === 'string' ? glyph.unicode : null

  if (glyphName) {
    keys.add(glyphName.toLowerCase())
  }
  if (unicode) {
    keys.add(`uni${unicode}`.toLowerCase())
  }

  return [...keys]
}

const getGlyphKeysFromHotGlyph = (glyph: GlyphData) => {
  const keys = new Set<string>()
  keys.add(glyph.id.toLowerCase())
  keys.add(glyph.name.toLowerCase())
  if (glyph.unicode) {
    keys.add(`uni${glyph.unicode}`.toLowerCase())
  }
  return [...keys]
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
  const glyphFileMap: Record<string, string> = {}
  for (const entry of sortedGlyphEntries) {
    for (const key of getGlyphKeysFromRawGlyph(entry.glyph)) {
      if (!glyphFileMap[key]) {
        glyphFileMap[key] = entry.relativePath
      }
    }
  }

  const document = {
    ...baseDocument,
    glyphs: sortedGlyphEntries.map((entry) => entry.glyph),
  } as GlyphsDocument

  return {
    document,
    packageData: {
      packageName,
      files: fileMap,
      glyphFileMap,
    },
    projectMetadata: extractGlyphsMetadata(document) ?? {},
  }
}

const sanitizeGlyphFileName = (glyphName: string) =>
  glyphName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') ||
  'untitled'

export const patchGlyphsPackageData = (input: {
  packageData: GlyphsPackageData
  dirtyGlyphs: Record<string, GlyphData>
}) => {
  const files = { ...input.packageData.files }
  const glyphFileMap = { ...input.packageData.glyphFileMap }
  const changedPaths = new Set<string>()
  let appendedGlyph = false

  for (const glyph of Object.values(input.dirtyGlyphs)) {
    if (!glyph) {
      continue
    }

    const relativePath =
      getGlyphKeysFromHotGlyph(glyph)
        .map((key) => glyphFileMap[key])
        .find((value): value is string => Boolean(value)) ??
      `glyphs/${sanitizeGlyphFileName(glyph.name)}.glyph`

    if (!files[relativePath]) {
      appendedGlyph = true
    }

    const patchedText = `${patchGlyphText(glyph, files[relativePath]).trim()}\n`
    files[relativePath] = patchedText
    changedPaths.add(relativePath)

    for (const key of getGlyphKeysFromHotGlyph(glyph)) {
      glyphFileMap[key] = relativePath
    }
  }

  if (appendedGlyph && files['order.plist']) {
    const orderedGlyphNames = Object.values(glyphFileMap)
      .map((relativePath) => files[relativePath])
      .filter((text): text is string => Boolean(text))
      .map((text) => parseOpenStep(text) as Record<string, unknown>)
      .map((glyph) =>
        typeof glyph.glyphname === 'string' ? glyph.glyphname : null
      )
      .filter((glyphName): glyphName is string => Boolean(glyphName))
    files['order.plist'] = `${serializeOpenStepValue(orderedGlyphNames)}\n`
    changedPaths.add('order.plist')
  }

  return {
    packageName: input.packageData.packageName,
    files,
    glyphFileMap,
    changedPaths: [...changedPaths],
  } satisfies PatchedGlyphsPackageData
}

export const writeGlyphsPackageToDirectory = async (
  packageData: PatchedGlyphsPackageData
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

  for (const relativePath of packageData.changedPaths) {
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
