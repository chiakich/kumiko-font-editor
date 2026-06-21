import opentype from 'opentype.js'
import {
  compileManagedFontFeatures,
  createFontFingerprint,
  extractBinaryFeatures,
} from 'src/lib/openTypeFeatures'
import type {
  FontData,
  FontInfo,
  GlyphData,
  PathData,
  PathNode,
  PathSegmentType,
} from 'src/store'
import { getNodeSegmentType, isOffCurveNode, isOnCurveNode } from 'src/store'
import { activeLayer } from 'src/store/glyphLayer'
import type { ProjectSourceFormat } from 'src/lib/project/projectFormats'
import { normalizeUnicodeHex } from 'src/lib/project/unicode'
import { getPrimaryGlyphUnicode } from 'src/lib/glyph/glyphUnicode'

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
  return normalizeUnicodeHex(unicode)
}

const createNode = (
  x: number,
  y: number,
  kind: PathNode['kind'],
  idx: number
): PathNode => ({
  id: `n${idx.toString(36)}`,
  x,
  y,
  kind,
})

const createOnCurveNode = (
  x: number,
  y: number,
  segmentType: PathSegmentType,
  idx: number
): PathNode => ({
  id: `n${idx.toString(36)}`,
  x,
  y,
  kind: 'oncurve',
  segmentType,
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

const buildBinarySourceData = (format: BinaryFontExportFormat) => {
  return {
    binary: {
      format,
      repoPath: null,
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
  // Use a running counter so node ids stay unique within the contour; deriving
  // ids from the command index times a per-type multiplier collides when L/C/Q
  // commands are mixed (e.g. (index 4 as C) -> 12 vs (index 12 as L) -> 12).
  let nodeIndex = 0
  const pushOffCurve = (x: number, y: number) => {
    nodes.push(createNode(x, y, 'offcurve', contourIndex * 10000 + nodeIndex))
    nodeIndex += 1
  }
  const pushOnCurve = (x: number, y: number, segmentType: PathSegmentType) => {
    nodes.push(
      createOnCurveNode(x, y, segmentType, contourIndex * 10000 + nodeIndex)
    )
    nodeIndex += 1
  }
  commands.forEach((cmd) => {
    if (cmd.type === 'Z') {
      closed = true
      return
    }
    if (cmd.type === 'M' || cmd.type === 'L') {
      pushOnCurve(cmd.x ?? 0, cmd.y ?? 0, 'line')
      return
    }
    if (cmd.type === 'Q') {
      pushOffCurve(cmd.x1 ?? 0, cmd.y1 ?? 0)
      pushOnCurve(cmd.x ?? 0, cmd.y ?? 0, 'quadratic')
      return
    }
    if (cmd.type === 'C') {
      pushOffCurve(cmd.x1 ?? 0, cmd.y1 ?? 0)
      pushOffCurve(cmd.x2 ?? 0, cmd.y2 ?? 0)
      pushOnCurve(cmd.x ?? 0, cmd.y ?? 0, 'cubic')
    }
  })

  if (nodes.length === 0) return null
  return { id: `p${contourIndex.toString(36)}`, nodes, closed }
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
    const unicode = toUnicodeString(glyph.unicode)
    glyphOrder.push(glyphId)
    glyphs[glyphId] = {
      id: glyphId,
      name: glyphId,
      unicodes: unicode ? [unicode] : [],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
      layers: {
        ['public.default']: {
          id: 'public.default',
          name: 'public.default',
          type: 'master',
          associatedMasterId: 'public.default',
          paths,
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics,
        },
      },
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
    binarySource: {
      format: sourceFormat,
      sfntBuffer: buffer.slice(0),
    },
    fontInfo: buildFontInfoFromOpenTypeFont(font),
    unitsPerEm: font.unitsPerEm,
    lineMetricsHorizontalLayout: buildLineMetricsFromOpenTypeFont(font),
  } as FontData

  fontData.openTypeFeatures = extractBinaryFeatures(
    buffer,
    createFontFingerprint(fontData),
    glyphOrder
  )

  return {
    projectId: `font-${Date.now()}`,
    projectTitle: file.name.replace(/\.[^.]+$/, ''),
    fontData,
    sourceFormat,
    projectSourceData: buildBinarySourceData(sourceFormat),
  }
}

const appendShapeToPath = (path: opentype.Path, shape: PathData) => {
  if (shape.nodes.length === 0) return

  const nodes = shape.nodes
  const first = nodes[0]
  path.moveTo(first.x, first.y)

  const handles: PathNode[] = []
  let i = 1
  while (i < nodes.length) {
    const node = nodes[i]

    if (isOffCurveNode(node)) {
      handles.push(node)
      i += 1
      continue
    }

    if (isOnCurveNode(node) && getNodeSegmentType(node) === 'cubic') {
      const [handle1, handle2] = handles
      if (handle1 && handle2) {
        path.curveTo(handle1.x, handle1.y, handle2.x, handle2.y, node.x, node.y)
      } else {
        path.lineTo(node.x, node.y)
      }
    } else if (
      isOnCurveNode(node) &&
      getNodeSegmentType(node) === 'quadratic'
    ) {
      const [handle] = handles
      if (handle) {
        path.quadraticCurveTo(handle.x, handle.y, node.x, node.y)
      } else {
        path.lineTo(node.x, node.y)
      }
    } else {
      path.lineTo(node.x, node.y)
    }
    handles.length = 0
    i += 1
  }

  if (shape.closed) path.close()
}

export const getBinaryExportGlyphList = (fontData: FontData) => {
  const glyphIds = new Set<string>()
  const glyphList: GlyphData[] = []

  const appendGlyph = (glyphId: string) => {
    const glyph = fontData.glyphs[glyphId]
    if (!glyph || glyphIds.has(glyph.id)) {
      return
    }
    glyphIds.add(glyph.id)
    glyphList.push(glyph)
  }

  if (fontData.glyphs['.notdef']) {
    appendGlyph('.notdef')
  }

  for (const glyphId of fontData.glyphOrder ?? []) {
    appendGlyph(glyphId)
  }

  for (const glyphId of Object.keys(fontData.glyphs)) {
    appendGlyph(glyphId)
  }

  return glyphList
}

// C0 control characters (U+0000–U+001F) and DEL (U+007F) should never be
// encoded in the cmap (SIL FDBP / fontbakery guidance).
const isControlCodePoint = (codePoint: number) =>
  codePoint <= 0x1f || codePoint === 0x7f

export const exportFontAsBinary = (
  fontData: FontData,
  format: BinaryFontExportFormat
) =>
  exportGlyphListAsBinary({
    fontData,
    glyphs: getBinaryExportGlyphList(fontData),
    format,
    preserveSourceFontBuffer: fontData.binarySource?.sfntBuffer.slice(0),
  })

export const exportGlyphListAsBinary = (input: {
  fontData: Pick<
    FontData,
    | 'fontInfo'
    | 'unitsPerEm'
    | 'lineMetricsHorizontalLayout'
    | 'openTypeFeatures'
  >
  glyphs: GlyphData[]
  format: BinaryFontExportFormat
  preserveSourceFontBuffer?: ArrayBuffer
}) => {
  const glyphs = input.glyphs.map((glyph) => {
    const path = new opentype.Path()
    activeLayer(glyph).paths.forEach((shape) => {
      appendShapeToPath(path, shape)
    })
    const normalizedUnicode = getPrimaryGlyphUnicode(glyph)
    const codePoint = normalizedUnicode
      ? Number.parseInt(normalizedUnicode, 16)
      : undefined
    // Per OpenType best practice (SIL FDBP, fontbakery), C0 controls (< U+0020)
    // and U+007F must not be encoded in the cmap; the glyph may still exist
    // unencoded. This also avoids polluting OS/2.usFirstCharIndex and sidesteps
    // the opentype.js U+0000/.null reservation.
    const unicode =
      codePoint !== undefined && !isControlCodePoint(codePoint)
        ? codePoint
        : undefined
    return new opentype.Glyph({
      // Glyph identity must match the working name the FEA pipeline references;
      // production names reach the post table via UFO public.postscriptNames.
      name: glyph.id,
      unicode,
      advanceWidth: activeLayer(glyph).metrics.width,
      path,
    })
  })

  const font = new opentype.Font({
    familyName: input.fontData.fontInfo?.familyName || 'KumikoExport',
    styleName: 'Regular',
    unitsPerEm: input.fontData.unitsPerEm ?? 1000,
    ascender:
      input.fontData.lineMetricsHorizontalLayout?.ascender?.value ?? 800,
    descender:
      input.fontData.lineMetricsHorizontalLayout?.descender?.value ?? -200,
    glyphs,
  })
  const sfntBuffer = font.toArrayBuffer()
  const getOutputBuffer = async () => {
    const compiledBuffer = await compileManagedFontFeatures(
      sfntBuffer,
      input.fontData.openTypeFeatures,
      {
        preserveSourceFontBuffer: input.preserveSourceFontBuffer,
      }
    )

    if (input.format === 'woff') {
      const fonteditorCore = await loadFontEditorCore()
      return fonteditorCore.ttf2woff(compiledBuffer)
    }
    if (input.format === 'woff2') {
      const fonteditorCore = await ensureWoff2Ready()
      return toExactArrayBuffer(fonteditorCore.ttftowoff2(compiledBuffer))
    }
    return compiledBuffer
  }
  const mime =
    input.format === 'woff2'
      ? 'font/woff2'
      : input.format === 'woff'
        ? 'font/woff'
        : input.format === 'otf'
          ? 'font/otf'
          : 'font/ttf'
  return getOutputBuffer().then((buffer) => new Blob([buffer], { type: mime }))
}
