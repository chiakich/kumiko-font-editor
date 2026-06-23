import type {
  FontData,
  FontSource,
  GlyphData,
  GlyphLayerData,
  GlyphMetrics,
  PathData,
  PathNode,
} from 'src/store'
import {
  getNodeSegmentType,
  getNodeType,
  isOffCurveNode,
  isOnCurveNode,
} from 'src/store'
import {
  designspaceDefaultLocation,
  designspaceToFontAxes,
  parseDesignspace,
  type Designspace,
} from 'src/lib/fontFormats/designspace'
import type { ProjectSourceFormat } from 'src/lib/project/projectFormats'
import type { KumikoProjectSourceData } from 'src/lib/project/kumikoProjectTypes'
import { hashString } from 'src/lib/hash'
import { normalizeUnicodeHex } from 'src/lib/project/unicode'
import { parseUfoColor, serializeUfoColor } from 'src/lib/color/kumikoColor'
import { gitBlobShaFromText } from 'src/lib/github/sync/gitBlobSha'
import {
  defaultFontSource,
  fontInfoFromUfoFontInfo,
  fontAxesFromLib,
  fontSourcesFromLib,
  exportInstancesFromLib,
  statusDefinitionsFromLib,
  settingsFromLib,
} from 'src/lib/fontFormats/fontInfoSettings'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'
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
} from 'src/lib/fontFormats/ufoTypes'

export interface ParsedUfoFolder {
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
  projectSourceData: KumikoProjectSourceData
  projectSourceFormat: ProjectSourceFormat
}

export interface UfoImportSourceOptions {
  title: string
  sourceFolderName: string
  sourceType?: 'local' | 'github'
  githubSource?: UfoGithubSource | null
  designspacePath?: string | null
}

const normalizePath = (value: string) => value.replace(/\\/g, '/')

// UI-state key: the parsed designspace, persisted so multi-master survives reload
// (UFO projects are rebuilt from the ufo stores, not the draft fontData).
export const UFO_DESIGNSPACE_KEY = 'ufo-designspace'

export const isDesignspaceFile = (relativePath: string) =>
  normalizePath(relativePath).toLowerCase().endsWith('.designspace')

export const isRelevantUfoTextFile = (relativePath: string) => {
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
    if (segments[index]?.toLowerCase().endsWith('.ufo')) {
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

// DOMParser does not throw on malformed XML; it returns a document with a
// <parsererror> element. Surface that instead of silently parsing garbage.
const parseXmlDocument = (text: string, context: string) => {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) {
    throw new Error(`Malformed XML: ${context}`)
  }
  return document
}

const parseXmlPlist = (text: string): Record<string, unknown> | unknown[] => {
  const document = parseXmlDocument(text, 'plist')
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
    color?: string | null
    identifier?: string | null
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

    while (
      index < normalized.length &&
      (!normalized[index]?.type || normalized[index]?.type === 'offcurve')
    ) {
      normalized[index]!.type = 'offcurve'
      index += 1
    }
    index -= 1
  }

  return normalized
}

export const parseGlifText = (
  text: string,
  fileName: string
): Omit<
  UfoGlyphRecord,
  'projectId' | 'ufoId' | 'layerId' | 'dirty' | 'dirtyIndex' | 'updatedAt'
> => {
  const document = parseXmlDocument(text, fileName)
  const glyphElement = document.querySelector('glyph')
  if (!glyphElement) {
    throw new Error(`Invalid GLIF: ${fileName}`)
  }

  const unicodes = Array.from(glyphElement.querySelectorAll(':scope > unicode'))
    .map((node) => normalizeUnicodeHex(node.getAttribute('hex')))
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
                color: point.getAttribute('color'),
                identifier: point.getAttribute('identifier'),
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
    id: point.identifier ?? `n${index}`,
    identifier: point.identifier,
    name: point.name,
    color: parseUfoColor(point.color),
    x: point.x,
    y: point.y,
    ...(point.type === undefined || point.type === 'offcurve'
      ? { kind: 'offcurve' as const }
      : {
          kind: 'oncurve' as const,
          segmentType:
            point.type === 'qcurve'
              ? ('quadratic' as const)
              : point.type === 'curve'
                ? ('cubic' as const)
                : ('line' as const),
          smooth: point.smooth,
        }),
  }))

const isOpenContour = (contour: UfoGlyphContour) =>
  contour.points[0]?.type === 'move'

const rotateContourToFirstOnCurve = (nodes: PathNode[]) => {
  if (nodes.length === 0) {
    return nodes
  }

  const firstOnCurveIndex = nodes.findIndex((node) => isOnCurveNode(node))

  if (firstOnCurveIndex <= 0) {
    return nodes
  }

  return [
    ...nodes.slice(firstOnCurveIndex),
    ...nodes.slice(0, firstOnCurveIndex),
  ]
}

export const pathToUfoContour = (path: PathData): UfoGlyphContour => {
  const orderedNodes = path.closed
    ? rotateContourToFirstOnCurve(path.nodes)
    : path.nodes

  return {
    points: orderedNodes.map((node, index) => {
      if (isOffCurveNode(node)) {
        return {
          x: node.x,
          y: node.y,
          name: node.name,
          identifier: node.identifier,
          color: serializeUfoColor(node.color),
        }
      }

      const pointType =
        !path.closed && index === 0
          ? 'move'
          : getNodeSegmentType(node) === 'quadratic'
            ? 'qcurve'
            : getNodeSegmentType(node) === 'cubic'
              ? 'curve'
              : 'line'

      return {
        x: node.x,
        y: node.y,
        type: pointType,
        smooth: getNodeType(node) === 'smooth',
        name: node.name,
        identifier: node.identifier,
        color: serializeUfoColor(node.color),
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

export const buildBoundsResolver = (glyphRecords: UfoGlyphRecord[]) => {
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

// Build the interpolatable content (outline + metrics) of one glyph layer from
// its UFO record. Shared by the master layer and backup layers.
export const glyphRecordToLayerContent = (
  record: UfoGlyphRecord,
  resolveBounds: (glyphName: string) => GlyphBounds | null
) => {
  const width = record.advance.width ?? 0
  const bounds = resolveBounds(record.glyphName)
  const lsb = Math.round(bounds?.xMin ?? 0)
  const metrics: GlyphMetrics = {
    width,
    lsb,
    rsb: Math.round(bounds ? width - bounds.xMax : width - lsb),
  }
  return {
    paths: record.contours.map((contour, index) => ({
      id: `p${index}`,
      closed: !isOpenContour(contour),
      nodes: buildPathNodesFromContour(contour),
    })),
    components: record.components.map((component) => component.base),
    componentRefs: record.components.map((component, index) => ({
      id: component.identifier ?? `c${index}`,
      glyphId: component.base,
      x: component.xOffset ?? 0,
      y: component.yOffset ?? 0,
      scaleX: component.xScale ?? 1,
      scaleY: component.yScale ?? 1,
      xyScale: component.xyScale ?? 0,
      yxScale: component.yxScale ?? 0,
      rotation: 0,
    })),
    anchors: record.anchors.map((anchor, index) => ({
      id: anchor.identifier ?? `a${index}`,
      name: anchor.name,
      x: anchor.x,
      y: anchor.y,
      color: parseUfoColor(anchor.color),
    })),
    guidelines: record.guidelines.map((guide, index) => ({
      id: guide.identifier ?? `g${index}`,
      x: guide.x ?? 0,
      y: guide.y ?? 0,
      angle: guide.angle ?? 0,
      locked: false,
      name: guide.name ?? undefined,
      color: parseUfoColor(guide.color),
    })),
    metrics,
  }
}

const buildFontDataFromUfoGlyphs = (
  glyphRecords: UfoGlyphRecord[],
  metadata: UfoMetadataRecord,
  allLayerGlyphRecords: UfoGlyphRecord[] = glyphRecords
): FontData => {
  const resolveBounds = buildBoundsResolver(glyphRecords)
  const defaultLayer = pickDefaultLayer(metadata)
  const backgroundLayers = metadata.layers.filter((layer) =>
    isUfoBackgroundLayer(layer, defaultLayer)
  )
  const backgroundGlyphRecords = allLayerGlyphRecords.filter(
    (record) =>
      record.ufoId === metadata.ufoId &&
      backgroundLayers.some((layer) => layer.layerId === record.layerId)
  )
  const backgroundBounds = buildBoundsResolver([
    ...glyphRecords,
    ...backgroundGlyphRecords,
  ])
  const backgroundByGlyphName = new Map(
    backgroundGlyphRecords.map((record) => [
      record.glyphName,
      glyphRecordToLayerContent(record, backgroundBounds),
    ])
  )

  const axes = fontAxesFromLib(metadata.lib)
  const fontInfo = fontInfoFromUfoFontInfo(metadata.fontinfo)
  if (
    fontInfo &&
    metadata.lib?.['com.kumiko.fontEditor.openTypeNameRecords'] &&
    typeof metadata.lib['com.kumiko.fontEditor.openTypeNameRecords'] ===
      'object'
  ) {
    fontInfo.openTypeNameRecords = metadata.lib[
      'com.kumiko.fontEditor.openTypeNameRecords'
    ] as NonNullable<FontData['fontInfo']>['openTypeNameRecords']
  }
  if (
    fontInfo &&
    metadata.lib?.['com.kumiko.fontEditor.localizedNames'] &&
    typeof metadata.lib['com.kumiko.fontEditor.localizedNames'] === 'object'
  ) {
    fontInfo.localizedNames = metadata.lib[
      'com.kumiko.fontEditor.localizedNames'
    ] as NonNullable<FontData['fontInfo']>['localizedNames']
  }
  const postscriptNames =
    metadata.lib?.['public.postscriptNames'] &&
    typeof metadata.lib['public.postscriptNames'] === 'object'
      ? (metadata.lib['public.postscriptNames'] as Record<string, string>)
      : {}
  const masterName =
    typeof metadata.fontinfo?.styleName === 'string' &&
    metadata.fontinfo.styleName
      ? metadata.fontinfo.styleName
      : 'Regular'
  const masterId = metadata.ufoId
  return {
    glyphs: Object.fromEntries(
      glyphRecords.map((record) => {
        const glyphId = record.glyphName

        return [
          glyphId,
          {
            id: glyphId,
            name: glyphId,
            activeLayerId: masterId,
            layerOrder: [masterId],
            layers: {
              [masterId]: {
                id: masterId,
                name: masterName,
                type: 'master',
                associatedMasterId: masterId,
                sourceData: {
                  ufo: {
                    ufoId: record.ufoId,
                    layerId: record.layerId,
                    glyphDir: getGlyphDirForLayer(metadata, record.layerId),
                    fileName: record.fileName,
                    sourceHash: record.sourceHash,
                    remoteBlobSha: record.remoteBlobSha ?? null,
                    note: record.note,
                    lib: record.lib,
                  },
                },
                image: record.image
                  ? {
                      ...record.image,
                      color: parseUfoColor(record.image.color),
                    }
                  : null,
                background: backgroundByGlyphName.get(record.glyphName) ?? null,
                ...glyphRecordToLayerContent(record, resolveBounds),
              },
            },
            unicodes: record.unicodes,
            production: postscriptNames[glyphId] ?? null,
            export: true,
            sourceData: {
              ufo: {
                fileName: record.fileName,
                sourceHash: record.sourceHash,
                remoteBlobSha: record.remoteBlobSha ?? null,
              },
            },
          } satisfies GlyphData,
        ]
      })
    ),
    fontInfo,
    axes,
    sources: fontSourcesFromLib(metadata.lib) ?? {
      [metadata.ufoId]: defaultFontSource(
        metadata.ufoId,
        typeof metadata.fontinfo?.styleName === 'string'
          ? metadata.fontinfo.styleName
          : 'Regular',
        { lineMetricsHorizontalLayout: buildLineMetrics(metadata.fontinfo) }
      ),
    },
    exportInstances: exportInstancesFromLib(metadata.lib) ?? [],
    statusDefinitions: statusDefinitionsFromLib(metadata.lib) ?? [],
    settings: settingsFromLib(metadata.lib, axes),
    glyphOrder: metadata.glyphOrder,
    unitsPerEm: getUnitsPerEm(metadata.fontinfo),
    lineMetricsHorizontalLayout: buildLineMetrics(metadata.fontinfo),
    openTypeFeatures: metadata.featuresText
      ? classifyRawFeatureTextSource(
          setRawFeatureTextSource(
            createEmptyOpenTypeFeaturesState(),
            metadata.featuresText,
            {
              origin: 'ufo-import',
              path: 'features.fea',
              title: 'UFO features.fea',
            }
          ),
          {
            origin: 'ufo-import',
          }
        )
      : createEmptyOpenTypeFeaturesState(),
  }
}

export const pickDefaultLayer = (metadata: UfoMetadataRecord) =>
  metadata.layers.find((layer) => layer.layerId === 'public.default') ??
  metadata.layers[0] ?? {
    layerId: 'public.default',
    glyphDir: 'glyphs',
  }

export const isUfoBackgroundLayer = (
  layer: UfoLayerRecord,
  defaultLayer: UfoLayerRecord
) =>
  layer.layerId !== defaultLayer.layerId &&
  (layer.layerId.toLowerCase().includes('background') ||
    layer.glyphDir.toLowerCase().includes('background'))

const getLayerById = (metadata: UfoMetadataRecord, layerId: string) =>
  metadata.layers.find((layer) => layer.layerId === layerId)

const getGlyphDirForLayer = (metadata: UfoMetadataRecord, layerId: string) =>
  getLayerById(metadata, layerId)?.glyphDir ??
  pickDefaultLayer(metadata).glyphDir

const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? path

const locationsEqual = (
  a: Record<string, number>,
  b: Record<string, number>
): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) {
      return false
    }
  }
  return true
}

export interface SourceRef {
  sourceId: string
  name: string
  location: Record<string, number>
  ufoId: string
  layerId: string
}

const designspaceSourceName = (source: Designspace['sources'][number]) =>
  source.layer ? `${source.name} · ${source.layer}` : source.name

// Match designspace <source> entries to parsed UFOs (by filename) and assign a
// stable source id + layer id per source. Shared by the multi-master builder and
// the save path so both agree on which UFO a source writes to.
export const resolveSourceRefs = (
  metadataRecords: UfoMetadataRecord[],
  designspace: Designspace
): SourceRef[] => {
  const usedIds = new Set<string>()
  const uniqueSourceId = (name: string): string => {
    const base = name || 'master'
    let id = base
    let counter = 2
    while (usedIds.has(id)) {
      id = `${base} (${counter})`
      counter += 1
    }
    usedIds.add(id)
    return id
  }

  const refs: SourceRef[] = []
  for (const source of designspace.sources) {
    const target = basename(source.filename)
    const metadata = metadataRecords.find(
      (record) => basename(record.relativePath) === target
    )
    if (!metadata) {
      continue
    }
    const layer = source.layer
      ? getLayerById(metadata, source.layer)
      : pickDefaultLayer(metadata)
    if (!layer) {
      continue
    }
    const name = designspaceSourceName(source)
    refs.push({
      sourceId: uniqueSourceId(name),
      name,
      location: source.location,
      ufoId: metadata.ufoId,
      layerId: layer.layerId,
    })
  }
  return refs
}

export const resolveDefaultSourceRef = (
  refs: SourceRef[],
  designspace: Designspace
): SourceRef | undefined => {
  const defaultLocation = designspaceDefaultLocation(designspace)
  return (
    refs.find((ref) => locationsEqual(ref.location, defaultLocation)) ?? refs[0]
  )
}

interface MasterSource extends SourceRef {
  metadata: UfoMetadataRecord
  resolveBounds: ReturnType<typeof buildBoundsResolver>
  backgroundByGlyphName: Map<
    string,
    ReturnType<typeof glyphRecordToLayerContent>
  >
  recordsByName: Map<string, UfoGlyphRecord>
}

const isBraceSource = (master: Pick<MasterSource, 'metadata' | 'ufoId'>) =>
  /\.brace\.ufo$/i.test(basename(master.metadata.relativePath)) ||
  /\.brace\.ufo$/i.test(basename(master.ufoId))

const ruleConditionsToBracketAxisRules = (
  conditions: NonNullable<Designspace['rules']>[number]['conditions']
): NonNullable<GlyphLayerData['bracketAxisRules']> =>
  Object.fromEntries(
    Object.entries(conditions).map(([axis, condition]) => [
      axis,
      {
        ...(condition.minimum !== undefined ? { min: condition.minimum } : {}),
        ...(condition.maximum !== undefined ? { max: condition.maximum } : {}),
      },
    ])
  )

const getBracketLayerId = (
  rule: NonNullable<Designspace['rules']>[number],
  substitution: NonNullable<
    Designspace['rules']
  >[number]['substitutions'][number]
) => {
  const rulePrefix = `${substitution.name}.`
  if (rule.name.startsWith(rulePrefix)) {
    return rule.name.slice(rulePrefix.length)
  }
  const exportedPrefix = `${substitution.name}.bracket.`
  if (substitution.with.startsWith(exportedPrefix)) {
    return substitution.with.slice(exportedPrefix.length)
  }
  return substitution.with
}

const uniqueLayerId = (
  layers: Record<string, GlyphLayerData>,
  preferredId: string
) => {
  let id = preferredId || 'layer'
  let counter = 2
  while (layers[id]) {
    id = `${preferredId}-${counter}`
    counter += 1
  }
  return id
}

// Merge several UFO sources (one per designspace <source>) into one FontData with
// one master layer per source. Pure: takes already-parsed records + designspace.
export const buildMultiMasterFontData = (
  metadataRecords: UfoMetadataRecord[],
  glyphRecords: UfoGlyphRecord[],
  designspace: Designspace
): FontData => {
  const refs = resolveSourceRefs(metadataRecords, designspace)
  const masters: MasterSource[] = refs.map((ref) => {
    const metadata = metadataRecords.find(
      (record) => record.ufoId === ref.ufoId
    )!
    const records = glyphRecords.filter(
      (record) => record.ufoId === ref.ufoId && record.layerId === ref.layerId
    )
    const defaultLayer = pickDefaultLayer(metadata)
    const backgroundLayers = metadata.layers.filter((layer) =>
      isUfoBackgroundLayer(layer, defaultLayer)
    )
    const backgroundRecords = glyphRecords.filter(
      (record) =>
        record.ufoId === ref.ufoId &&
        backgroundLayers.some((layer) => layer.layerId === record.layerId)
    )
    const backgroundBounds = buildBoundsResolver([
      ...records,
      ...backgroundRecords,
    ])
    return {
      ...ref,
      metadata,
      resolveBounds: buildBoundsResolver(records),
      backgroundByGlyphName: new Map(
        backgroundRecords.map((record) => [
          record.glyphName,
          glyphRecordToLayerContent(record, backgroundBounds),
        ])
      ),
      recordsByName: new Map(
        records.map((record) => [record.glyphName, record])
      ),
    }
  })

  const regularMasters = masters.filter((master) => !isBraceSource(master))
  const braceMasters = masters.filter(isBraceSource)

  if (regularMasters.length === 0) {
    return { glyphs: {} }
  }

  const defaultRef = resolveDefaultSourceRef(refs, designspace)
  const defaultMaster =
    regularMasters.find((master) => master.sourceId === defaultRef?.sourceId) ??
    regularMasters[0]

  const base = buildFontDataFromUfoGlyphs(
    [...defaultMaster.recordsByName.values()],
    defaultMaster.metadata
  )

  const postscriptNames =
    defaultMaster.metadata.lib?.['public.postscriptNames'] &&
    typeof defaultMaster.metadata.lib['public.postscriptNames'] === 'object'
      ? (defaultMaster.metadata.lib['public.postscriptNames'] as Record<
          string,
          string
        >)
      : {}

  // Union of glyph names: default source order first, then any extras.
  const orderedNames: string[] = []
  const seen = new Set<string>()
  const push = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name)
      orderedNames.push(name)
    }
  }
  const bracketSubstitutions = (designspace.rules ?? []).flatMap((rule) =>
    rule.substitutions.map((substitution) => ({ rule, substitution }))
  )
  const substitutedGlyphNames = new Set(
    bracketSubstitutions.map(({ substitution }) => substitution.with)
  )

  for (const name of defaultMaster.metadata.glyphOrder) {
    if (substitutedGlyphNames.has(name)) {
      continue
    }
    if (regularMasters.some((master) => master.recordsByName.has(name))) {
      push(name)
    }
  }
  for (const master of regularMasters) {
    for (const name of master.recordsByName.keys()) {
      if (substitutedGlyphNames.has(name)) {
        continue
      }
      push(name)
    }
  }

  const glyphs: Record<string, GlyphData> = {}
  for (const glyphId of orderedNames) {
    const layers: Record<string, GlyphLayerData> = {}
    const layerOrder: string[] = []
    let representative: UfoGlyphRecord | undefined

    const addLayer = (master: MasterSource) => {
      const record = master.recordsByName.get(glyphId)
      if (!record) {
        return
      }
      representative = representative ?? record
      layers[master.sourceId] = {
        id: master.sourceId,
        name: master.name,
        type: 'master',
        associatedMasterId: master.sourceId,
        sourceData: {
          ufo: {
            ufoId: record.ufoId,
            layerId: record.layerId,
            glyphDir: getGlyphDirForLayer(master.metadata, record.layerId),
            fileName: record.fileName,
            sourceHash: record.sourceHash,
            remoteBlobSha: record.remoteBlobSha ?? null,
            note: record.note,
            lib: record.lib,
          },
        },
        image: record.image
          ? {
              ...record.image,
              color: parseUfoColor(record.image.color),
            }
          : null,
        background: master.backgroundByGlyphName.get(glyphId) ?? null,
        ...glyphRecordToLayerContent(record, master.resolveBounds),
      }
      layerOrder.push(master.sourceId)
    }

    addLayer(defaultMaster)
    for (const master of regularMasters) {
      if (master !== defaultMaster) {
        addLayer(master)
      }
    }
    if (!representative || layerOrder.length === 0) {
      continue
    }

    const activeLayerId = layers[defaultMaster.sourceId]
      ? defaultMaster.sourceId
      : layerOrder[0]

    for (const braceMaster of braceMasters) {
      const record = braceMaster.recordsByName.get(glyphId)
      if (!record) {
        continue
      }
      const layerId = uniqueLayerId(layers, braceMaster.sourceId)
      layers[layerId] = {
        id: layerId,
        name: braceMaster.name,
        type: 'brace',
        associatedMasterId: defaultMaster.sourceId,
        braceLocation: braceMaster.location,
        sourceData: {
          ufo: {
            ufoId: record.ufoId,
            layerId: record.layerId,
            glyphDir: getGlyphDirForLayer(braceMaster.metadata, record.layerId),
            fileName: record.fileName,
            sourceHash: record.sourceHash,
            remoteBlobSha: record.remoteBlobSha ?? null,
            note: record.note,
            lib: record.lib,
          },
        },
        image: record.image
          ? {
              ...record.image,
              color: parseUfoColor(record.image.color),
            }
          : null,
        background: braceMaster.backgroundByGlyphName.get(glyphId) ?? null,
        ...glyphRecordToLayerContent(record, braceMaster.resolveBounds),
      }
      layerOrder.push(layerId)
    }

    for (const { rule, substitution } of bracketSubstitutions) {
      if (substitution.name !== glyphId) {
        continue
      }
      const substituteMaster =
        regularMasters.find((master) =>
          master.recordsByName.has(substitution.with)
        ) ?? defaultMaster
      const record = substituteMaster.recordsByName.get(substitution.with)
      if (!record) {
        continue
      }
      const layerId = uniqueLayerId(
        layers,
        getBracketLayerId(rule, substitution)
      )
      layers[layerId] = {
        id: layerId,
        name: layerId,
        type: 'bracket',
        associatedMasterId: substituteMaster.sourceId,
        bracketAxisRules: ruleConditionsToBracketAxisRules(rule.conditions),
        sourceData: {
          ufo: {
            ufoId: record.ufoId,
            layerId: record.layerId,
            glyphDir: getGlyphDirForLayer(
              substituteMaster.metadata,
              record.layerId
            ),
            fileName: record.fileName,
            sourceHash: record.sourceHash,
            remoteBlobSha: record.remoteBlobSha ?? null,
            note: record.note,
            lib: record.lib,
          },
        },
        image: record.image
          ? {
              ...record.image,
              color: parseUfoColor(record.image.color),
            }
          : null,
        background:
          substituteMaster.backgroundByGlyphName.get(substitution.with) ?? null,
        ...glyphRecordToLayerContent(record, substituteMaster.resolveBounds),
      }
      layerOrder.push(layerId)
    }

    glyphs[glyphId] = {
      id: glyphId,
      name: glyphId,
      activeLayerId,
      layerOrder,
      layers,
      unicodes: representative.unicodes,
      production: postscriptNames[glyphId] ?? null,
      export: true,
      sourceData: {
        ufo: {
          fileName: representative.fileName,
          sourceHash: representative.sourceHash,
          remoteBlobSha: representative.remoteBlobSha ?? null,
        },
      },
    }
  }

  const sources: Record<string, FontSource> = {}
  for (const master of regularMasters) {
    sources[master.sourceId] = {
      id: master.sourceId,
      name: master.name,
      location: master.location,
    }
  }

  return {
    ...base,
    glyphs,
    axes: designspaceToFontAxes(designspace),
    sources,
  }
}

export const buildWorkspaceFileMapFromEntries = (
  entries: UfoWorkspaceEntry[]
) => {
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

const dirname = (path: string) => {
  const normalized = normalizePath(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : ''
}

const joinRelativePath = (baseDir: string, path: string) => {
  const parts = normalizePath(`${baseDir ? `${baseDir}/` : ''}${path}`)
    .split('/')
    .filter(Boolean)
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '.') {
      continue
    }
    if (part === '..') {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }
  return resolved.join('/')
}

const normalizedNameKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.designspace$/i, '')
    .replace(/[^a-z0-9]+/g, '')

const sourceFolderNameKeys = (sourceFolderName?: string) => {
  if (!sourceFolderName) {
    return new Set<string>()
  }
  const normalized = normalizePath(sourceFolderName)
  const lastSegment = basename(normalized)
  return new Set(
    [normalized, lastSegment]
      .flatMap((value) => [
        value,
        value.replace(/\.git$/i, ''),
        value.replace(/-\d+$/i, ''),
        value.replace(/-main$/i, ''),
        value.replace(/-master$/i, ''),
      ])
      .map(normalizedNameKey)
      .filter(Boolean)
  )
}

const discouragedDesignspaceNamePenalty = (relativePath: string) => {
  const name = basename(relativePath).toLowerCase()
  const penalties: Array<[RegExp, number]> = [
    [/missing/, 400],
    [/no[-_ ]?default/, 320],
    [/open[-_ ]?nodes?/, 180],
    [/weight[-_ ]only|width[-_ ]only|[-_ ]only/, 120],
    [/extrapolat/, 100],
    [/anisotropic/, 80],
    [/test|debug|experiment|partial/, 40],
  ]
  return penalties.reduce(
    (total, [pattern, penalty]) => total + (pattern.test(name) ? penalty : 0),
    0
  )
}

export interface DesignspaceCandidate {
  relativePath: string
  fileName: string
  axes: Array<{ name: string; tag: string }>
  sourceCount: number
  matchedSourceCount: number
  missingSourceCount: number
  missingSourceFilenames: string[]
  hasDefaultSource: boolean
  score: number
  recommended: boolean
  parseError?: string
}

const scoreDesignspaceCandidate = (input: {
  relativePath: string
  designspace: Designspace
  matchedSourceCount: number
  missingSourceCount: number
  hasDefaultSource: boolean
  sourceFolderKeys: Set<string>
}) => {
  const candidateKey = normalizedNameKey(basename(input.relativePath))
  const exactFolderNameMatch = input.sourceFolderKeys.has(candidateKey)
  const partialFolderNameMatch = [...input.sourceFolderKeys].some(
    (key) =>
      key && (candidateKey.startsWith(key) || key.startsWith(candidateKey))
  )
  const completeSources =
    input.designspace.sources.length > 0 && input.missingSourceCount === 0

  return (
    input.matchedSourceCount * 30 +
    input.designspace.axes.length * 12 +
    input.designspace.sources.length +
    (completeSources ? 140 : 0) +
    (input.hasDefaultSource ? 30 : 0) +
    (exactFolderNameMatch ? 360 : partialFolderNameMatch ? 80 : 0) +
    (basename(input.relativePath).toLowerCase().includes('variable') ? 20 : 0) -
    input.missingSourceCount * 260 -
    dirname(input.relativePath).split('/').filter(Boolean).length * 8 -
    discouragedDesignspaceNamePenalty(input.relativePath)
  )
}

export const listDesignspaceCandidates = (
  entries: UfoWorkspaceEntry[],
  options: { sourceFolderName?: string } = {}
): DesignspaceCandidate[] => {
  const designspaceEntries = entries.filter((entry) =>
    isDesignspaceFile(entry.relativePath)
  )
  if (designspaceEntries.length === 0) {
    return []
  }

  let parsedUfos: ParsedUfoFolder[] = []
  try {
    parsedUfos = buildWorkspaceFileMapFromEntries(entries)
  } catch {
    parsedUfos = []
  }

  const ufoPaths = new Set(parsedUfos.map((ufo) => normalizePath(ufo.ufoId)))
  const ufoBasenames = new Set(parsedUfos.map((ufo) => basename(ufo.ufoId)))
  const layerIdsByUfoPath = new Map<string, Set<string>>()
  const layerIdsByUfoBasename = new Map<string, Set<string>>()
  for (const ufo of parsedUfos) {
    const rawLayercontents = ufo.files['layercontents.plist']
      ? (parseXmlPlist(ufo.files['layercontents.plist']) as unknown[])
      : [['public.default', 'glyphs']]
    const layerIds = new Set(
      Array.isArray(rawLayercontents)
        ? rawLayercontents
            .map((entry) => (Array.isArray(entry) ? String(entry[0]) : null))
            .filter((entry): entry is string => Boolean(entry))
        : ['public.default']
    )
    layerIdsByUfoPath.set(normalizePath(ufo.ufoId), layerIds)
    layerIdsByUfoBasename.set(basename(ufo.ufoId), layerIds)
  }
  const sourceFolderKeys = sourceFolderNameKeys(options.sourceFolderName)

  const candidates = designspaceEntries.map((entry): DesignspaceCandidate => {
    try {
      const designspace = parseDesignspace(entry.text, entry.relativePath)
      const baseDir = dirname(entry.relativePath)
      const missingSourceFilenames = designspace.sources
        .filter((source) => {
          const resolved = joinRelativePath(baseDir, source.filename)
          const sourceBasename = basename(source.filename)
          const hasUfo =
            ufoPaths.has(resolved) || ufoBasenames.has(sourceBasename)
          if (!hasUfo) {
            return true
          }
          if (!source.layer) {
            return false
          }
          const layerIds =
            layerIdsByUfoPath.get(resolved) ??
            layerIdsByUfoBasename.get(sourceBasename)
          return !layerIds?.has(source.layer)
        })
        .map((source) =>
          source.layer ? `${source.filename}#${source.layer}` : source.filename
        )
      const missingSourceCount = missingSourceFilenames.length
      const matchedSourceCount = Math.max(
        0,
        designspace.sources.length - missingSourceCount
      )
      const defaultLocation = designspaceDefaultLocation(designspace)
      const hasDefaultSource = designspace.sources.some((source) =>
        locationsEqual(source.location, defaultLocation)
      )
      const score = scoreDesignspaceCandidate({
        relativePath: entry.relativePath,
        designspace,
        matchedSourceCount,
        missingSourceCount,
        hasDefaultSource,
        sourceFolderKeys,
      })
      return {
        relativePath: entry.relativePath,
        fileName: basename(entry.relativePath),
        axes: designspace.axes.map((axis) => ({
          name: axis.name,
          tag: axis.tag,
        })),
        sourceCount: designspace.sources.length,
        matchedSourceCount,
        missingSourceCount,
        missingSourceFilenames,
        hasDefaultSource,
        score,
        recommended: false,
      }
    } catch (error) {
      return {
        relativePath: entry.relativePath,
        fileName: basename(entry.relativePath),
        axes: [],
        sourceCount: 0,
        matchedSourceCount: 0,
        missingSourceCount: 0,
        missingSourceFilenames: [],
        hasDefaultSource: false,
        score: Number.NEGATIVE_INFINITY,
        recommended: false,
        parseError:
          error instanceof Error ? error.message : 'Invalid designspace',
      }
    }
  })

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.relativePath.localeCompare(right.relativePath)
  )
  const recommended = candidates.find((candidate) => !candidate.parseError)
  if (recommended) {
    recommended.recommended = true
  }
  return candidates
}

const pickDesignspaceEntry = (
  entries: UfoWorkspaceEntry[],
  options: { sourceFolderName?: string; designspacePath?: string | null }
) => {
  if (options.designspacePath) {
    const requested = normalizePath(options.designspacePath)
    return entries.find(
      (entry) =>
        isDesignspaceFile(entry.relativePath) &&
        normalizePath(entry.relativePath) === requested
    )
  }

  const recommendedPath = listDesignspaceCandidates(entries, {
    sourceFolderName: options.sourceFolderName,
  }).find((candidate) => candidate.recommended)?.relativePath
  return recommendedPath
    ? entries.find(
        (entry) => normalizePath(entry.relativePath) === recommendedPath
      )
    : entries.find((entry) => isDesignspaceFile(entry.relativePath))
}

export const buildWorkspaceEntriesFromFiles = async (
  inputFiles: FileList | File[]
) => {
  const candidateFiles = Array.from(inputFiles).filter((file) => {
    const path = file.webkitRelativePath || file.name
    return isRelevantUfoTextFile(path) || isDesignspaceFile(path)
  })

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

  const designspaceEntry = pickDesignspaceEntry(entries, {
    sourceFolderName: options.sourceFolderName,
    designspacePath: options.designspacePath,
  })
  if (options.designspacePath && !designspaceEntry) {
    throw new Error(`找不到指定的 designspace：${options.designspacePath}`)
  }
  const designspace = designspaceEntry
    ? parseDesignspace(designspaceEntry.text, designspaceEntry.relativePath)
    : null
  const designspaceLayerIdsByUfoBasename = new Map<string, Set<string>>()
  for (const source of designspace?.sources ?? []) {
    if (!source.layer) {
      continue
    }
    const key = basename(source.filename)
    const layerIds = designspaceLayerIdsByUfoBasename.get(key) ?? new Set()
    layerIds.add(source.layer)
    designspaceLayerIdsByUfoBasename.set(key, layerIds)
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
    const designspaceLayerIds =
      designspaceLayerIdsByUfoBasename.get(basename(ufo.relativePath)) ??
      new Set<string>()

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

    for (const layer of layers) {
      const layerContents =
        layer.layerId === defaultLayer.layerId
          ? contents
          : ((ufo.files[`${layer.glyphDir}/contents.plist`]
              ? parseXmlPlist(ufo.files[`${layer.glyphDir}/contents.plist`])
              : {}) as Record<string, string>)

      if (
        layer.layerId !== defaultLayer.layerId &&
        !isUfoBackgroundLayer(layer, defaultLayer) &&
        !designspaceLayerIds.has(layer.layerId)
      ) {
        continue
      }

      for (const [, fileName] of Object.entries(layerContents)) {
        const glifText = ufo.files[`${layer.glyphDir}/${fileName}`]
        if (!glifText) {
          continue
        }
        const parsedGlyph = parseGlifText(glifText, fileName)
        glyphRecords.push({
          ...parsedGlyph,
          projectId,
          ufoId: ufo.ufoId,
          layerId: layer.layerId,
          remoteBlobSha:
            options.githubSource && layer.layerId === defaultLayer.layerId
              ? await gitBlobShaFromText(glifText)
              : null,
          dirty: false,
          dirtyIndex: 0,
          updatedAt: createdAt,
        })
      }
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
    lastSync: options.githubSource
      ? {
          owner: options.githubSource.owner,
          repo: options.githubSource.repo,
          ref: options.githubSource.ref,
          commitSha: options.githubSource.commitSha ?? null,
          syncedAt: createdAt,
        }
      : null,
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

  const fontData = designspace
    ? buildMultiMasterFontData(metadataRecords, glyphRecords, designspace)
    : activeMetadata
      ? buildFontDataFromUfoGlyphs(activeGlyphs, activeMetadata, glyphRecords)
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

  const projectSourceData: KumikoProjectSourceData = {
    ufo: {
      designspace,
      designspacePath: designspaceEntry?.relativePath ?? null,
      ufos: metadataRecords.map((record) => ({
        ufoId: record.ufoId,
        relativePath: record.relativePath,
        defaultLayerId: pickDefaultLayer(record).layerId,
        layers: record.layers.map((layer) => ({
          layerId: layer.layerId,
          glyphDir: layer.glyphDir,
        })),
        contents: record.contents,
        glyphOrder: record.glyphOrder,
        metainfo: record.metainfo,
        fontinfoExtra: record.fontinfo,
        libExtra: record.lib,
        groupsExtra: record.groups,
        kerningExtra: record.kerning,
      })),
      lastSync: project.lastSync,
    },
  }

  return {
    project,
    metadataRecords,
    glyphRecords,
    fontData,
    projectMetadata,
    projectSourceData,
    projectSourceFormat: designspace ? 'designspace' : 'ufo',
  }
}

export const importUfoWorkspace = async (
  inputFiles: FileList | File[],
  options: { designspacePath?: string | null } = {}
): Promise<ImportedUfoWorkspace> => {
  const entries = await buildWorkspaceEntriesFromFiles(inputFiles)
  return importUfoWorkspaceEntries(entries, {
    title: getProjectTitleFromFolder(inputFiles),
    sourceFolderName: getProjectTitleFromFolder(inputFiles),
    sourceType: 'local',
    designspacePath: options.designspacePath,
  })
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
      ...(point.color ? [`color="${escapeXml(point.color)}"`] : []),
      ...(point.identifier
        ? [`identifier="${escapeXml(point.identifier)}"`]
        : []),
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

  const imageXml = record.image
    ? `  <image ${[
        `fileName="${escapeXml(record.image.fileName)}"`,
        ...(record.image.xScale !== undefined
          ? [`xScale="${record.image.xScale}"`]
          : []),
        ...(record.image.xyScale !== undefined
          ? [`xyScale="${record.image.xyScale}"`]
          : []),
        ...(record.image.yxScale !== undefined
          ? [`yxScale="${record.image.yxScale}"`]
          : []),
        ...(record.image.yScale !== undefined
          ? [`yScale="${record.image.yScale}"`]
          : []),
        ...(record.image.xOffset !== undefined
          ? [`xOffset="${record.image.xOffset}"`]
          : []),
        ...(record.image.yOffset !== undefined
          ? [`yOffset="${record.image.yOffset}"`]
          : []),
        ...(record.image.color
          ? [`color="${escapeXml(record.image.color)}"`]
          : []),
      ].join(' ')}/>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="${escapeXml(record.glyphName)}" format="2">
${record.advance.width !== null ? `  <advance width="${record.advance.width}"/>` : ''}
${record.unicodes.map((unicode) => `  <unicode hex="${unicode}"/>`).join('\n')}
${record.note ? `  <note>${escapeXml(record.note)}</note>` : ''}
${imageXml}
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
