import type { GlyphsDocument } from 'src/lib/fontFormats/glyphsDocument'
import {
  getComponentMatrix,
  isIdentityComponentMatrix,
} from 'src/lib/components/componentTransform'
import { getNodeSegmentType, getNodeType, isOffCurveNode } from 'src/store'
import type {
  FontData,
  GlyphData,
  GlyphImage,
  GlyphLayerData,
  GlyphLayerContent,
  GlyphSourceData,
  PathNode,
} from 'src/store'
import { nearestGlyphsLabelColorIndex } from 'src/lib/color/kumikoColor'
import { getPrimaryGlyphUnicode } from 'src/lib/glyph/glyphUnicode'

// A pre-formatted OpenStep token emitted verbatim (no quoting, no re-indent).
// Used for Glyphs 3 compact tuples like `(302,128,l)` and `pos = (250,700)`,
// which must stay inline rather than being expanded by the array serializer.
class RawGlyphsValue {
  readonly raw: string
  constructor(raw: string) {
    this.raw = raw
  }
}

const quoteString = (value: string) => {
  if (/^[A-Za-z0-9._/+-]+$/.test(value)) {
    return value
  }

  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const sourceGlyphsFields = (
  sourceData: GlyphSourceData | null | undefined
): Record<string, unknown> =>
  asRecord(asRecord(sourceData).glyphs).fields
    ? asRecord(asRecord(asRecord(sourceData).glyphs).fields)
    : {}

const sourceGlyphsNodeExtraTokens = (
  sourceData: GlyphSourceData | null | undefined
) => {
  const tokens = sourceGlyphsFields(sourceData).nodeExtraTokens
  return Array.isArray(tokens) ? tokens.map(String) : []
}

const sourceGlyphsNodeTupleExtra = (
  sourceData: GlyphSourceData | null | undefined
) => {
  const extra = sourceGlyphsFields(sourceData).nodeTupleExtra
  return Array.isArray(extra) ? extra : []
}

const hasRecordEntries = (value: Record<string, unknown> | undefined) =>
  Boolean(value && Object.keys(value).length > 0)

const assignOptional = (
  target: Record<string, unknown>,
  key: string,
  value: unknown
) => {
  if (value === undefined || value === null) {
    delete target[key]
  } else {
    target[key] = value
  }
}

const serializeGlyphsImage = (image: GlyphImage): Record<string, unknown> => {
  const customData = asRecord(image.customData)
  const xScale = image.xScale ?? 1
  const xyScale = image.xyScale ?? 0
  const yxScale = image.yxScale ?? 0
  const yScale = image.yScale ?? 1
  const xOffset = image.xOffset ?? 0
  const yOffset = image.yOffset ?? 0
  return {
    ...customData,
    path: image.fileName,
    transform: `{${xScale}, ${xyScale}, ${yxScale}, ${yScale}, ${xOffset}, ${yOffset}}`,
  }
}

const serializeOpenStepValueToChunks = (
  value: unknown,
  chunks: string[],
  indentLevel = 0
) => {
  const indent = '  '.repeat(indentLevel)
  const childIndent = '  '.repeat(indentLevel + 1)

  if (value instanceof RawGlyphsValue) {
    chunks.push(value.raw)
    return
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      chunks.push('()')
      return
    }

    chunks.push('(\n')
    value.forEach((item, index) => {
      chunks.push(childIndent)
      serializeOpenStepValueToChunks(item, chunks, indentLevel + 1)
      chunks.push(index === value.length - 1 ? '\n' : ',\n')
    })
    chunks.push(indent, ')')
    return
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined
    )
    if (entries.length === 0) {
      chunks.push('{}')
      return
    }

    chunks.push('{\n')
    entries.forEach(([key, entryValue], index) => {
      chunks.push(childIndent, key, ' = ')
      serializeOpenStepValueToChunks(entryValue, chunks, indentLevel + 1)
      chunks.push(index === entries.length - 1 ? ';\n' : ';\n')
    })
    chunks.push(indent, '}')
    return
  }

  if (typeof value === 'string') {
    chunks.push(quoteString(value))
    return
  }

  if (typeof value === 'number') {
    chunks.push(String(value))
    return
  }

  if (typeof value === 'boolean') {
    chunks.push(value ? '1' : '0')
    return
  }

  chunks.push('""')
}

export const serializeOpenStepValue = (value: unknown) => {
  const chunks: string[] = []
  serializeOpenStepValueToChunks(value, chunks, 0)
  return chunks.join('')
}

const getG2NodeKeyword = (node: PathNode) => {
  const segmentType = getNodeSegmentType(node)
  return segmentType === 'quadratic'
    ? 'QCURVE'
    : segmentType === 'cubic'
      ? 'CURVE'
      : 'LINE'
}

const serializeGlyphNode = (node: PathNode) => {
  const coords = `${Math.round(node.x)} ${Math.round(node.y)}`
  const extra = sourceGlyphsNodeExtraTokens(node.sourceData)
  const extraText = extra.length > 0 ? ` ${extra.join(' ')}` : ''

  if (isOffCurveNode(node)) {
    return `${coords} OFFCURVE${extraText}`
  }

  const keyword = getG2NodeKeyword(node)
  const smooth = getNodeType(node) === 'smooth' ? ' SMOOTH' : ''
  return `${coords} ${keyword}${smooth}${extraText}`
}

const serializeLayerPaths = (layer: GlyphLayerData) =>
  layer.paths.map((path) => ({
    ...sourceGlyphsFields(path.sourceData),
    ...(path.identifier ? { identifier: path.identifier } : {}),
    ...(path.name ? { name: path.name } : {}),
    ...(hasRecordEntries(path.customData) ? { userData: path.customData } : {}),
    closed: path.closed ? 1 : 0,
    nodes: path.nodes.map((node) => serializeGlyphNode(node)),
  }))

const formatPointTuple = (x: number, y: number) =>
  `{${Math.round(x)}, ${Math.round(y)}}`

const serializeLayerComponents = (layer: GlyphLayerData) =>
  layer.componentRefs.map((component) => {
    const matrix = getComponentMatrix(component)
    return {
      ...sourceGlyphsFields(component.sourceData),
      name: component.glyphId,
      ...(component.identifier ? { identifier: component.identifier } : {}),
      ...(hasRecordEntries(component.customData)
        ? { userData: component.customData }
        : {}),
      ...(component.autoAlign === undefined || component.autoAlign === null
        ? {}
        : { automaticAlignment: component.autoAlign ? 1 : 0 }),
      ...(isIdentityComponentMatrix(matrix)
        ? {}
        : {
            transform: `{${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${Math.round(matrix.e)}, ${Math.round(matrix.f)}}`,
          }),
    }
  })

const serializeLayerAnchors = (layer: GlyphLayerData) =>
  layer.anchors.map((anchor) => ({
    ...sourceGlyphsFields(anchor.sourceData),
    name: anchor.name,
    ...(anchor.identifier ? { identifier: anchor.identifier } : {}),
    ...(hasRecordEntries(anchor.customData)
      ? { userData: anchor.customData }
      : {}),
    position: formatPointTuple(anchor.x, anchor.y),
  }))

const serializeLayerGuides = (layer: GlyphLayerData) =>
  layer.guidelines.map((guide) => ({
    ...sourceGlyphsFields(guide.sourceData),
    position: formatPointTuple(guide.x, guide.y),
    angle: guide.angle,
    locked: guide.locked ? 1 : 0,
    ...(guide.identifier ? { identifier: guide.identifier } : {}),
    ...(guide.name ? { name: guide.name } : {}),
    ...(hasRecordEntries(guide.customData)
      ? { userData: guide.customData }
      : {}),
  }))

// --- Glyphs 3 native geometry (shapes + tuple nodes) ------------------------

export type GlyphsFormatVersion = 2 | 3

export interface GlyphsExportWarning {
  code: 'glyphs3-shear-transform-unverified'
  glyphId: string
  layerId: string
  componentId: string
  message: string
}

// A Glyphs 3 source declares `.formatVersion = 3`; .glyphspackage is always G3.
export const detectGlyphsFormatVersion = (
  document: Record<string, unknown> | null | undefined
): GlyphsFormatVersion =>
  document && Number(document['.formatVersion']) >= 3 ? 3 : 2

export const getGlyphExportWarnings = (
  glyph: GlyphData,
  formatVersion: GlyphsFormatVersion
): GlyphsExportWarning[] => {
  if (formatVersion < 3) {
    return []
  }

  return Object.values(glyph.layers ?? {}).flatMap((layer) =>
    layer.componentRefs
      .filter((component) => {
        const matrix = getComponentMatrix(component)
        return matrix.b !== 0 || matrix.c !== 0
      })
      .map((component) => ({
        code: 'glyphs3-shear-transform-unverified' as const,
        glyphId: glyph.id,
        layerId: layer.id,
        componentId: component.id,
        message:
          'Glyphs 3 export uses a matrix transform to preserve component shear; verify save/reopen behavior in Glyphs for this file.',
      }))
  )
}

export const getGlyphsExportWarnings = (
  fontData: FontData,
  formatVersion: GlyphsFormatVersion
): GlyphsExportWarning[] =>
  Object.values(fontData.glyphs).flatMap((glyph) =>
    getGlyphExportWarnings(glyph, formatVersion)
  )

const getG3OnCurveCode = (node: PathNode) => {
  const segmentType = getNodeSegmentType(node)
  const base =
    segmentType === 'quadratic' ? 'q' : segmentType === 'cubic' ? 'c' : 'l'
  return getNodeType(node) === 'smooth' ? `${base}s` : base
}

// Glyphs 3 node: compact tuple `(x,y,type)` with type l/ls/c/cs/o/q.
const serializeG3Node = (node: PathNode) => {
  const coords = `${Math.round(node.x)},${Math.round(node.y)}`
  const code = isOffCurveNode(node) ? 'o' : getG3OnCurveCode(node)
  const extra = sourceGlyphsNodeTupleExtra(node.sourceData)
  return new RawGlyphsValue(
    `(${[coords, code, ...extra.map((value) => serializeOpenStepValue(value))].join(',')})`
  )
}

const serializeLayerShapesG3 = (layer: GlyphLayerData) => {
  const contours = layer.paths.map((path) => ({
    ...sourceGlyphsFields(path.sourceData),
    ...(path.identifier ? { identifier: path.identifier } : {}),
    ...(path.name ? { name: path.name } : {}),
    ...(hasRecordEntries(path.customData) ? { userData: path.customData } : {}),
    closed: path.closed ? 1 : 0,
    nodes: path.nodes.map((node) => serializeG3Node(node)),
  }))

  const components = layer.componentRefs.map((component) => {
    // Read pos/scale/angle straight from the ref fields. The folded matrix would
    // mix rotation into the diagonal, so it cannot be reused for `scale` here.
    // Keep the compact native fields when possible, but fall back to the full
    // component matrix for sheared refs so Glyphs 3 exports remain lossless.
    const matrix = getComponentMatrix(component)
    const hasShear = matrix.b !== 0 || matrix.c !== 0
    if (hasShear) {
      return {
        ...sourceGlyphsFields(component.sourceData),
        ref: component.glyphId,
        ...(component.identifier ? { identifier: component.identifier } : {}),
        ...(hasRecordEntries(component.customData)
          ? { userData: component.customData }
          : {}),
        ...(component.autoAlign === undefined || component.autoAlign === null
          ? {}
          : { automaticAlignment: component.autoAlign ? 1 : 0 }),
        transform: new RawGlyphsValue(
          `(${matrix.a},${matrix.b},${matrix.c},${matrix.d},${Math.round(matrix.e)},${Math.round(matrix.f)})`
        ),
      }
    }
    const x = Math.round(matrix.e)
    const y = Math.round(matrix.f)
    const hasScale = matrix.a !== 1 || matrix.d !== 1
    return {
      ...sourceGlyphsFields(component.sourceData),
      ref: component.glyphId,
      ...(component.identifier ? { identifier: component.identifier } : {}),
      ...(hasRecordEntries(component.customData)
        ? { userData: component.customData }
        : {}),
      ...(component.autoAlign === undefined || component.autoAlign === null
        ? {}
        : { automaticAlignment: component.autoAlign ? 1 : 0 }),
      ...(x !== 0 || y !== 0 ? { pos: new RawGlyphsValue(`(${x},${y})`) } : {}),
      ...(hasScale
        ? {
            scale: new RawGlyphsValue(`(${matrix.a},${matrix.d})`),
          }
        : {}),
      ...(component.rotation ? { angle: component.rotation } : {}),
    }
  })

  return [...contours, ...components]
}

const serializeLayerAnchorsG3 = (layer: GlyphLayerData) =>
  layer.anchors.map((anchor) => ({
    ...sourceGlyphsFields(anchor.sourceData),
    name: anchor.name,
    ...(anchor.identifier ? { identifier: anchor.identifier } : {}),
    ...(hasRecordEntries(anchor.customData)
      ? { userData: anchor.customData }
      : {}),
    pos: new RawGlyphsValue(
      `(${Math.round(anchor.x)},${Math.round(anchor.y)})`
    ),
  }))

const serializeLayerGuidesG3 = (layer: GlyphLayerData) =>
  layer.guidelines.map((guide) => ({
    ...sourceGlyphsFields(guide.sourceData),
    pos: new RawGlyphsValue(`(${Math.round(guide.x)},${Math.round(guide.y)})`),
    ...(guide.angle ? { angle: guide.angle } : {}),
    ...(guide.locked ? { locked: 1 } : {}),
    ...(guide.identifier ? { identifier: guide.identifier } : {}),
    ...(guide.name ? { name: guide.name } : {}),
    ...(hasRecordEntries(guide.customData)
      ? { userData: guide.customData }
      : {}),
  }))

const isEmptyLayerContent = (content: GlyphLayerContent) =>
  content.paths.length === 0 &&
  content.componentRefs.length === 0 &&
  content.anchors.length === 0 &&
  content.guidelines.length === 0

const layerContentAsGlyphLayer = (
  content: GlyphLayerContent
): GlyphLayerData => ({
  id: 'background',
  name: 'background',
  paths: content.paths,
  componentRefs: content.componentRefs,
  anchors: content.anchors,
  guidelines: content.guidelines,
  metrics: content.metrics,
})

const serializeGlyphsBackground = (
  content: GlyphLayerContent,
  formatVersion: GlyphsFormatVersion
): Record<string, unknown> => {
  const layer = layerContentAsGlyphLayer(content)
  if (formatVersion >= 3) {
    return {
      width: Math.round(content.metrics.width),
      shapes: serializeLayerShapesG3(layer),
      anchors: serializeLayerAnchorsG3(layer),
      guides: serializeLayerGuidesG3(layer),
    }
  }
  return {
    width: Math.round(content.metrics.width),
    paths: serializeLayerPaths(layer),
    components: serializeLayerComponents(layer),
    anchors: serializeLayerAnchors(layer),
    guides: serializeLayerGuides(layer),
  }
}

export const applyLayerEdits = (
  targetLayer: Record<string, unknown>,
  layer: GlyphLayerData,
  formatVersion: GlyphsFormatVersion = 2
) => {
  Object.assign(targetLayer, sourceGlyphsFields(layer.sourceData))
  targetLayer.layerId = layer.id
  targetLayer.associatedMasterId = layer.associatedMasterId ?? layer.id
  targetLayer.name = layer.name
  targetLayer.width = Math.round(layer.metrics.width)
  if (targetLayer.color === undefined) {
    assignOptional(
      targetLayer,
      'color',
      nearestGlyphsLabelColorIndex(layer.color)
    )
  }
  assignOptional(
    targetLayer,
    'locked',
    layer.locked === undefined ? undefined : layer.locked ? 1 : 0
  )
  assignOptional(
    targetLayer,
    'visible',
    layer.visible === undefined ? undefined : layer.visible ? 1 : 0
  )
  if (hasRecordEntries(layer.customData)) {
    targetLayer.userData = layer.customData
  } else {
    delete targetLayer.userData
  }
  if (layer.image) {
    targetLayer.backgroundImage = serializeGlyphsImage(layer.image)
  } else {
    delete targetLayer.backgroundImage
    delete targetLayer.image
  }
  if (layer.background && !isEmptyLayerContent(layer.background)) {
    targetLayer.background = serializeGlyphsBackground(
      layer.background,
      formatVersion
    )
  } else {
    delete targetLayer.background
  }
  if (layer.hints && layer.hints.length > 0) {
    targetLayer.hints = layer.hints
  } else {
    delete targetLayer.hints
  }
  const attributes =
    targetLayer.attributes &&
    typeof targetLayer.attributes === 'object' &&
    !Array.isArray(targetLayer.attributes)
      ? { ...(targetLayer.attributes as Record<string, unknown>) }
      : {}
  if (layer.braceLocation) {
    attributes.coordinates = layer.braceLocation
  } else {
    delete attributes.coordinates
  }
  if (layer.bracketAxisRules) {
    attributes.axisRules = layer.bracketAxisRules
  } else {
    delete attributes.axisRules
  }
  if (Object.keys(attributes).length > 0) {
    targetLayer.attributes = attributes
  } else {
    delete targetLayer.attributes
  }

  if (formatVersion >= 3) {
    targetLayer.shapes = serializeLayerShapesG3(layer)
    targetLayer.anchors = serializeLayerAnchorsG3(layer)
    targetLayer.guides = serializeLayerGuidesG3(layer)
    // Drop any stale Glyphs 2 keys carried over from the source layer.
    delete targetLayer.paths
    delete targetLayer.components
    return
  }

  targetLayer.paths = serializeLayerPaths(layer)
  targetLayer.components = serializeLayerComponents(layer)
  targetLayer.anchors = serializeLayerAnchors(layer)
  targetLayer.guides = serializeLayerGuides(layer)
}

// Keys a raw .glyphs record can be matched by, most-unique first. glyphname is
// unique; unicode can be shared by multiple glyphs so it is only a fallback.
const getRawGlyphMatchKeys = (rawGlyph: Record<string, unknown>) => {
  const keys: string[] = []
  const glyphname = rawGlyph.glyphname
  if (typeof glyphname === 'string' && glyphname.length > 0) {
    keys.push(glyphname.toLowerCase())
  }
  const unicode = rawGlyph.unicode
  if (typeof unicode === 'string' && unicode.length > 0) {
    keys.push(`uni${unicode}`.toLowerCase())
  }
  return keys
}

const buildLayerMap = (layers: Array<Record<string, unknown>>) =>
  new Map(
    layers.map((layer, index) => [
      String(
        layer.layerId ??
          layer.associatedMasterId ??
          layer.name ??
          `layer_${index}`
      ),
      layer,
    ])
  )

export const createBaseGlyphsDocument = (
  fontData: FontData,
  projectMetadata: Record<string, unknown> | null
): GlyphsDocument => ({
  familyName:
    typeof projectMetadata?.familyName === 'string'
      ? projectMetadata.familyName
      : 'Untitled',
  unitsPerEm:
    typeof projectMetadata?.unitsPerEm === 'number'
      ? projectMetadata.unitsPerEm
      : (fontData.unitsPerEm ?? 1000),
  versionMajor:
    typeof projectMetadata?.versionMajor === 'number'
      ? projectMetadata.versionMajor
      : 1,
  versionMinor:
    typeof projectMetadata?.versionMinor === 'number'
      ? projectMetadata.versionMinor
      : 0,
  customParameters: Array.isArray(projectMetadata?.customParameters)
    ? (projectMetadata.customParameters as GlyphsDocument['customParameters'])
    : [],
  featurePrefixes: Array.isArray(projectMetadata?.featurePrefixes)
    ? (projectMetadata.featurePrefixes as GlyphsDocument['featurePrefixes'])
    : [],
  classes: Array.isArray(projectMetadata?.classes)
    ? (projectMetadata.classes as GlyphsDocument['classes'])
    : [],
  features: Array.isArray(projectMetadata?.features)
    ? (projectMetadata.features as GlyphsDocument['features'])
    : [],
  instances: Array.isArray(projectMetadata?.instances)
    ? (projectMetadata.instances as GlyphsDocument['instances'])
    : [],
  fontMaster: Array.isArray(projectMetadata?.fontMasters)
    ? (projectMetadata.fontMasters as GlyphsDocument['fontMaster'])
    : [],
  glyphs: [],
  lineMetricsHorizontalLayout:
    (fontData.lineMetricsHorizontalLayout as GlyphsDocument['lineMetricsHorizontalLayout']) ??
    {},
})

export const createGlyphsRecordFromFontDataGlyph = (
  rawGlyph: Record<string, unknown> | undefined,
  glyph: GlyphData,
  formatVersion: GlyphsFormatVersion = 2
) => {
  const patchedGlyph: Record<string, unknown> = {
    ...(rawGlyph ?? {}),
    ...sourceGlyphsFields(glyph.sourceData),
    glyphname: glyph.id,
    export: glyph.export === false ? 0 : 1,
  }
  assignOptional(
    patchedGlyph,
    'color',
    nearestGlyphsLabelColorIndex(glyph.color)
  )
  assignOptional(patchedGlyph, 'unicode', getPrimaryGlyphUnicode(glyph))
  assignOptional(patchedGlyph, 'category', glyph.category)
  assignOptional(patchedGlyph, 'subCategory', glyph.subCategory)
  assignOptional(patchedGlyph, 'note', glyph.note)
  assignOptional(patchedGlyph, 'leftMetricsKey', glyph.leftMetricsKey)
  assignOptional(patchedGlyph, 'rightMetricsKey', glyph.rightMetricsKey)
  assignOptional(patchedGlyph, 'widthMetricsKey', glyph.widthMetricsKey)
  if (hasRecordEntries(glyph.customData)) {
    patchedGlyph.userData = glyph.customData
  } else {
    delete patchedGlyph.userData
  }
  // Keep the source production name when the in-memory glyph has none.
  assignOptional(
    patchedGlyph,
    'production',
    glyph.production ?? rawGlyph?.production
  )

  const rawLayers = Array.isArray(rawGlyph?.layers)
    ? (rawGlyph.layers as Array<Record<string, unknown>>)
    : []
  const layerMap = buildLayerMap(rawLayers)
  const layerOrder = glyph.layerOrder ?? [glyph.activeLayerId ?? 'default']
  const glyphLayers = glyph.layers ?? {}
  const patchedLayers: Array<Record<string, unknown>> = []

  for (const rawLayer of rawLayers) {
    const layerId = String(
      rawLayer.layerId ??
        rawLayer.associatedMasterId ??
        rawLayer.name ??
        `layer_${patchedLayers.length}`
    )
    const editedLayer = glyphLayers[layerId]
    if (!editedLayer) {
      patchedLayers.push(rawLayer)
      continue
    }

    const patchedLayer = { ...rawLayer }
    applyLayerEdits(patchedLayer, editedLayer, formatVersion)
    patchedLayers.push(patchedLayer)
    layerMap.delete(layerId)
  }

  for (const layerId of layerOrder) {
    const layer = glyphLayers[layerId]
    if (!layer) {
      continue
    }

    if (
      patchedLayers.some(
        (candidate) =>
          String(
            candidate.layerId ?? candidate.associatedMasterId ?? candidate.name
          ) === layerId
      )
    ) {
      continue
    }

    const patchedLayer: Record<string, unknown> = {
      layerId,
      associatedMasterId: layer.associatedMasterId ?? layerId,
    }
    applyLayerEdits(patchedLayer, layer, formatVersion)
    patchedLayers.push(patchedLayer)
  }

  patchedGlyph.layers = patchedLayers
  return patchedGlyph
}

export const createGlyphsDocumentFromFontData = (
  fontData: FontData,
  projectMetadata: Record<string, unknown> | null,
  formatVersion: GlyphsFormatVersion
): GlyphsDocument => {
  const document = createBaseGlyphsDocument(fontData, projectMetadata)
  if (formatVersion >= 3) {
    document['.formatVersion'] = 3
  } else {
    delete document['.formatVersion']
  }
  document.glyphs = Object.values(fontData.glyphs).map((glyph) =>
    createGlyphsRecordFromFontDataGlyph(undefined, glyph, formatVersion)
  ) as GlyphsDocument['glyphs']
  return document
}

const serializeGlyphsArrayToChunks = (
  rawGlyphs: Array<Record<string, unknown>>,
  fontData: FontData,
  chunks: string[],
  indentLevel: number,
  formatVersion: GlyphsFormatVersion
) => {
  const indent = '  '.repeat(indentLevel)
  const childIndent = '  '.repeat(indentLevel + 1)
  const glyphValues = Object.values(fontData.glyphs)
  const glyphsById = new Map(glyphValues.map((glyph) => [glyph.id, glyph]))
  // Match keys → unique glyph id. glyph.id is the canonical glyphname; unicode
  // can be shared, so the first glyph to claim it wins.
  const idByMatchKey = new Map<string, string>()
  for (const glyph of glyphValues) {
    const register = (key: string) => {
      if (key && !idByMatchKey.has(key)) {
        idByMatchKey.set(key, glyph.id)
      }
    }
    register(glyph.id.toLowerCase())
    const primaryUnicode = getPrimaryGlyphUnicode(glyph)
    if (primaryUnicode) {
      register(`uni${primaryUnicode}`.toLowerCase())
    }
  }
  const seenGlyphIds = new Set<string>()

  chunks.push('(\n')

  let wroteAny = false
  for (const rawGlyph of rawGlyphs) {
    const matchedId = getRawGlyphMatchKeys(rawGlyph)
      .map((key) => idByMatchKey.get(key))
      .find((id): id is string => Boolean(id))
    const editedGlyph = matchedId ? glyphsById.get(matchedId) : undefined
    const valueToWrite = editedGlyph
      ? createGlyphsRecordFromFontDataGlyph(
          rawGlyph,
          editedGlyph,
          formatVersion
        )
      : rawGlyph

    chunks.push(childIndent)
    serializeOpenStepValueToChunks(valueToWrite, chunks, indentLevel + 1)
    chunks.push(',\n')
    wroteAny = true
    if (matchedId) {
      seenGlyphIds.add(matchedId)
    }
  }

  for (const glyph of glyphValues) {
    if (seenGlyphIds.has(glyph.id)) {
      continue
    }

    chunks.push(childIndent)
    serializeOpenStepValueToChunks(
      createGlyphsRecordFromFontDataGlyph(undefined, glyph, formatVersion),
      chunks,
      indentLevel + 1
    )
    chunks.push(',\n')
    wroteAny = true
  }

  if (wroteAny) {
    const lastChunk = chunks[chunks.length - 1]
    if (lastChunk === ',\n') {
      chunks[chunks.length - 1] = '\n'
    }
  }

  chunks.push(indent, ')')
}

export const serializeGlyphsFileToBlob = (
  fontData: FontData,
  projectMetadata: Record<string, unknown> | null,
  glyphsDocument?: GlyphsDocument | null,
  formatVersionOverride?: GlyphsFormatVersion
) => {
  const sourceDocument =
    glyphsDocument && typeof glyphsDocument === 'object'
      ? glyphsDocument
      : createBaseGlyphsDocument(fontData, projectMetadata)
  const baseDocument = { ...(sourceDocument as Record<string, unknown>) }
  if (formatVersionOverride === 3) {
    baseDocument['.formatVersion'] = 3
  } else if (formatVersionOverride === 2) {
    delete baseDocument['.formatVersion']
  }

  const formatVersion =
    formatVersionOverride ?? detectGlyphsFormatVersion(baseDocument)
  const chunks: string[] = []

  const entries = Object.entries(
    baseDocument as Record<string, unknown>
  ).filter(([, entryValue]) => entryValue !== undefined)

  chunks.push('{\n')
  entries.forEach(([key, entryValue], index) => {
    chunks.push('  ', key, ' = ')
    if (key === 'glyphs') {
      const rawGlyphs = Array.isArray(entryValue)
        ? (entryValue as Array<Record<string, unknown>>)
        : []
      serializeGlyphsArrayToChunks(
        rawGlyphs,
        fontData,
        chunks,
        1,
        formatVersion
      )
    } else {
      serializeOpenStepValueToChunks(entryValue, chunks, 1)
    }
    chunks.push(index === entries.length - 1 ? ';\n' : ';\n')
  })
  chunks.push('}')
  chunks.push('\n')
  return new Blob(chunks, { type: 'text/plain;charset=utf-8' })
}

export interface GlyphsBatchSerializeResult {
  blob: Blob
  totalGlyphs: number
  warnings: GlyphsExportWarning[]
}

export const serializeGlyphsFileFromGlyphBatchesToBlob = async (input: {
  baseFontData: FontData
  projectMetadata: Record<string, unknown> | null
  glyphBatches: AsyncIterable<GlyphData[]>
  formatVersionOverride?: GlyphsFormatVersion
}): Promise<GlyphsBatchSerializeResult> => {
  const baseDocument = createBaseGlyphsDocument(
    input.baseFontData,
    input.projectMetadata
  ) as Record<string, unknown>
  if (input.formatVersionOverride === 3) {
    baseDocument['.formatVersion'] = 3
  } else if (input.formatVersionOverride === 2) {
    delete baseDocument['.formatVersion']
  }

  const formatVersion =
    input.formatVersionOverride ?? detectGlyphsFormatVersion(baseDocument)
  const entries = Object.entries(baseDocument).filter(
    ([, entryValue]) => entryValue !== undefined
  )
  const chunks: string[] = ['{\n']
  const warnings: GlyphsExportWarning[] = []
  let totalGlyphs = 0

  for (const [key, entryValue] of entries) {
    chunks.push('  ', key, ' = ')
    if (key === 'glyphs') {
      chunks.push('(\n')
      let wroteAnyGlyph = false
      for await (const glyphBatch of input.glyphBatches) {
        for (const glyph of glyphBatch) {
          chunks.push('    ')
          serializeOpenStepValueToChunks(
            createGlyphsRecordFromFontDataGlyph(
              undefined,
              glyph,
              formatVersion
            ),
            chunks,
            2
          )
          chunks.push(',\n')
          warnings.push(...getGlyphExportWarnings(glyph, formatVersion))
          totalGlyphs += 1
          wroteAnyGlyph = true
        }
      }
      if (wroteAnyGlyph && chunks[chunks.length - 1] === ',\n') {
        chunks[chunks.length - 1] = '\n'
      }
      chunks.push('  )')
    } else {
      serializeOpenStepValueToChunks(entryValue, chunks, 1)
    }
    chunks.push(';\n')
  }

  chunks.push('}\n')
  return {
    blob: new Blob(chunks, { type: 'text/plain;charset=utf-8' }),
    totalGlyphs,
    warnings,
  }
}
