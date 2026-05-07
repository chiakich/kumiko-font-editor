import type {
  FontData,
  GlyphData,
  GlyphMetrics,
  PathData,
  PathNode,
} from 'src/store'
import type { ProjectSourceFormat } from 'src/lib/projectFormats'
import { hashString } from 'src/lib/hash'
import {
  deleteUfoGlyphBatch,
  makeUfoGlyphKey,
  listDirtyUfoGlyphs,
  loadUfoGlyph,
  loadUfoMetadata,
  saveUfoGlyphBatch,
  saveUfoMetadata,
  saveUfoMetadataBatch,
  saveUfoProject,
  listUfoGlyphsInLayer,
  listUfoMetadataForProject,
  loadUfoProject,
  updateUfoGlyphExportState,
} from 'src/lib/ufoPersistence'
import type {
  UfoGithubSource,
  UfoGlyphAdvance,
  UfoGlyphAnchor,
  UfoGlyphComponent,
  UfoGlyphContour,
  UfoGlyphGuideline,
  UfoGlyphRecord,
  UfoLayerRecord,
  UfoMetadataRecord,
  UfoProjectRecord,
} from 'src/lib/ufoTypes'

interface ParsedUfoFolder {
  ufoId: string
  relativePath: string
  files: Record<string, string>
}

interface UfoTextEntry {
  relativePath: string
  text: string
}

export interface UfoWorkspaceEntry {
  relativePath: string
  text: string
}

export interface ImportedUfoWorkspace {
  project: UfoProjectRecord
  metadataRecords: UfoMetadataRecord[]
  glyphRecords: UfoGlyphRecord[]
  fontData: FontData
  projectMetadata: Record<string, unknown>
  projectSourceFormat: ProjectSourceFormat
}

interface UfoImportSourceOptions {
  title: string
  sourceFolderName: string
  sourceType?: 'local' | 'github'
  githubSource?: UfoGithubSource | null
}

const UFO_CREATOR = 'org.kumiko.fonteditor'

const normalizePath = (value: string) => value.replace(/\\/g, '/')

const isRelevantUfoTextFile = (relativePath: string) => {
  const normalized = normalizePath(relativePath).toLowerCase()
  if (!normalized.includes('.ufo/')) {
    return false
  }

  return (
    normalized.endsWith('.glif') ||
    normalized.endsWith('.plist') ||
    normalized.endsWith('.fea')
  )
}

const findUfoRoot = (relativePath: string) => {
  const normalized = normalizePath(relativePath).replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index]?.endsWith('.ufo')) {
      return {
        ufoId: segments.slice(0, index + 1).join('/'),
        relativePath: segments.slice(0, index + 1).join('/'),
        innerPath: segments.slice(index + 1).join('/'),
      }
    }
  }
  return null
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const parseNumeric = (value: string | null | undefined) => {
  if (!value) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const childrenOf = (element: Element) =>
  Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === Node.ELEMENT_NODE
  )

const parsePlistElement = (element: Element): unknown => {
  const tagName = element.tagName

  if (tagName === 'dict') {
    const result: Record<string, unknown> = {}
    const children = childrenOf(element)
    for (let index = 0; index < children.length; index += 2) {
      const keyElement = children[index]
      const valueElement = children[index + 1]
      if (!keyElement || keyElement.tagName !== 'key' || !valueElement) {
        continue
      }
      result[keyElement.textContent ?? ''] = parsePlistElement(valueElement)
    }
    return result
  }

  if (tagName === 'array') {
    return childrenOf(element).map((child) => parsePlistElement(child))
  }

  if (
    tagName === 'string' ||
    tagName === 'key' ||
    tagName === 'date' ||
    tagName === 'data'
  ) {
    return element.textContent ?? ''
  }

  if (tagName === 'integer' || tagName === 'real') {
    return parseNumeric(element.textContent) ?? 0
  }

  if (tagName === 'true') {
    return true
  }

  if (tagName === 'false') {
    return false
  }

  return element.textContent ?? ''
}

const parseXmlPlist = (text: string): Record<string, unknown> | unknown[] => {
  const parser = new DOMParser()
  const document = parser.parseFromString(text, 'application/xml')
  const root = document.documentElement
  const plistChild = childrenOf(root)[0] ?? root
  return parsePlistElement(plistChild) as Record<string, unknown> | unknown[]
}

const serializePlistValue = (value: unknown, indentLevel = 1): string => {
  const indent = '  '.repeat(indentLevel)
  const childIndent = '  '.repeat(indentLevel + 1)

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}<array/>`
    }
    return [
      `${indent}<array>`,
      ...value.map((item) => serializePlistValue(item, indentLevel + 1)),
      `${indent}</array>`,
    ].join('\n')
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined && entryValue !== null
    )
    if (entries.length === 0) {
      return `${indent}<dict/>`
    }
    return [
      `${indent}<dict>`,
      ...entries.flatMap(([key, entryValue]) => [
        `${childIndent}<key>${escapeXml(key)}</key>`,
        serializePlistValue(entryValue, indentLevel + 1),
      ]),
      `${indent}</dict>`,
    ].join('\n')
  }

  if (typeof value === 'boolean') {
    return `${indent}<${value ? 'true' : 'false'}/>`
  }

  if (typeof value === 'number') {
    return `${indent}<${Number.isInteger(value) ? 'integer' : 'real'}>${value}</${Number.isInteger(value) ? 'integer' : 'real'}>`
  }

  return `${indent}<string>${escapeXml(String(value ?? ''))}</string>`
}

export const serializeXmlPlist = (
  value: unknown
) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${serializePlistValue(value)}
</plist>
`

const inferOffcurveType = (
  points: Array<{
    x: number
    y: number
    type?: 'move' | 'line' | 'offcurve' | 'curve' | 'qcurve'
    smooth?: boolean
    name?: string | null
  }>
) => {
  const normalized = points.map((point) => ({ ...point }))
  for (let index = 0; index < normalized.length; index += 1) {
    const point = normalized[index]
    if (point.type && point.type !== 'offcurve') {
      continue
    }

    let cursor = index
    while (
      cursor < normalized.length &&
      (!normalized[cursor]?.type || normalized[cursor]?.type === 'offcurve')
    ) {
      cursor += 1
    }

    const nextOnCurve = normalized[cursor]
    const offcurveType = nextOnCurve?.type === 'qcurve' ? 'qcurve' : 'offcurve'
    while (
      index < normalized.length &&
      (!normalized[index]?.type || normalized[index]?.type === 'offcurve')
    ) {
      normalized[index]!.type = offcurveType
      index += 1
    }
    index -= 1
  }

  return normalized
}

const parseGlifText = (
  text: string,
  fileName: string
): Omit<
  UfoGlyphRecord,
  'projectId' | 'ufoId' | 'layerId' | 'dirty' | 'dirtyIndex' | 'updatedAt'
> => {
  const parser = new DOMParser()
  const document = parser.parseFromString(text, 'application/xml')
  const glyphElement = document.querySelector('glyph')
  if (!glyphElement) {
    throw new Error(`Invalid GLIF: ${fileName}`)
  }

  const unicodes = Array.from(glyphElement.querySelectorAll(':scope > unicode'))
    .map((node) => node.getAttribute('hex')?.toUpperCase() ?? null)
    .filter((value): value is string => Boolean(value))

  const advanceElement = glyphElement.querySelector(':scope > advance')
  const advance: UfoGlyphAdvance = {
    width: parseNumeric(advanceElement?.getAttribute('width')) ?? null,
    height: parseNumeric(advanceElement?.getAttribute('height')) ?? null,
  }

  const anchors: UfoGlyphAnchor[] = Array.from(
    glyphElement.querySelectorAll(':scope > anchor')
  ).map((anchor) => ({
    x: parseNumeric(anchor.getAttribute('x')) ?? 0,
    y: parseNumeric(anchor.getAttribute('y')) ?? 0,
    name: anchor.getAttribute('name') ?? '',
    color: anchor.getAttribute('color'),
    identifier: anchor.getAttribute('identifier'),
  }))

  const guidelines: UfoGlyphGuideline[] = Array.from(
    glyphElement.querySelectorAll(':scope > guideline')
  ).map((guide) => ({
    x: parseNumeric(guide.getAttribute('x')),
    y: parseNumeric(guide.getAttribute('y')),
    angle: parseNumeric(guide.getAttribute('angle')),
    name: guide.getAttribute('name'),
    color: guide.getAttribute('color'),
    identifier: guide.getAttribute('identifier'),
  }))

  const outlineElement = glyphElement.querySelector(':scope > outline')
  const contours: UfoGlyphContour[] = outlineElement
    ? Array.from(outlineElement.querySelectorAll(':scope > contour')).map(
        (contour) => ({
          points: inferOffcurveType(
            Array.from(contour.querySelectorAll(':scope > point')).map(
              (point) => ({
                x: parseNumeric(point.getAttribute('x')) ?? 0,
                y: parseNumeric(point.getAttribute('y')) ?? 0,
                type:
                  (point.getAttribute('type') as
                    | 'move'
                    | 'line'
                    | 'offcurve'
                    | 'curve'
                    | 'qcurve'
                    | null) ?? undefined,
                smooth: point.getAttribute('smooth') === 'yes',
                name: point.getAttribute('name'),
              })
            )
          ),
        })
      )
    : []

  const components: UfoGlyphComponent[] = outlineElement
    ? Array.from(outlineElement.querySelectorAll(':scope > component')).map(
        (component) => ({
          base: component.getAttribute('base') ?? '',
          ...(component.hasAttribute('identifier')
            ? { identifier: component.getAttribute('identifier') }
            : {}),
          ...(component.hasAttribute('xScale')
            ? { xScale: parseNumeric(component.getAttribute('xScale')) ?? 1 }
            : {}),
          ...(component.hasAttribute('xyScale')
            ? { xyScale: parseNumeric(component.getAttribute('xyScale')) ?? 0 }
            : {}),
          ...(component.hasAttribute('yxScale')
            ? { yxScale: parseNumeric(component.getAttribute('yxScale')) ?? 0 }
            : {}),
          ...(component.hasAttribute('yScale')
            ? { yScale: parseNumeric(component.getAttribute('yScale')) ?? 1 }
            : {}),
          ...(component.hasAttribute('xOffset')
            ? { xOffset: parseNumeric(component.getAttribute('xOffset')) ?? 0 }
            : {}),
          ...(component.hasAttribute('yOffset')
            ? { yOffset: parseNumeric(component.getAttribute('yOffset')) ?? 0 }
            : {}),
        })
      )
    : []

  const note = glyphElement.querySelector(':scope > note')?.textContent ?? null
  const imageElement = glyphElement.querySelector(':scope > image')
  const image = imageElement
    ? {
        fileName: imageElement.getAttribute('fileName') ?? '',
        ...(imageElement.hasAttribute('xScale')
          ? { xScale: parseNumeric(imageElement.getAttribute('xScale')) ?? 1 }
          : {}),
        ...(imageElement.hasAttribute('xyScale')
          ? { xyScale: parseNumeric(imageElement.getAttribute('xyScale')) ?? 0 }
          : {}),
        ...(imageElement.hasAttribute('yxScale')
          ? { yxScale: parseNumeric(imageElement.getAttribute('yxScale')) ?? 0 }
          : {}),
        ...(imageElement.hasAttribute('yScale')
          ? { yScale: parseNumeric(imageElement.getAttribute('yScale')) ?? 1 }
          : {}),
        ...(imageElement.hasAttribute('xOffset')
          ? { xOffset: parseNumeric(imageElement.getAttribute('xOffset')) ?? 0 }
          : {}),
        ...(imageElement.hasAttribute('yOffset')
          ? { yOffset: parseNumeric(imageElement.getAttribute('yOffset')) ?? 0 }
          : {}),
        ...(imageElement.hasAttribute('color')
          ? { color: imageElement.getAttribute('color') }
          : {}),
      }
    : null

  const libElement = glyphElement.querySelector(':scope > lib > dict')
  const lib = libElement
    ? (parsePlistElement(libElement) as Record<string, unknown>)
    : null

  return {
    glyphName:
      glyphElement.getAttribute('name') ?? fileName.replace(/\.glif$/i, ''),
    fileName,
    sourceHash: hashString(text),
    unicodes,
    advance,
    anchors,
    guidelines,
    contours,
    components,
    note,
    image,
    lib,
  }
}

const getProjectTitleFromFolder = (files: FileList | File[]) => {
  const first = Array.from(files)[0]
  const path = first?.webkitRelativePath || first?.name || 'Untitled'
  return normalizePath(path).split('/')[0] ?? 'Untitled'
}

const getUnicodeDisplayName = (unicodes: string[], glyphName: string) => {
  const primary = unicodes[0]
  if (!primary) {
    return glyphName
  }
  try {
    const codePoint = Number.parseInt(primary, 16)
    return Number.isFinite(codePoint)
      ? String.fromCodePoint(codePoint)
      : glyphName
  } catch {
    return glyphName
  }
}

const buildLineMetrics = (
  fontinfo: Record<string, unknown> | null | undefined
) => {
  if (!fontinfo) {
    return undefined
  }

  const metricKeys = [
    ['ascender', 'ascender'],
    ['descender', 'descender'],
    ['xHeight', 'xHeight'],
    ['capHeight', 'capHeight'],
  ] as const

  const result: Record<string, { value: number }> = {}
  for (const [sourceKey, targetKey] of metricKeys) {
    const value = fontinfo[sourceKey]
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[targetKey] = { value }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

const getUnitsPerEm = (fontinfo: Record<string, unknown> | null | undefined) =>
  typeof fontinfo?.unitsPerEm === 'number' &&
  Number.isFinite(fontinfo.unitsPerEm)
    ? fontinfo.unitsPerEm
    : undefined

const buildPathNodesFromContour = (contour: UfoGlyphContour): PathNode[] =>
  contour.points.map((point, index) => ({
    id: `n${index}`,
    x: point.x,
    y: point.y,
    type:
      point.type === undefined || point.type === 'offcurve'
        ? 'offcurve'
        : point.type === 'qcurve'
          ? 'qcurve'
          : point.smooth
            ? 'smooth'
            : 'corner',
  }))

const isOpenContour = (contour: UfoGlyphContour) =>
  contour.points[0]?.type === 'move'

const rotateContourToFirstOnCurve = (nodes: PathNode[]) => {
  if (nodes.length === 0) {
    return nodes
  }

  const firstOnCurveIndex = nodes.findIndex(
    (node) => node.type !== 'offcurve' && node.type !== 'qcurve'
  )

  if (firstOnCurveIndex <= 0) {
    return nodes
  }

  return [
    ...nodes.slice(firstOnCurveIndex),
    ...nodes.slice(0, firstOnCurveIndex),
  ]
}

const getPreviousHandleRun = (
  nodes: PathNode[],
  index: number,
  isClosed: boolean
) => {
  const handleIndices: number[] = []
  let cursor = index - 1

  while (cursor >= 0) {
    const node = nodes[cursor]
    if (!node || (node.type !== 'offcurve' && node.type !== 'qcurve')) {
      break
    }
    handleIndices.unshift(cursor)
    cursor -= 1
  }

  if (!isClosed || index !== 0) {
    return handleIndices.map((handleIndex) => nodes[handleIndex]!)
  }

  cursor = nodes.length - 1
  while (cursor > index) {
    const node = nodes[cursor]
    if (!node || (node.type !== 'offcurve' && node.type !== 'qcurve')) {
      break
    }
    handleIndices.unshift(cursor)
    cursor -= 1
  }

  return handleIndices.map((handleIndex) => nodes[handleIndex]!)
}

export const pathToUfoContour = (path: PathData): UfoGlyphContour => {
  const orderedNodes = path.closed
    ? rotateContourToFirstOnCurve(path.nodes)
    : path.nodes

  return {
    points: orderedNodes.map((node, index) => {
      if (node.type === 'offcurve' || node.type === 'qcurve') {
        return {
          x: node.x,
          y: node.y,
        }
      }

      const previousHandles = getPreviousHandleRun(
        orderedNodes,
        index,
        path.closed
      )
      const pointType =
        !path.closed && index === 0
          ? 'move'
          : previousHandles.length === 0
            ? 'line'
            : previousHandles.some((handle) => handle.type === 'qcurve')
              ? 'qcurve'
              : 'curve'

      return {
        x: node.x,
        y: node.y,
        type: pointType,
        smooth: node.type === 'smooth',
      }
    }),
  }
}

interface GlyphBounds {
  xMin: number
  xMax: number
}

const getContourBounds = (contour: UfoGlyphContour): GlyphBounds | null => {
  const relevantPoints = contour.points.filter(
    (point) => point.type !== 'move' || contour.points.length === 1
  )
  if (relevantPoints.length === 0) {
    return null
  }

  let xMin = Infinity
  let xMax = -Infinity
  for (const point of relevantPoints) {
    xMin = Math.min(xMin, point.x)
    xMax = Math.max(xMax, point.x)
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return null
  }

  return { xMin, xMax }
}

const transformBounds = (
  bounds: GlyphBounds,
  component: UfoGlyphComponent
): GlyphBounds => {
  const xScale = component.xScale ?? 1
  const yxScale = component.yxScale ?? 0
  const xOffset = component.xOffset ?? 0

  const candidates = [
    bounds.xMin * xScale + xOffset,
    bounds.xMax * xScale + xOffset,
    bounds.xMin * yxScale + xOffset,
    bounds.xMax * yxScale + xOffset,
  ]

  return {
    xMin: Math.min(...candidates),
    xMax: Math.max(...candidates),
  }
}

const unionBounds = (
  boundsList: Array<GlyphBounds | null>
): GlyphBounds | null => {
  const validBounds = boundsList.filter((bounds): bounds is GlyphBounds =>
    Boolean(bounds)
  )
  if (validBounds.length === 0) {
    return null
  }

  return {
    xMin: Math.min(...validBounds.map((bounds) => bounds.xMin)),
    xMax: Math.max(...validBounds.map((bounds) => bounds.xMax)),
  }
}

const buildBoundsResolver = (glyphRecords: UfoGlyphRecord[]) => {
  const recordMap = new Map(
    glyphRecords.map((record) => [record.glyphName, record])
  )
  const cache = new Map<string, GlyphBounds | null>()
  const resolving = new Set<string>()

  const resolve = (glyphName: string): GlyphBounds | null => {
    if (cache.has(glyphName)) {
      return cache.get(glyphName) ?? null
    }
    if (resolving.has(glyphName)) {
      return null
    }

    const record = recordMap.get(glyphName)
    if (!record) {
      return null
    }

    resolving.add(glyphName)
    const contourBounds = unionBounds(record.contours.map(getContourBounds))
    const componentBounds = unionBounds(
      record.components.map((component) => {
        const baseBounds = resolve(component.base)
        return baseBounds ? transformBounds(baseBounds, component) : null
      })
    )
    const resolvedBounds = unionBounds([contourBounds, componentBounds])
    resolving.delete(glyphName)
    cache.set(glyphName, resolvedBounds)
    return resolvedBounds
  }

  return resolve
}

const buildFontDataFromUfoGlyphs = (
  glyphRecords: UfoGlyphRecord[],
  metadata: UfoMetadataRecord
): FontData => {
  const resolveBounds = buildBoundsResolver(glyphRecords)

  return {
    glyphs: Object.fromEntries(
      glyphRecords.map((record) => {
        const glyphId = record.glyphName
        const name = getUnicodeDisplayName(record.unicodes, record.glyphName)
        const bounds = resolveBounds(record.glyphName)
        const width = record.advance.width ?? 0
        const lsb = Math.round(bounds?.xMin ?? 0)
        const metrics: GlyphMetrics = {
          width,
          lsb,
          rsb: Math.round(bounds ? width - bounds.xMax : width - lsb),
        }
        const paths: PathData[] = record.contours.map((contour, index) => ({
          id: `p${index}`,
          closed: !isOpenContour(contour),
          nodes: buildPathNodesFromContour(contour),
        }))

        const components = record.components.map((component) => component.base)
        const componentRefs = record.components.map((component, index) => ({
          id: component.identifier ?? `c${index}`,
          glyphId: component.base,
          x: component.xOffset ?? 0,
          y: component.yOffset ?? 0,
          scaleX: component.xScale ?? 1,
          scaleY: component.yScale ?? 1,
          rotation: 0,
        }))

        return [
          glyphId,
          {
            id: glyphId,
            name,
            activeLayerId: metadata.layers[0]?.layerId ?? 'public.default',
            unicode: record.unicodes[0] ?? null,
            export: true,
            paths,
            components,
            componentRefs,
            anchors: record.anchors.map((anchor, index) => ({
              id: anchor.identifier ?? `a${index}`,
              name: anchor.name,
              x: anchor.x,
              y: anchor.y,
            })),
            guidelines: record.guidelines.map((guide, index) => ({
              id: guide.identifier ?? `g${index}`,
              x: guide.x ?? 0,
              y: guide.y ?? 0,
              angle: guide.angle ?? 0,
              locked: false,
              name: guide.name ?? undefined,
            })),
            metrics,
          } satisfies GlyphData,
        ]
      })
    ),
    unitsPerEm: getUnitsPerEm(metadata.fontinfo),
    lineMetricsHorizontalLayout: buildLineMetrics(metadata.fontinfo),
  }
}

export const pickDefaultLayer = (metadata: UfoMetadataRecord) =>
  metadata.layers.find((layer) => layer.layerId === 'public.default') ??
  metadata.layers[0] ?? {
    layerId: 'public.default',
    glyphDir: 'glyphs',
  }

const buildWorkspaceFileMapFromEntries = (entries: UfoWorkspaceEntry[]) => {
  const candidateEntries = entries.filter((entry) =>
    isRelevantUfoTextFile(entry.relativePath)
  )

  if (candidateEntries.length === 0) {
    throw new Error('選到的資料夾裡沒有找到任何可讀的 UFO 文字檔')
  }

  const byUfo = new Map<string, ParsedUfoFolder>()
  for (const entry of candidateEntries) {
    const root = findUfoRoot(entry.relativePath)
    if (!root || !root.innerPath) {
      continue
    }
    const parsed = byUfo.get(root.relativePath) ?? {
      ufoId: root.ufoId,
      relativePath: root.relativePath,
      files: {},
    }
    parsed.files[root.innerPath] = entry.text
    byUfo.set(root.relativePath, parsed)
  }

  return [...byUfo.values()].sort((left, right) =>
    left.ufoId.localeCompare(right.ufoId)
  )
}

const buildWorkspaceEntriesFromFiles = async (
  inputFiles: FileList | File[]
) => {
  const candidateFiles = Array.from(inputFiles).filter((file) =>
    isRelevantUfoTextFile(file.webkitRelativePath || file.name)
  )

  const entries: UfoTextEntry[] = []
  for (const file of candidateFiles) {
    const relativePath = normalizePath(file.webkitRelativePath || file.name)
    try {
      entries.push({
        relativePath,
        text: await file.text(),
      })
    } catch (error) {
      throw new Error(
        `無法讀取 UFO 檔案：${relativePath}。${error instanceof Error ? error.message : '未知讀取錯誤'}`
      )
    }
  }

  return entries
}

export const importUfoWorkspaceEntries = async (
  entries: UfoWorkspaceEntry[],
  options: UfoImportSourceOptions
): Promise<ImportedUfoWorkspace> => {
  const parsedUfos = buildWorkspaceFileMapFromEntries(entries)
  if (parsedUfos.length === 0) {
    throw new Error('選到的資料夾裡沒有找到任何 .ufo')
  }

  const projectId = `ufo-${Date.now()}`
  const title = options.title
  const activeUfoId = parsedUfos[0]?.ufoId ?? null
  const createdAt = Date.now()

  const metadataRecords: UfoMetadataRecord[] = []
  const glyphRecords: UfoGlyphRecord[] = []

  for (const ufo of parsedUfos) {
    const metainfo = (
      ufo.files['metainfo.plist']
        ? parseXmlPlist(ufo.files['metainfo.plist'])
        : {}
    ) as Record<string, unknown>
    const fontinfo = (
      ufo.files['fontinfo.plist']
        ? parseXmlPlist(ufo.files['fontinfo.plist'])
        : {}
    ) as Record<string, unknown>
    const lib = (
      ufo.files['lib.plist'] ? parseXmlPlist(ufo.files['lib.plist']) : {}
    ) as Record<string, unknown>
    const groups = (
      ufo.files['groups.plist'] ? parseXmlPlist(ufo.files['groups.plist']) : {}
    ) as Record<string, unknown>
    const kerning = (
      ufo.files['kerning.plist']
        ? parseXmlPlist(ufo.files['kerning.plist'])
        : {}
    ) as Record<string, unknown>
    const featuresText = ufo.files['features.fea'] ?? null
    const layercontents = ufo.files['layercontents.plist']
      ? (parseXmlPlist(ufo.files['layercontents.plist']) as unknown[])
      : [['public.default', 'glyphs']]

    const layers: UfoLayerRecord[] = Array.isArray(layercontents)
      ? layercontents
          .map((entry) => (Array.isArray(entry) ? entry : null))
          .filter((entry): entry is unknown[] => Boolean(entry))
          .map((entry) => ({
            layerId: String(entry[0] ?? 'public.default'),
            glyphDir: String(entry[1] ?? 'glyphs'),
          }))
      : [{ layerId: 'public.default', glyphDir: 'glyphs' }]

    const defaultLayer = pickDefaultLayer({
      projectId,
      ufoId: ufo.ufoId,
      relativePath: ufo.relativePath,
      metainfo,
      fontinfo,
      lib,
      groups,
      kerning,
      featuresText,
      layers,
      contents: {},
      glyphOrder: [],
      updatedAt: createdAt,
    })

    const contentsPath = `${defaultLayer.glyphDir}/contents.plist`
    const contents = (
      ufo.files[contentsPath] ? parseXmlPlist(ufo.files[contentsPath]) : {}
    ) as Record<string, string>
    const glyphOrder = Array.isArray(lib?.['public.glyphOrder'])
      ? (lib['public.glyphOrder'] as string[])
      : Object.keys(contents)

    const metadataRecord: UfoMetadataRecord = {
      projectId,
      ufoId: ufo.ufoId,
      relativePath: ufo.relativePath,
      metainfo,
      fontinfo,
      lib,
      groups,
      kerning,
      featuresText,
      layers,
      contents,
      glyphOrder,
      updatedAt: createdAt,
    }
    metadataRecords.push(metadataRecord)

    for (const [, fileName] of Object.entries(contents)) {
      const glifText = ufo.files[`${defaultLayer.glyphDir}/${fileName}`]
      if (!glifText) {
        continue
      }
      const parsedGlyph = parseGlifText(glifText, fileName)
      glyphRecords.push({
        ...parsedGlyph,
        projectId,
        ufoId: ufo.ufoId,
        layerId: defaultLayer.layerId,
        dirty: false,
        dirtyIndex: 0,
        updatedAt: createdAt,
      })
    }
  }

  const project: UfoProjectRecord = {
    projectId,
    title,
    sourceFolderName: options.sourceFolderName,
    ufoIds: parsedUfos.map((ufo) => ufo.ufoId),
    selectedUfoId: activeUfoId,
    createdAt,
    updatedAt: createdAt,
    sourceType: options.sourceType ?? 'local',
    githubSource: options.githubSource ?? null,
  }

  const activeMetadata =
    metadataRecords.find((record) => record.ufoId === activeUfoId) ??
    metadataRecords[0]
  const activeLayer = activeMetadata
    ? pickDefaultLayer(activeMetadata)
    : { layerId: 'public.default', glyphDir: 'glyphs' }
  const activeGlyphs = glyphRecords.filter(
    (record) =>
      record.ufoId === activeUfoId && record.layerId === activeLayer.layerId
  )

  const fontData = activeMetadata
    ? buildFontDataFromUfoGlyphs(activeGlyphs, activeMetadata)
    : { glyphs: {} }
  const projectMetadata = {
    activeUfoId,
    ufoIds: project.ufoIds,
    sourceType: project.sourceType ?? 'local',
    githubSource: project.githubSource ?? null,
    ufos: metadataRecords.map((record) => ({
      ufoId: record.ufoId,
      relativePath: record.relativePath,
      familyName: record.fontinfo?.familyName ?? record.ufoId,
      styleName: record.fontinfo?.styleName ?? null,
      layerIds: record.layers.map((layer) => layer.layerId),
    })),
    fontinfo: activeMetadata?.fontinfo ?? {},
    metainfo: activeMetadata?.metainfo ?? {},
  }

  await saveUfoProject(project)
  await saveUfoMetadataBatch(metadataRecords)
  await saveUfoGlyphBatch(glyphRecords)

  return {
    project,
    metadataRecords,
    glyphRecords,
    fontData,
    projectMetadata,
    projectSourceFormat: 'ufo',
  }
}

export const importUfoWorkspace = async (
  inputFiles: FileList | File[]
): Promise<ImportedUfoWorkspace> => {
  const entries = await buildWorkspaceEntriesFromFiles(inputFiles)
  return importUfoWorkspaceEntries(entries, {
    title: getProjectTitleFromFolder(inputFiles),
    sourceFolderName: getProjectTitleFromFolder(inputFiles),
    sourceType: 'local',
  })
}

export const loadUfoProjectIntoFontData = async (projectId: string) => {
  const project = await loadUfoProject(projectId)
  if (!project) {
    return null
  }

  const metadataRecords = await listUfoMetadataForProject(projectId)
  const activeMetadata =
    metadataRecords.find((record) => record.ufoId === project.selectedUfoId) ??
    metadataRecords[0]
  if (!activeMetadata) {
    return null
  }

  const activeLayer = pickDefaultLayer(activeMetadata)
  const glyphRecords = await listUfoGlyphsInLayer(
    projectId,
    activeMetadata.ufoId,
    activeLayer.layerId
  )
  const fontData = buildFontDataFromUfoGlyphs(glyphRecords, activeMetadata)

  return {
    project,
    metadata: activeMetadata,
    fontData,
    projectMetadata: {
      activeUfoId: activeMetadata.ufoId,
      ufoIds: project.ufoIds,
      sourceType: project.sourceType ?? 'local',
      githubSource: project.githubSource ?? null,
      ufos: metadataRecords.map((record) => ({
        ufoId: record.ufoId,
        relativePath: record.relativePath,
        familyName: record.fontinfo?.familyName ?? record.ufoId,
        styleName: record.fontinfo?.styleName ?? null,
        layerIds: record.layers.map((layer) => layer.layerId),
      })),
      fontinfo: activeMetadata.fontinfo ?? {},
      metainfo: activeMetadata.metainfo ?? {},
    },
  }
}

export const syncHotFontDataToUfoRecords = async (input: {
  projectId: string
  activeUfoId: string
  activeLayerId: string
  fontData: FontData
  dirtyGlyphIds: string[]
  deletedGlyphIds?: string[]
}) => {
  const records: UfoGlyphRecord[] = []
  const timestamp = Date.now()
  const metadata = await loadUfoMetadata(input.projectId, input.activeUfoId)
  const nextContents = { ...(metadata?.contents ?? {}) }
  const nextGlyphOrder = [...(metadata?.glyphOrder ?? [])]
  let didUpdateMetadata = false
  const deletedKeys: Array<[string, string, string, string]> = []
  const deletedFilePaths: string[] = []

  for (const glyphId of input.deletedGlyphIds ?? []) {
    const fileName = metadata?.contents?.[glyphId]
    if (fileName) {
      for (const layer of metadata?.layers ?? [
        { layerId: input.activeLayerId, glyphDir: 'glyphs' },
      ]) {
        deletedFilePaths.push(
          `${metadata.relativePath}/${layer.glyphDir}/${fileName}`
        )
      }
    }
    if (nextContents[glyphId]) {
      delete nextContents[glyphId]
      didUpdateMetadata = true
    }
    const glyphOrderIndex = nextGlyphOrder.indexOf(glyphId)
    if (glyphOrderIndex >= 0) {
      nextGlyphOrder.splice(glyphOrderIndex, 1)
      didUpdateMetadata = true
    }
    for (const layer of metadata?.layers ?? [
      { layerId: input.activeLayerId, glyphDir: 'glyphs' },
    ]) {
      deletedKeys.push(
        makeUfoGlyphKey(
          input.projectId,
          input.activeUfoId,
          layer.layerId,
          glyphId
        )
      )
    }
  }

  for (const glyphId of input.dirtyGlyphIds) {
    const glyph = input.fontData.glyphs[glyphId]
    if (!glyph) {
      continue
    }
    const existingRecord = await loadUfoGlyph(
      makeUfoGlyphKey(
        input.projectId,
        input.activeUfoId,
        input.activeLayerId,
        glyph.id
      )
    )
    const nextFileName = existingRecord?.fileName ?? `${glyph.id}.glif`
    if (!nextContents[glyph.id]) {
      nextContents[glyph.id] = nextFileName
      didUpdateMetadata = true
    }
    if (!nextGlyphOrder.includes(glyph.id)) {
      nextGlyphOrder.push(glyph.id)
      didUpdateMetadata = true
    }
    records.push({
      projectId: input.projectId,
      ufoId: input.activeUfoId,
      layerId: input.activeLayerId,
      glyphName: glyph.id,
      fileName: nextFileName,
      sourceHash: existingRecord?.sourceHash ?? null,
      unicodes: glyph.unicode ? [glyph.unicode.toUpperCase()] : [],
      advance: {
        width: glyph.metrics.width,
        height: null,
      },
      anchors: (glyph.anchors ?? []).map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
        name: anchor.name,
        identifier: anchor.id,
      })),
      guidelines: (glyph.guidelines ?? []).map((guide) => ({
        x: guide.x,
        y: guide.y,
        angle: guide.angle,
        name: guide.name ?? null,
        identifier: guide.id,
      })),
      contours: glyph.paths.map((path) => ({
        ...pathToUfoContour(path),
      })),
      components: glyph.componentRefs.map((component) => ({
        base: component.glyphId,
        identifier: component.id,
        xScale: component.scaleX,
        yScale: component.scaleY,
        xOffset: component.x,
        yOffset: component.y,
      })),
      note: existingRecord?.note ?? null,
      image: existingRecord?.image ?? null,
      lib: existingRecord?.lib ?? null,
      dirty: true,
      dirtyIndex: 1,
      updatedAt: timestamp,
    })
  }

  if (records.length > 0) {
    await saveUfoGlyphBatch(records)
  }
  if (deletedKeys.length > 0) {
    await deleteUfoGlyphBatch(deletedKeys)
  }

  if (metadata && didUpdateMetadata) {
    await saveUfoMetadata({
      ...metadata,
      contents: nextContents,
      glyphOrder: nextGlyphOrder,
      updatedAt: timestamp,
    })
  }

  return {
    deletedFilePaths,
  }
}

export const serializeGlifRecord = (record: UfoGlyphRecord) => {
  const contourXml = record.contours
    .map(
      (contour) => `    <contour>
${contour.points
  .map((point) => {
    const attrs = [
      `x="${point.x}"`,
      `y="${point.y}"`,
      ...(point.type
        ? [`type="${point.type === 'qcurve' ? 'qcurve' : point.type}"`]
        : []),
      ...(point.smooth ? ['smooth="yes"'] : []),
      ...(point.name ? [`name="${escapeXml(point.name)}"`] : []),
    ]
    return `      <point ${attrs.join(' ')}/>`
  })
  .join('\n')}
    </contour>`
    )
    .join('\n')

  const componentXml = record.components
    .map((component) => {
      const attrs = [
        `base="${escapeXml(component.base)}"`,
        ...(component.identifier
          ? [`identifier="${escapeXml(component.identifier)}"`]
          : []),
        ...(component.xScale !== undefined
          ? [`xScale="${component.xScale}"`]
          : []),
        ...(component.xyScale !== undefined
          ? [`xyScale="${component.xyScale}"`]
          : []),
        ...(component.yxScale !== undefined
          ? [`yxScale="${component.yxScale}"`]
          : []),
        ...(component.yScale !== undefined
          ? [`yScale="${component.yScale}"`]
          : []),
        ...(component.xOffset !== undefined
          ? [`xOffset="${component.xOffset}"`]
          : []),
        ...(component.yOffset !== undefined
          ? [`yOffset="${component.yOffset}"`]
          : []),
      ]
      return `    <component ${attrs.join(' ')}/>`
    })
    .join('\n')

  const outlineChildren = [contourXml, componentXml].filter(Boolean).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="${escapeXml(record.glyphName)}" format="2">
${record.advance.width !== null ? `  <advance width="${record.advance.width}"/>` : ''}
${record.unicodes.map((unicode) => `  <unicode hex="${unicode}"/>`).join('\n')}
${record.note ? `  <note>${escapeXml(record.note)}</note>` : ''}
${record.guidelines
  .map((guide) => {
    const attrs = [
      ...(guide.x !== null && guide.x !== undefined ? [`x="${guide.x}"`] : []),
      ...(guide.y !== null && guide.y !== undefined ? [`y="${guide.y}"`] : []),
      ...(guide.angle !== null && guide.angle !== undefined
        ? [`angle="${guide.angle}"`]
        : []),
      ...(guide.name ? [`name="${escapeXml(guide.name)}"`] : []),
      ...(guide.color ? [`color="${escapeXml(guide.color)}"`] : []),
      ...(guide.identifier
        ? [`identifier="${escapeXml(guide.identifier)}"`]
        : []),
    ]
    return `  <guideline ${attrs.join(' ')}/>`
  })
  .join('\n')}
${record.anchors
  .map((anchor) => {
    const attrs = [
      `x="${anchor.x}"`,
      `y="${anchor.y}"`,
      `name="${escapeXml(anchor.name)}"`,
      ...(anchor.color ? [`color="${escapeXml(anchor.color)}"`] : []),
      ...(anchor.identifier
        ? [`identifier="${escapeXml(anchor.identifier)}"`]
        : []),
    ]
    return `  <anchor ${attrs.join(' ')}/>`
  })
  .join('\n')}
${outlineChildren ? `  <outline>\n${outlineChildren}\n  </outline>` : ''}
${record.lib ? `  <lib>\n${serializePlistValue(record.lib, 2)}\n  </lib>` : ''}
</glyph>
`
}

export const exportUfoProjectToDirectory = async (projectId: string) => {
  const project = await loadUfoProject(projectId)
  if (!project) {
    throw new Error('找不到 UFO 專案')
  }

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
  const metadataRecords = await listUfoMetadataForProject(projectId)
  const dirtyGlyphs = await listDirtyUfoGlyphs(projectId)
  const dirtyKeySet = new Set(
    dirtyGlyphs.map(
      (glyph) =>
        `${glyph.projectId}::${glyph.ufoId}::${glyph.layerId}::${glyph.glyphName}`
    )
  )
  const exportStateUpdates: Array<{
    key: [string, string, string, string]
    dirty: boolean
    sourceHash: string | null
  }> = []

  const ensureDirectoryPath = async (
    directoryHandle: FileSystemDirectoryHandle,
    relativePath: string
  ) => {
    const segments = relativePath.split('/').filter(Boolean)
    let currentHandle = directoryHandle
    for (const segment of segments) {
      currentHandle = await currentHandle.getDirectoryHandle(segment, {
        create: true,
      })
    }
    return currentHandle
  }

  for (const metadata of metadataRecords) {
    const ufoHandle = await ensureDirectoryPath(
      rootHandle,
      metadata.relativePath
    )
    const defaultLayer = pickDefaultLayer(metadata)
    const glyphRecords = await listUfoGlyphsInLayer(
      projectId,
      metadata.ufoId,
      defaultLayer.layerId
    )

    const writeTextFile = async (
      directory: FileSystemDirectoryHandle,
      name: string,
      content: string
    ) => {
      const fileHandle = await directory.getFileHandle(name, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
    }

    await writeTextFile(
      ufoHandle,
      'metainfo.plist',
      serializeXmlPlist({
        creator: metadata.metainfo?.creator ?? UFO_CREATOR,
        formatVersion: metadata.metainfo?.formatVersion ?? 3,
        formatVersionMinor: metadata.metainfo?.formatVersionMinor ?? 0,
      })
    )
    await writeTextFile(
      ufoHandle,
      'fontinfo.plist',
      serializeXmlPlist(metadata.fontinfo ?? {})
    )
    await writeTextFile(
      ufoHandle,
      'lib.plist',
      serializeXmlPlist(metadata.lib ?? {})
    )
    await writeTextFile(
      ufoHandle,
      'groups.plist',
      serializeXmlPlist(metadata.groups ?? {})
    )
    await writeTextFile(
      ufoHandle,
      'kerning.plist',
      serializeXmlPlist(metadata.kerning ?? {})
    )
    if (metadata.featuresText !== null) {
      await writeTextFile(ufoHandle, 'features.fea', metadata.featuresText)
    }
    await writeTextFile(
      ufoHandle,
      'layercontents.plist',
      serializeXmlPlist(
        metadata.layers.map((layer) => [layer.layerId, layer.glyphDir])
      )
    )

    for (const layer of metadata.layers) {
      const layerHandle = await ufoHandle.getDirectoryHandle(layer.glyphDir, {
        create: true,
      })
      const layerGlyphs =
        layer.layerId === defaultLayer.layerId
          ? glyphRecords
          : await listUfoGlyphsInLayer(projectId, metadata.ufoId, layer.layerId)
      const contents = Object.fromEntries(
        layerGlyphs.map((glyph) => [glyph.glyphName, glyph.fileName])
      )
      await writeTextFile(
        layerHandle,
        'contents.plist',
        serializeXmlPlist(contents)
      )
      for (const glyph of layerGlyphs) {
        const key = `${glyph.projectId}::${glyph.ufoId}::${glyph.layerId}::${glyph.glyphName}`
        if (dirtyKeySet.size > 0 && !dirtyKeySet.has(key)) {
          continue
        }
        const glifText = serializeGlifRecord(glyph)
        const nextHash = hashString(glifText)
        if (glyph.sourceHash !== nextHash) {
          await writeTextFile(layerHandle, glyph.fileName, glifText)
        }
        exportStateUpdates.push({
          key: [glyph.projectId, glyph.ufoId, glyph.layerId, glyph.glyphName],
          dirty: false,
          sourceHash: nextHash,
        })
      }
    }
  }

  await updateUfoGlyphExportState(exportStateUpdates)
}
