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
import {
  getComponentMatrix,
  isIdentityComponentMatrix,
  type ComponentMatrix,
} from 'src/lib/components/componentTransform'
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

interface TrueTypeRawPoint {
  x: number
  y: number
  onCurve: boolean
  lastPointOfContour?: boolean
}

const splitTrueTypeContours = (points: TrueTypeRawPoint[]) => {
  const contours: TrueTypeRawPoint[][] = []
  let current: TrueTypeRawPoint[] = []
  for (const point of points) {
    current.push(point)
    if (point.lastPointOfContour) {
      contours.push(current)
      current = []
    }
  }
  if (current.length > 0) {
    contours.push(current)
  }
  return contours
}

// TrueType stores quadratic splines with the on-curve point between two
// off-curve controls left implicit (their midpoint). Materialize those implied
// on-curve points, including the one wrapping the last control back to the first.
const insertImpliedOnCurvePoints = (
  points: TrueTypeRawPoint[]
): TrueTypeRawPoint[] => {
  const result: TrueTypeRawPoint[] = []
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    result.push(current)
    if (!current.onCurve && !next.onCurve) {
      result.push({
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
        onCurve: true,
      })
    }
  }
  return result
}

const rotateTrueTypeToFirstOnCurve = (points: TrueTypeRawPoint[]) => {
  const firstOnCurveIndex = points.findIndex((point) => point.onCurve)
  if (firstOnCurveIndex <= 0) {
    return points
  }
  return [
    ...points.slice(firstOnCurveIndex),
    ...points.slice(0, firstOnCurveIndex),
  ]
}

// Rebuild a contour directly from raw TrueType points rather than opentype.js's
// flattened path commands, which emit a duplicated start point and zero-length
// segments (and a fabricated start for off-curve-first contours).
const trueTypeContourToPath = (
  rawPoints: TrueTypeRawPoint[],
  contourIndex: number
): PathData | null => {
  const points = rotateTrueTypeToFirstOnCurve(
    insertImpliedOnCurvePoints(rawPoints)
  )
  if (points.length === 0) {
    return null
  }

  const nodes: PathNode[] = []
  let nodeIndex = 0
  const idBase = contourIndex * 10000
  const isPrevOffCurve = (index: number) =>
    !points[(index - 1 + points.length) % points.length].onCurve

  points.forEach((point, index) => {
    if (!point.onCurve) {
      nodes.push(createNode(point.x, point.y, 'offcurve', idBase + nodeIndex))
    } else {
      // The on-curve node's segment type describes its incoming segment; the
      // first node's incoming segment wraps around from the tail.
      const segmentType: PathSegmentType = isPrevOffCurve(index)
        ? 'quadratic'
        : 'line'
      nodes.push(
        createOnCurveNode(point.x, point.y, segmentType, idBase + nodeIndex)
      )
    }
    nodeIndex += 1
  })

  if (nodes.length === 0) return null
  return { id: `p${contourIndex.toString(36)}`, nodes, closed: true }
}

const buildGlyphPathsFromCommands = (
  commands: opentype.PathCommand[]
): PathData[] => {
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

  return contours
    .map((contour, contourIndex) => contourToPath(contour, contourIndex))
    .filter((path): path is PathData => Boolean(path))
}

const buildGlyphPaths = (
  glyph: opentype.Glyph,
  outlinesFormat: string | undefined
): PathData[] => {
  const rawPoints = (glyph as unknown as { points?: TrueTypeRawPoint[] }).points
  // TrueType outlines: reconstruct from raw points. Composite glyphs have no
  // own points, so fall back to the command path (already decomposed).
  if (outlinesFormat === 'truetype' && rawPoints && rawPoints.length > 0) {
    return splitTrueTypeContours(rawPoints)
      .map((contour, contourIndex) =>
        trueTypeContourToPath(contour, contourIndex)
      )
      .filter((path): path is PathData => Boolean(path))
  }
  return buildGlyphPathsFromCommands(glyph.path.commands)
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
    const paths = buildGlyphPaths(glyph, font.outlinesFormat)

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

// Closed contours store their nodes rotated so a curve segment can wrap back to
// the start point: the first node is on-curve and its incoming segment's handles
// sit at the tail of the array (UFO canonical order). Rotating to the first
// on-curve node keeps moveTo on an on-curve point and lets the wrap-around
// segment below consume those trailing handles.
const rotateClosedContourToFirstOnCurve = (nodes: PathNode[]) => {
  const firstOnCurveIndex = nodes.findIndex((node) => isOnCurveNode(node))
  if (firstOnCurveIndex <= 0) {
    return nodes
  }
  return [
    ...nodes.slice(firstOnCurveIndex),
    ...nodes.slice(0, firstOnCurveIndex),
  ]
}

const appendShapeToPath = (path: opentype.Path, shape: PathData) => {
  if (shape.nodes.length === 0) return

  const nodes = shape.closed
    ? rotateClosedContourToFirstOnCurve(shape.nodes)
    : shape.nodes
  const first = nodes[0]
  path.moveTo(first.x, first.y)

  const handles: PathNode[] = []
  const drawSegment = (target: PathNode) => {
    const segmentType = getNodeSegmentType(target)
    if (segmentType === 'cubic') {
      const [handle1, handle2] = handles
      if (handle1 && handle2) {
        path.curveTo(
          handle1.x,
          handle1.y,
          handle2.x,
          handle2.y,
          target.x,
          target.y
        )
      } else {
        path.lineTo(target.x, target.y)
      }
    } else if (segmentType === 'quadratic') {
      const [handle] = handles
      if (handle) {
        path.quadraticCurveTo(handle.x, handle.y, target.x, target.y)
      } else {
        path.lineTo(target.x, target.y)
      }
    } else {
      path.lineTo(target.x, target.y)
    }
    handles.length = 0
  }

  let i = 1
  while (i < nodes.length) {
    const node = nodes[i]
    if (isOffCurveNode(node)) {
      handles.push(node)
    } else if (isOnCurveNode(node)) {
      drawSegment(node)
    }
    i += 1
  }

  // Trailing off-curve handles form the segment that wraps back to the start
  // point; its segment type is recorded on the (rotated) first node.
  if (shape.closed && handles.length > 0) {
    drawSegment(first)
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
  })

// Affine composition in DOMMatrix order: `outer` is applied after `inner`, so a
// point p maps to outer(inner(p)). Used to fold a component's transform into its
// parent's when flattening nested references.
const composeMatrices = (
  outer: ComponentMatrix,
  inner: ComponentMatrix
): ComponentMatrix => ({
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d,
  e: outer.a * inner.e + outer.c * inner.f + outer.e,
  f: outer.b * inner.e + outer.d * inner.f + outer.f,
})

const transformShape = (
  shape: PathData,
  matrix: ComponentMatrix
): PathData => ({
  ...shape,
  nodes: shape.nodes.map((node) => ({
    ...node,
    x: matrix.a * node.x + matrix.c * node.y + matrix.e,
    y: matrix.b * node.x + matrix.d * node.y + matrix.f,
  })),
})

// opentype.js glyphs only carry an outline path, so component references must be
// decomposed at export time: each referenced glyph's contours are pulled in with
// the component's affine transform applied. Recurses through nested components
// and guards against reference cycles.
const collectExportShapes = (
  glyph: GlyphData,
  glyphsById: Map<string, GlyphData>,
  matrix: ComponentMatrix,
  visiting: Set<string>
): PathData[] => {
  const layer = activeLayer(glyph)
  const isIdentity = isIdentityComponentMatrix(matrix)
  const shapes: PathData[] = layer.paths.map((shape) =>
    isIdentity ? shape : transformShape(shape, matrix)
  )
  for (const ref of layer.componentRefs) {
    const base = glyphsById.get(ref.glyphId)
    if (!base || visiting.has(ref.glyphId)) {
      continue
    }
    visiting.add(ref.glyphId)
    shapes.push(
      ...collectExportShapes(
        base,
        glyphsById,
        composeMatrices(matrix, getComponentMatrix(ref)),
        visiting
      )
    )
    visiting.delete(ref.glyphId)
  }
  return shapes
}

const IDENTITY_MATRIX: ComponentMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

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
  familyName?: string
  styleName?: string
  // OS/2 classification for exported instances (e.g. a SemiBold static instance
  // must report usWeightClass 600, not the default 400).
  weightClass?: number
  widthClass?: number
  italicAngle?: number
  // Explicit OS/2.fsSelection bits for style linking; when omitted opentype.js
  // derives them from weightClass/italicAngle.
  fsSelection?: number
}) => {
  const glyphsById = new Map(input.glyphs.map((glyph) => [glyph.id, glyph]))
  const glyphs = input.glyphs.map((glyph) => {
    const path = new opentype.Path()
    collectExportShapes(
      glyph,
      glyphsById,
      IDENTITY_MATRIX,
      new Set([glyph.id])
    ).forEach((shape) => {
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
    familyName:
      input.familyName || input.fontData.fontInfo?.familyName || 'KumikoExport',
    styleName: input.styleName || 'Regular',
    unitsPerEm: input.fontData.unitsPerEm ?? 1000,
    ascender:
      input.fontData.lineMetricsHorizontalLayout?.ascender?.value ?? 800,
    descender:
      input.fontData.lineMetricsHorizontalLayout?.descender?.value ?? -200,
    glyphs,
    // @types/opentype.js types these OS/2 fields as strings, but the runtime
    // (and the sfnt it writes) expects numbers; cast to satisfy the checker.
    ...(input.weightClass
      ? { weightClass: input.weightClass as unknown as string }
      : {}),
    ...(input.widthClass
      ? { widthClass: input.widthClass as unknown as string }
      : {}),
    ...(input.italicAngle ? { italicAngle: input.italicAngle } : {}),
    ...(input.fsSelection !== undefined
      ? { fsSelection: input.fsSelection as unknown as string }
      : {}),
  })
  const sfntBuffer = font.toArrayBuffer()
  const getOutputBuffer = async () => {
    const compiledBuffer = await compileManagedFontFeatures(
      sfntBuffer,
      input.fontData.openTypeFeatures
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
