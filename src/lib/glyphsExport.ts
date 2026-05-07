import type { GlyphsDocument } from 'src/lib/glyphsDocument'
import type {
  FontData,
  GlyphData,
  GlyphLayerData,
  PathData,
  PathNode,
} from 'src/store'

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

const serializeOpenStepValueToChunks = (
  value: unknown,
  chunks: string[],
  indentLevel = 0
) => {
  const indent = '  '.repeat(indentLevel)
  const childIndent = '  '.repeat(indentLevel + 1)

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

const getOnCurveNodeKeyword = (path: PathData, index: number) => {
  const previous = path.nodes[index - 1]
  const previous2 = path.nodes[index - 2]
  const hasCurveHandleBefore =
    previous?.type === 'offcurve' ||
    previous?.type === 'qcurve' ||
    previous2?.type === 'offcurve' ||
    previous2?.type === 'qcurve'

  return hasCurveHandleBefore ? 'CURVE' : 'LINE'
}

const serializeGlyphNode = (path: PathData, node: PathNode, index: number) => {
  const coords = `${Math.round(node.x)} ${Math.round(node.y)}`

  if (node.type === 'offcurve') {
    return `${coords} OFFCURVE`
  }

  if (node.type === 'qcurve') {
    return `${coords} QCURVE`
  }

  const keyword = getOnCurveNodeKeyword(path, index)
  const smooth = node.type === 'smooth' ? ' SMOOTH' : ''
  return `${coords} ${keyword}${smooth}`
}

const serializeLayerPaths = (layer: GlyphLayerData) =>
  layer.paths.map((path) => ({
    closed: path.closed ? 1 : 0,
    nodes: path.nodes.map((node, nodeIndex) =>
      serializeGlyphNode(path, node, nodeIndex)
    ),
  }))

const formatPointTuple = (x: number, y: number) =>
  `{${Math.round(x)}, ${Math.round(y)}}`

const isIdentityTransform = (
  component: GlyphLayerData['componentRefs'][number]
) =>
  component.scaleX === 1 &&
  component.scaleY === 1 &&
  component.rotation === 0 &&
  component.x === 0 &&
  component.y === 0

const serializeLayerComponents = (layer: GlyphLayerData) =>
  layer.componentRefs.map((component) => ({
    name: component.glyphId,
    ...(isIdentityTransform(component)
      ? {}
      : {
          transform: `{${component.scaleX}, 0, 0, ${component.scaleY}, ${Math.round(component.x)}, ${Math.round(component.y)}}`,
        }),
  }))

const serializeLayerAnchors = (layer: GlyphLayerData) =>
  layer.anchors.map((anchor) => ({
    name: anchor.name,
    position: formatPointTuple(anchor.x, anchor.y),
  }))

const serializeLayerGuides = (layer: GlyphLayerData) =>
  layer.guidelines.map((guide) => ({
    position: formatPointTuple(guide.x, guide.y),
    angle: guide.angle,
    locked: guide.locked ? 1 : 0,
    ...(guide.name ? { name: guide.name } : {}),
  }))

const applyLayerEdits = (
  targetLayer: Record<string, unknown>,
  layer: GlyphLayerData
) => {
  targetLayer.layerId = layer.id
  targetLayer.associatedMasterId = layer.associatedMasterId ?? layer.id
  targetLayer.name = layer.name
  targetLayer.width = Math.round(layer.metrics.width)
  targetLayer.paths = serializeLayerPaths(layer)
  targetLayer.components = serializeLayerComponents(layer)
  targetLayer.anchors = serializeLayerAnchors(layer)
  targetLayer.guides = serializeLayerGuides(layer)
}

const getGlyphExportId = (glyph: GlyphData) =>
  glyph.unicode ? `uni${glyph.unicode}`.toLowerCase() : glyph.id.toLowerCase()

const getRawGlyphExportId = (rawGlyph: Record<string, unknown>) => {
  const unicode = rawGlyph.unicode
  if (typeof unicode === 'string' && unicode.length > 0) {
    return `uni${unicode}`.toLowerCase()
  }

  return String(rawGlyph.glyphname ?? '').toLowerCase()
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

const createBaseGlyphsDocument = (
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

const createPatchedGlyphRecord = (
  rawGlyph: Record<string, unknown> | undefined,
  glyph: GlyphData
) => {
  const patchedGlyph: Record<string, unknown> = {
    ...(rawGlyph ?? {}),
    glyphname: glyph.name,
    unicode: glyph.unicode ?? undefined,
    export: glyph.export === false ? 0 : 1,
    category: glyph.category ?? undefined,
    subCategory: glyph.subCategory ?? undefined,
    production: glyph.production ?? undefined,
  }

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
    applyLayerEdits(patchedLayer, editedLayer)
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
    applyLayerEdits(patchedLayer, layer)
    patchedLayers.push(patchedLayer)
  }

  patchedGlyph.layers = patchedLayers
  return patchedGlyph
}

const serializeGlyphsArrayToChunks = (
  rawGlyphs: Array<Record<string, unknown>>,
  fontData: FontData,
  chunks: string[],
  indentLevel: number
) => {
  const indent = '  '.repeat(indentLevel)
  const childIndent = '  '.repeat(indentLevel + 1)
  const editedGlyphsById = new Map(
    Object.values(fontData.glyphs).map((glyph) => [
      getGlyphExportId(glyph),
      glyph,
    ])
  )
  const seenGlyphIds = new Set<string>()

  chunks.push('(\n')

  let wroteAny = false
  for (const rawGlyph of rawGlyphs) {
    const glyphId = getRawGlyphExportId(rawGlyph)
    const editedGlyph = editedGlyphsById.get(glyphId)
    const valueToWrite = editedGlyph
      ? createPatchedGlyphRecord(rawGlyph, editedGlyph)
      : rawGlyph

    chunks.push(childIndent)
    serializeOpenStepValueToChunks(valueToWrite, chunks, indentLevel + 1)
    chunks.push(',\n')
    wroteAny = true
    seenGlyphIds.add(glyphId)
  }

  for (const glyph of Object.values(fontData.glyphs)) {
    const glyphId = getGlyphExportId(glyph)
    if (seenGlyphIds.has(glyphId)) {
      continue
    }

    chunks.push(childIndent)
    serializeOpenStepValueToChunks(
      createPatchedGlyphRecord(undefined, glyph),
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
  glyphsDocument?: GlyphsDocument | null
) => {
  const baseDocument =
    glyphsDocument && typeof glyphsDocument === 'object'
      ? glyphsDocument
      : createBaseGlyphsDocument(fontData, projectMetadata)

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
      serializeGlyphsArrayToChunks(rawGlyphs, fontData, chunks, 1)
    } else {
      serializeOpenStepValueToChunks(entryValue, chunks, 1)
    }
    chunks.push(index === entries.length - 1 ? ';\n' : ';\n')
  })
  chunks.push('}')
  chunks.push('\n')
  return new Blob(chunks, { type: 'text/plain;charset=utf-8' })
}
