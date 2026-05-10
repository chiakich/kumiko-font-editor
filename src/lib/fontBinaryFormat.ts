import opentype from 'opentype.js'
import {
  createFontFingerprint,
  extractBinaryFeatures,
} from 'src/lib/openTypeFeatures'
import type {
  FontData,
  FontInfo,
  GlyphData,
  PathData,
  PathNode,
} from 'src/store'
import type { ProjectSourceFormat } from 'src/lib/projectFormats'

const DEFAULT_LAYER_ID = 'public.default'
const WOFF2_WASM_URL = new URL(
  '../../node_modules/fonteditor-core/woff2/woff2.wasm',
  import.meta.url
).href

export type BinaryFontExportFormat = 'ttf' | 'otf' | 'woff' | 'woff2'

const loadFontEditorCore = async () => (await import('fonteditor-core')).default

const toExactArrayBuffer = (buffer: ArrayBuffer | Uint8Array) => {
  if (buffer instanceof ArrayBuffer) {
    return buffer
  }
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
}

const ensureWoff2Ready = async () => {
  const fonteditorCore = await loadFontEditorCore()
  if (!fonteditorCore.woff2.isInited()) {
    await fonteditorCore.woff2.init(WOFF2_WASM_URL)
  }
  return fonteditorCore
}

const toUnicodeString = (unicode: number | undefined) => {
  if (unicode === undefined) return null
  return unicode.toString(16).toUpperCase().padStart(4, '0')
}

const createNode = (
  x: number,
  y: number,
  type: PathNode['type'],
  idx: number
): PathNode => ({
  id: `node-${idx}-${Math.random().toString(36).slice(2, 8)}`,
  x,
  y,
  type,
})

const toGlyphId = (glyph: opentype.Glyph, idx: number) => {
  if (glyph.name) return glyph.name
  if (glyph.unicode !== undefined)
    return `uni${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}`
  return `glyph-${idx}`
}

const toLineMetric = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? { value } : undefined

const getOpenTypeOs2Table = (font: opentype.Font) =>
  (font as unknown as { tables?: { os2?: Record<string, unknown> } }).tables
    ?.os2

const buildLineMetricsFromOpenTypeFont = (font: opentype.Font) => {
  const os2 = getOpenTypeOs2Table(font)
  const lineMetricsHorizontalLayout = {
    ascender: toLineMetric(os2?.sTypoAscender ?? font.ascender),
    descender: toLineMetric(os2?.sTypoDescender ?? font.descender),
    xHeight: toLineMetric(os2?.sxHeight),
    capHeight: toLineMetric(os2?.sCapHeight),
  }
  const presentMetrics = Object.fromEntries(
    Object.entries(lineMetricsHorizontalLayout).filter(([, metric]) =>
      Boolean(metric)
    )
  ) as NonNullable<FontData['lineMetricsHorizontalLayout']>

  return Object.keys(presentMetrics).length > 0 ? presentMetrics : undefined
}

type OpenTypeNameTable = Record<string, Record<string, opentype.LocalizedName>>

const getLocalizedValue = (localized: opentype.LocalizedName | undefined) => {
  if (!localized) {
    return undefined
  }
  return (
    localized.en ??
    localized['en-US'] ??
    localized['en-GB'] ??
    Object.values(localized)[0] ??
    undefined
  )
}

const getLocalizedName = (font: opentype.Font, ...keys: string[]) => {
  const names = font.names as unknown as OpenTypeNameTable
  for (const key of keys) {
    const englishName = font.getEnglishName(key)
    if (englishName) {
      return englishName
    }

    for (const platform of ['unicode', 'windows', 'macintosh']) {
      const value = getLocalizedValue(names[platform]?.[key])
      if (value) {
        return value
      }
    }

    for (const platformNames of Object.values(names)) {
      const value = getLocalizedValue(platformNames[key])
      if (value) {
        return value
      }
    }
  }
  return undefined
}

const cloneNameRecords = (font: opentype.Font) =>
  JSON.parse(JSON.stringify(font.names)) as OpenTypeNameTable

const mergeLocalizedNames = (nameRecords: OpenTypeNameTable) => {
  const merged: Record<string, Record<string, string>> = {}
  for (const platform of ['macintosh', 'unicode', 'windows']) {
    for (const [nameKey, localized] of Object.entries(
      nameRecords[platform] ?? {}
    )) {
      merged[nameKey] = {
        ...(merged[nameKey] ?? {}),
        ...localized,
      }
    }
  }
  return merged
}

const buildFontInfoFromOpenTypeFont = (font: opentype.Font): FontInfo => {
  const openTypeNameRecords = cloneNameRecords(font)
  const versionText = getLocalizedName(font, 'version')
  const versionMatch = versionText?.match(/(\d+)(?:\.(\d+))?/)
  const fullName = getLocalizedName(font, 'fullName')

  return {
    familyName: getLocalizedName(font, 'preferredFamily', 'fontFamily'),
    copyright: getLocalizedName(font, 'copyright'),
    trademark: getLocalizedName(font, 'trademark'),
    description: getLocalizedName(font, 'description'),
    designer: getLocalizedName(font, 'designer'),
    designerURL: getLocalizedName(font, 'designerURL'),
    manufacturer: getLocalizedName(font, 'manufacturer'),
    manufacturerURL: getLocalizedName(font, 'manufacturerURL'),
    licenseDescription: getLocalizedName(font, 'license'),
    licenseInfoURL: getLocalizedName(font, 'licenseURL'),
    versionMajor: versionMatch
      ? Number.parseInt(versionMatch[1], 10)
      : undefined,
    versionMinor: versionMatch?.[2]
      ? Number.parseInt(versionMatch[2], 10)
      : undefined,
    localizedNames: mergeLocalizedNames(openTypeNameRecords),
    openTypeNameRecords,
    customData: {
      ...(versionText ? { openTypeNameVersion: versionText } : {}),
      ...(fullName ? { openTypeNameCompatibleFullName: fullName } : {}),
    },
  }
}

const getGlyphXBounds = (glyph: opentype.Glyph) => {
  const bounds = glyph.getBoundingBox()
  if (bounds.isEmpty()) {
    return null
  }

  return {
    xMin: bounds.x1,
    xMax: bounds.x2,
  }
}

const buildGlyphMetrics = (glyph: opentype.Glyph, width: number) => {
  const bounds = getGlyphXBounds(glyph)
  const lsb = Math.round(glyph.leftSideBearing ?? bounds?.xMin ?? 0)
  const rsb = Math.round(bounds ? width - bounds.xMax : width - lsb)

  return { lsb, rsb, width }
}

const contourToPath = (
  commands: opentype.PathCommand[],
  contourIndex: number
): PathData | null => {
  const nodes: PathNode[] = []
  let closed = false
  commands.forEach((cmd, index) => {
    if (cmd.type === 'Z') {
      closed = true
      return
    }
    if (cmd.type === 'M' || cmd.type === 'L') {
      nodes.push(
        createNode(
          cmd.x ?? 0,
          cmd.y ?? 0,
          'corner',
          contourIndex * 10000 + index
        )
      )
      return
    }
    if (cmd.type === 'Q') {
      nodes.push(
        createNode(
          cmd.x1 ?? 0,
          cmd.y1 ?? 0,
          'offcurve',
          contourIndex * 10000 + index * 2
        )
      )
      nodes.push(
        createNode(
          cmd.x ?? 0,
          cmd.y ?? 0,
          'qcurve',
          contourIndex * 10000 + index * 2 + 1
        )
      )
      return
    }
    if (cmd.type === 'C') {
      nodes.push(
        createNode(
          cmd.x1 ?? 0,
          cmd.y1 ?? 0,
          'offcurve',
          contourIndex * 10000 + index * 3
        )
      )
      nodes.push(
        createNode(
          cmd.x2 ?? 0,
          cmd.y2 ?? 0,
          'offcurve',
          contourIndex * 10000 + index * 3 + 1
        )
      )
      nodes.push(
        createNode(
          cmd.x ?? 0,
          cmd.y ?? 0,
          'corner',
          contourIndex * 10000 + index * 3 + 2
        )
      )
    }
  })

  if (nodes.length === 0) return null
  return { id: `path-${contourIndex}`, nodes, closed }
}

export const importBinaryFontFile = async (file: File) => {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const rawBuffer = await file.arrayBuffer()
  const buffer =
    ext === 'woff2'
      ? await (async () => {
          const fonteditorCore = await ensureWoff2Ready()
          return toExactArrayBuffer(fonteditorCore.woff2tottf(rawBuffer))
        })()
      : rawBuffer
  const font = opentype.parse(buffer)
  const glyphs: Record<string, GlyphData> = {}
  const glyphOrder: string[] = []

  for (let idx = 0; idx < font.glyphs.length; idx += 1) {
    const glyph = font.glyphs.get(idx)
    const commands = glyph.path.commands
    const contours: opentype.PathCommand[][] = []
    let current: opentype.PathCommand[] = []
    for (const cmd of commands) {
      if (cmd.type === 'M' && current.length > 0) {
        contours.push(current)
        current = [cmd]
      } else {
        current.push(cmd)
      }
    }
    if (current.length > 0) contours.push(current)

    const paths = contours
      .map((contour, contourIndex) => contourToPath(contour, contourIndex))
      .filter((path): path is PathData => Boolean(path))

    const width = glyph.advanceWidth ?? font.unitsPerEm
    const metrics = buildGlyphMetrics(glyph, width)
    const glyphId = toGlyphId(glyph, idx)
    glyphOrder.push(glyphId)
    glyphs[glyphId] = {
      id: glyphId,
      name: glyph.name ?? glyphId,
      unicode: toUnicodeString(glyph.unicode),
      metrics,
      paths,
      components: [],
      componentRefs: [],
      layers: {
        [DEFAULT_LAYER_ID]: {
          id: DEFAULT_LAYER_ID,
          name: 'Default',
          paths,
          components: [],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics,
        },
      },
      layerOrder: [DEFAULT_LAYER_ID],
    }
  }

  const sourceFormat: ProjectSourceFormat =
    ext === 'ttf'
      ? 'ttf'
      : ext === 'otf'
        ? 'otf'
        : ext === 'woff2'
          ? 'woff2'
          : 'woff'

  const fontData = {
    glyphs,
    glyphOrder,
    fontInfo: buildFontInfoFromOpenTypeFont(font),
    unitsPerEm: font.unitsPerEm,
    lineMetricsHorizontalLayout: buildLineMetricsFromOpenTypeFont(font),
  } as FontData

  fontData.openTypeFeatures = extractBinaryFeatures(
    buffer,
    createFontFingerprint(fontData)
  )

  return {
    projectId: `font-${Date.now()}`,
    projectTitle: file.name.replace(/\.[^.]+$/, ''),
    fontData,
    sourceFormat,
  }
}

const appendShapeToPath = (path: opentype.Path, shape: PathData) => {
  if (shape.nodes.length === 0) return

  const nodes = shape.nodes
  const first = nodes[0]
  path.moveTo(first.x, first.y)

  let i = 1
  while (i < nodes.length) {
    const node = nodes[i]

    if (node.type === 'offcurve') {
      const next = nodes[i + 1]
      if (next?.type === 'offcurve') {
        const end = nodes[i + 2]
        if (end) {
          path.curveTo(node.x, node.y, next.x, next.y, end.x, end.y)
          i += 3
          continue
        }
      }

      if (next) {
        path.quadraticCurveTo(node.x, node.y, next.x, next.y)
        i += 2
        continue
      }

      path.lineTo(node.x, node.y)
      i += 1
      continue
    }

    path.lineTo(node.x, node.y)
    i += 1
  }

  if (shape.closed) path.close()
}

export const exportFontAsBinary = (
  fontData: FontData,
  format: BinaryFontExportFormat
) => {
  const glyphList = Object.values(fontData.glyphs)
  const glyphs = glyphList.map((glyph) => {
    const path = new opentype.Path()
    glyph.paths.forEach((shape) => {
      appendShapeToPath(path, shape)
    })
    return new opentype.Glyph({
      name: glyph.name ?? glyph.id,
      unicode: glyph.unicode ? Number.parseInt(glyph.unicode, 16) : undefined,
      advanceWidth: glyph.metrics.width,
      path,
    })
  })

  const font = new opentype.Font({
    familyName: fontData.fontInfo?.familyName || 'KumikoExport',
    styleName: 'Regular',
    unitsPerEm: fontData.unitsPerEm ?? 1000,
    ascender: fontData.lineMetricsHorizontalLayout?.ascender?.value ?? 800,
    descender: fontData.lineMetricsHorizontalLayout?.descender?.value ?? -200,
    glyphs,
  })
  const sfntBuffer = font.toArrayBuffer()
  const getOutputBuffer = async () => {
    if (format === 'woff') {
      const fonteditorCore = await loadFontEditorCore()
      return fonteditorCore.ttf2woff(sfntBuffer)
    }
    if (format === 'woff2') {
      const fonteditorCore = await ensureWoff2Ready()
      return toExactArrayBuffer(fonteditorCore.ttftowoff2(sfntBuffer))
    }
    return sfntBuffer
  }
  const mime =
    format === 'woff2'
      ? 'font/woff2'
      : format === 'woff'
        ? 'font/woff'
        : format === 'otf'
          ? 'font/otf'
          : 'font/ttf'
  return getOutputBuffer().then((buffer) => new Blob([buffer], { type: mime }))
}
