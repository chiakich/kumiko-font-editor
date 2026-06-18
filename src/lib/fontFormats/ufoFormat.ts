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
import { getGlyphLayer } from 'src/store/glyphLayer'
import {
  designspaceDefaultLocation,
  designspaceToFontAxes,
  parseDesignspace,
  type Designspace,
} from 'src/lib/fontFormats/designspace'
import type { ProjectSourceFormat } from 'src/lib/project/projectFormats'
import type { KumikoProjectSourceData } from 'src/lib/project/kumikoProjectTypes'
import { hashString } from 'src/lib/hash'
import { userNameToFileName } from 'src/lib/fontFormats/ufoFileNames'
import { getComponentMatrix } from 'src/lib/components/componentTransform'
import { gitBlobShaFromText } from 'src/lib/github/sync/gitBlobSha'
import {
  buildUfoLibFromFontData,
  defaultFontSource,
  fontInfoFromUfoFontInfo,
  fontInfoToUfoFontInfo,
  fontAxesFromLib,
  fontSourcesFromLib,
  openTypeFeaturesFromUfo,
  exportInstancesFromLib,
  statusDefinitionsFromLib,
  settingsFromLib,
} from 'src/lib/fontFormats/fontInfoSettings'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { selectUfoFeatureText } from 'src/lib/openTypeFeatures/legacyFeatureText'
import {
  deleteUfoGlyphBatch,
  makeUfoGlyphKey,
  loadUfoGlyph,
  loadUfoMetadata,
  saveUfoGlyphBatch,
  saveUfoMetadata,
  loadUfoUiValue,
  listUfoGlyphsInLayer,
  listUfoMetadataForProject,
  loadUfoProject,
} from 'src/lib/fontFormats/ufoPersistence'
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

interface UfoImportSourceOptions {
  title: string
  sourceFolderName: string
  sourceType?: 'local' | 'github'
  githubSource?: UfoGithubSource | null
}

const normalizePath = (value: string) => value.replace(/\\/g, '/')

// UI-state key: the parsed designspace, persisted so multi-master survives reload
// (UFO projects are rebuilt from the ufo stores, not the draft fontData).
export const UFO_DESIGNSPACE_KEY = 'ufo-designspace'

const isDesignspaceFile = (relativePath: string) =>
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

// Build the interpolatable content (outline + metrics) of one glyph layer from
// its UFO record. Shared by the master layer and backup layers.
const glyphRecordToLayerContent = (
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
  }
}

const buildFontDataFromUfoGlyphs = (
  glyphRecords: UfoGlyphRecord[],
  metadata: UfoMetadataRecord
): FontData => {
  const resolveBounds = buildBoundsResolver(glyphRecords)

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
  return {
    glyphs: Object.fromEntries(
      glyphRecords.map((record) => {
        const glyphId = record.glyphName
        const name = getUnicodeDisplayName(record.unicodes, record.glyphName)
        const layerId = metadata.layers[0]?.layerId ?? 'public.default'

        return [
          glyphId,
          {
            id: glyphId,
            name,
            activeLayerId: layerId,
            layerOrder: [layerId],
            layers: {
              [layerId]: {
                id: layerId,
                name: layerId,
                type: 'master',
                associatedMasterId: layerId,
                sourceData: {
                  ufo: {
                    ufoId: record.ufoId,
                    layerId: record.layerId,
                    glyphDir: pickDefaultLayer(metadata).glyphDir,
                    fileName: record.fileName,
                    sourceHash: record.sourceHash,
                    remoteBlobSha: record.remoteBlobSha ?? null,
                    note: record.note,
                    image: record.image,
                    lib: record.lib,
                  },
                },
                ...glyphRecordToLayerContent(record, resolveBounds),
              },
            },
            unicode: record.unicodes[0] ?? null,
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
    features: openTypeFeaturesFromUfo(metadata.featuresText),
    exportInstances: exportInstancesFromLib(metadata.lib) ?? [],
    statusDefinitions: statusDefinitionsFromLib(metadata.lib) ?? [],
    settings: settingsFromLib(metadata.lib, axes),
    glyphOrder: metadata.glyphOrder,
    unitsPerEm: getUnitsPerEm(metadata.fontinfo),
    lineMetricsHorizontalLayout: buildLineMetrics(metadata.fontinfo),
    openTypeFeatures: createEmptyOpenTypeFeaturesState(),
  }
}

export const pickDefaultLayer = (metadata: UfoMetadataRecord) =>
  metadata.layers.find((layer) => layer.layerId === 'public.default') ??
  metadata.layers[0] ?? {
    layerId: 'public.default',
    glyphDir: 'glyphs',
  }

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
    refs.push({
      sourceId: uniqueSourceId(source.name),
      name: source.name,
      location: source.location,
      ufoId: metadata.ufoId,
      layerId: pickDefaultLayer(metadata).layerId,
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
  recordsByName: Map<string, UfoGlyphRecord>
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
    return {
      ...ref,
      metadata,
      resolveBounds: buildBoundsResolver(records),
      recordsByName: new Map(
        records.map((record) => [record.glyphName, record])
      ),
    }
  })

  if (masters.length === 0) {
    return { glyphs: {} }
  }

  const defaultRef = resolveDefaultSourceRef(refs, designspace)
  const defaultMaster =
    masters.find((master) => master.sourceId === defaultRef?.sourceId) ??
    masters[0]

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
  for (const name of defaultMaster.metadata.glyphOrder) {
    if (masters.some((master) => master.recordsByName.has(name))) {
      push(name)
    }
  }
  for (const master of masters) {
    for (const name of master.recordsByName.keys()) {
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
            glyphDir: pickDefaultLayer(master.metadata).glyphDir,
            fileName: record.fileName,
            sourceHash: record.sourceHash,
            remoteBlobSha: record.remoteBlobSha ?? null,
            note: record.note,
            image: record.image,
            lib: record.lib,
          },
        },
        ...glyphRecordToLayerContent(record, master.resolveBounds),
      }
      layerOrder.push(master.sourceId)
    }

    addLayer(defaultMaster)
    for (const master of masters) {
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

    glyphs[glyphId] = {
      id: glyphId,
      name: getUnicodeDisplayName(representative.unicodes, glyphId),
      activeLayerId,
      layerOrder,
      layers,
      unicode: representative.unicodes[0] ?? null,
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
  for (const master of masters) {
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

const buildWorkspaceEntriesFromFiles = async (
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

  const designspaceEntry = entries.find((entry) =>
    isDesignspaceFile(entry.relativePath)
  )
  const designspace = designspaceEntry
    ? parseDesignspace(designspaceEntry.text, designspaceEntry.relativePath)
    : null

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
        remoteBlobSha: options.githubSource
          ? await gitBlobShaFromText(glifText)
          : null,
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

  // Multi-master project: rebuild from every source ufo using the stored
  // designspace, so the master layers survive reload.
  const designspace = await loadUfoUiValue<Designspace>(
    projectId,
    UFO_DESIGNSPACE_KEY
  )
  if (designspace) {
    const allRecords: UfoGlyphRecord[] = []
    for (const record of metadataRecords) {
      const sourceLayer = pickDefaultLayer(record)
      allRecords.push(
        ...(await listUfoGlyphsInLayer(
          projectId,
          record.ufoId,
          sourceLayer.layerId
        ))
      )
    }
    return {
      project,
      metadata: activeMetadata,
      fontData: buildMultiMasterFontData(
        metadataRecords,
        allRecords,
        designspace
      ),
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

  const activeLayer = pickDefaultLayer(activeMetadata)
  const glyphRecords = await listUfoGlyphsInLayer(
    projectId,
    activeMetadata.ufoId,
    activeLayer.layerId
  )
  const fontData = buildFontDataFromUfoGlyphs(glyphRecords, activeMetadata)

  // Attach non-active layers as backup layers (the store source of truth).
  // The layer name is the UFO layerId itself, so no separate name map is kept.
  for (const layer of activeMetadata.layers) {
    if (layer.layerId === activeLayer.layerId) {
      continue
    }
    const backupRecords = await listUfoGlyphsInLayer(
      projectId,
      activeMetadata.ufoId,
      layer.layerId
    )
    if (backupRecords.length === 0) {
      continue
    }
    const resolveBounds = buildBoundsResolver(backupRecords)
    for (const record of backupRecords) {
      const glyph = fontData.glyphs[record.glyphName]
      if (!glyph) {
        continue
      }
      glyph.layers = glyph.layers ?? {}
      glyph.layers[layer.layerId] = {
        id: layer.layerId,
        name: layer.layerId,
        type: 'backup',
        associatedMasterId: activeLayer.layerId,
        ...glyphRecordToLayerContent(record, resolveBounds),
      }
      glyph.layerOrder = [...(glyph.layerOrder ?? []), layer.layerId]
    }
  }

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

  // Multi-master: the active layer id is a source id; resolve which UFO it writes
  // to and store under that UFO's own layer (so reload via designspace reads it).
  // readLayerId is the layer to read from the in-memory glyph (the source id).
  const readLayerId = input.activeLayerId
  let writeUfoId = input.activeUfoId
  let writeLayerId = input.activeLayerId
  const designspace = await loadUfoUiValue<Designspace>(
    input.projectId,
    UFO_DESIGNSPACE_KEY
  )
  if (designspace) {
    const refs = resolveSourceRefs(
      await listUfoMetadataForProject(input.projectId),
      designspace
    )
    const ref =
      refs.find((candidate) => candidate.sourceId === input.activeLayerId) ??
      resolveDefaultSourceRef(refs, designspace)
    if (ref) {
      writeUfoId = ref.ufoId
      writeLayerId = ref.layerId
    }
  }

  const metadata = await loadUfoMetadata(input.projectId, writeUfoId)
  const nextContents = { ...(metadata?.contents ?? {}) }
  const existingFileNames = new Set(
    Object.values(nextContents).map((fileName) => fileName.toLowerCase())
  )
  const nextGlyphOrder = [...(metadata?.glyphOrder ?? [])]
  const deletedKeys: Array<[string, string, string, string]> = []
  const deletedFilePaths: string[] = []

  for (const glyphId of input.deletedGlyphIds ?? []) {
    const fileName = metadata?.contents?.[glyphId]
    if (fileName) {
      for (const layer of metadata?.layers ?? [
        { layerId: writeLayerId, glyphDir: 'glyphs' },
      ]) {
        deletedFilePaths.push(
          `${metadata.relativePath}/${layer.glyphDir}/${fileName}`
        )
      }
    }
    if (nextContents[glyphId]) {
      delete nextContents[glyphId]
    }
    const glyphOrderIndex = nextGlyphOrder.indexOf(glyphId)
    if (glyphOrderIndex >= 0) {
      nextGlyphOrder.splice(glyphOrderIndex, 1)
    }
    for (const layer of metadata?.layers ?? [
      { layerId: writeLayerId, glyphDir: 'glyphs' },
    ]) {
      deletedKeys.push(
        makeUfoGlyphKey(input.projectId, writeUfoId, layer.layerId, glyphId)
      )
    }
  }

  for (const glyphId of input.dirtyGlyphIds) {
    const glyph = input.fontData.glyphs[glyphId]
    if (!glyph) {
      continue
    }
    const layer = getGlyphLayer(glyph, readLayerId)
    if (!layer) {
      continue
    }
    const existingRecord = await loadUfoGlyph(
      makeUfoGlyphKey(input.projectId, writeUfoId, writeLayerId, glyph.id)
    )
    const nextFileName =
      existingRecord?.fileName ??
      nextContents[glyph.id] ??
      userNameToFileName(glyph.id, existingFileNames, '.glif')
    if (!nextContents[glyph.id]) {
      nextContents[glyph.id] = nextFileName
      existingFileNames.add(nextFileName.toLowerCase())
    }
    if (!nextGlyphOrder.includes(glyph.id)) {
      nextGlyphOrder.push(glyph.id)
    }
    records.push({
      projectId: input.projectId,
      ufoId: writeUfoId,
      layerId: writeLayerId,
      glyphName: glyph.id,
      fileName: nextFileName,
      sourceHash: existingRecord?.sourceHash ?? null,
      remoteBlobSha: existingRecord?.remoteBlobSha ?? null,
      unicodes: glyph.unicode ? [glyph.unicode.toUpperCase()] : [],
      advance: {
        width: layer.metrics.width,
        height: null,
      },
      anchors: (layer.anchors ?? []).map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
        name: anchor.name,
        identifier: anchor.id,
      })),
      guidelines: (layer.guidelines ?? []).map((guide) => ({
        x: guide.x,
        y: guide.y,
        angle: guide.angle,
        name: guide.name ?? null,
        identifier: guide.id,
      })),
      contours: layer.paths.map((path) => ({
        ...pathToUfoContour(path),
      })),
      components: layer.componentRefs.map((component) => {
        const matrix = getComponentMatrix(component)
        return {
          base: component.glyphId,
          identifier: component.id,
          xScale: matrix.a,
          yScale: matrix.d,
          // Only emit shear terms when present to keep identity glyphs clean.
          ...(matrix.b !== 0 ? { xyScale: matrix.b } : {}),
          ...(matrix.c !== 0 ? { yxScale: matrix.c } : {}),
          xOffset: matrix.e,
          yOffset: matrix.f,
        }
      }),
      note: existingRecord?.note ?? null,
      image: existingRecord?.image ?? null,
      lib: existingRecord?.lib ?? null,
      dirty: true,
      dirtyIndex: 1,
      updatedAt: timestamp,
    })
  }

  // Backup layers: write each dirty glyph's backups as their own layer records,
  // and reconcile (delete) backups the glyph no longer has.
  const existingBackupLayerIds = (metadata?.layers ?? [])
    .filter((layer) => layer.layerId !== writeLayerId)
    .map((layer) => layer.layerId)
  const seenBackupLayerIds = new Set<string>()

  for (const glyphId of input.dirtyGlyphIds) {
    const glyph = input.fontData.glyphs[glyphId]
    if (!glyph) {
      continue
    }
    const fileName =
      nextContents[glyph.id] ??
      userNameToFileName(glyph.id, existingFileNames, '.glif')
    const glyphBackupIds = new Set<string>()

    for (const [layerId, layer] of Object.entries(glyph.layers ?? {})) {
      if (layerId === readLayerId || layer.type === 'master') {
        continue
      }
      glyphBackupIds.add(layerId)
      seenBackupLayerIds.add(layerId)
      const existing = await loadUfoGlyph(
        makeUfoGlyphKey(input.projectId, writeUfoId, layerId, glyph.id)
      )
      records.push({
        projectId: input.projectId,
        ufoId: writeUfoId,
        layerId,
        glyphName: glyph.id,
        fileName: existing?.fileName ?? fileName,
        sourceHash: existing?.sourceHash ?? null,
        remoteBlobSha: existing?.remoteBlobSha ?? null,
        unicodes: glyph.unicode ? [glyph.unicode.toUpperCase()] : [],
        advance: { width: layer.metrics.width, height: null },
        anchors: layer.anchors.map((anchor) => ({
          x: anchor.x,
          y: anchor.y,
          name: anchor.name,
          identifier: anchor.id,
        })),
        guidelines: layer.guidelines.map((guide) => ({
          x: guide.x,
          y: guide.y,
          angle: guide.angle,
          name: guide.name ?? null,
          identifier: guide.id,
        })),
        contours: layer.paths.map((path) => ({ ...pathToUfoContour(path) })),
        components: layer.componentRefs.map((component) => {
          const matrix = getComponentMatrix(component)
          return {
            base: component.glyphId,
            identifier: component.id,
            xScale: matrix.a,
            yScale: matrix.d,
            ...(matrix.b !== 0 ? { xyScale: matrix.b } : {}),
            ...(matrix.c !== 0 ? { yxScale: matrix.c } : {}),
            xOffset: matrix.e,
            yOffset: matrix.f,
          }
        }),
        note: existing?.note ?? null,
        image: existing?.image ?? null,
        lib: existing?.lib ?? null,
        dirty: true,
        dirtyIndex: 1,
        updatedAt: timestamp,
      })
    }

    for (const layerId of existingBackupLayerIds) {
      if (!glyphBackupIds.has(layerId)) {
        deletedKeys.push(
          makeUfoGlyphKey(input.projectId, writeUfoId, layerId, glyph.id)
        )
      }
    }
  }

  if (records.length > 0) {
    await saveUfoGlyphBatch(records)
  }
  if (deletedKeys.length > 0) {
    await deleteUfoGlyphBatch(deletedKeys)
  }

  if (metadata) {
    const nextFontInfo = {
      ...(metadata.fontinfo ?? {}),
      ...fontInfoToUfoFontInfo(
        input.fontData.fontInfo,
        typeof metadata.fontinfo?.familyName === 'string'
          ? metadata.fontinfo.familyName
          : input.projectId,
        input.fontData.unitsPerEm ?? 1000
      ),
      ...(input.fontData.lineMetricsHorizontalLayout?.ascender
        ? {
            ascender: input.fontData.lineMetricsHorizontalLayout.ascender.value,
          }
        : {}),
      ...(input.fontData.lineMetricsHorizontalLayout?.descender
        ? {
            descender:
              input.fontData.lineMetricsHorizontalLayout.descender.value,
          }
        : {}),
      ...(input.fontData.lineMetricsHorizontalLayout?.xHeight
        ? {
            xHeight: input.fontData.lineMetricsHorizontalLayout.xHeight.value,
          }
        : {}),
      ...(input.fontData.lineMetricsHorizontalLayout?.capHeight
        ? {
            capHeight:
              input.fontData.lineMetricsHorizontalLayout.capHeight.value,
          }
        : {}),
    }

    const nextLayers = [...metadata.layers]
    for (const layerId of seenBackupLayerIds) {
      if (!nextLayers.some((layer) => layer.layerId === layerId)) {
        nextLayers.push({
          layerId,
          glyphDir: `glyphs.${layerId.replace(/[^A-Za-z0-9._-]/g, '_')}`,
        })
      }
    }

    await saveUfoMetadata({
      ...metadata,
      contents: nextContents,
      featuresText: selectUfoFeatureText(input.fontData),
      fontinfo: nextFontInfo,
      glyphOrder: nextGlyphOrder,
      layers: nextLayers,
      lib: buildUfoLibFromFontData(input.fontData, metadata.lib),
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
