import type {
  KumikoGlyphComponentRefRecord,
  KumikoGlyphLayerRecord,
  KumikoGlyphRecord,
  KumikoGlyphLayerContentRecord,
  KumikoGlyphMetadataRecord,
  KumikoGlyphStoreRecord,
  KumikoProjectRecord,
  KumikoProjectSourceFormat,
} from 'src/lib/project/kumikoProjectTypes'
import type {
  FontData,
  GlyphAnchor,
  GlyphComponentRef,
  GlyphGuideline,
  GlyphData,
  GlyphLayerContent,
  GlyphLayerData,
  GlyphSourceData,
  PathData,
  PathSegmentType,
} from 'src/store'
import { hashString } from 'src/lib/hash'
import { normalizeRawFeatureSnippets } from 'src/lib/openTypeFeatures/rawFeatureSnippets'
import { deterministicStringify } from 'src/store/deterministicStringify'
import { normalizeUnicodeHex } from 'src/lib/project/unicode'
import {
  composeComponentMatrix,
  componentMatrixToRefFields,
  type ComponentMatrix,
  getComponentMatrix,
  withComponentMatrix,
} from 'src/lib/components/componentTransform'

const getGlyphUnicodes = (glyph: GlyphData) => {
  const values = glyph.unicodes ?? []
  return normalizeUnicodeValues(values)
}

const normalizeUnicodeValues = (values: readonly string[]) => {
  const normalized = values
    .map((unicode) => normalizeUnicodeHex(unicode))
    .filter((unicode): unicode is string => Boolean(unicode))
  return [...new Set(normalized)]
}

const storageIndexKey = (projectId: string, value: string) =>
  `${projectId}\0${value}`

const GEOMETRY_SOURCE_DATA_KEYS = new Set([
  'paths',
  'nodes',
  'points',
  'contours',
  'segments',
  'components',
  'shapes',
])

export const findGeometryBearingSourceDataKey = (
  value: unknown,
  path = 'sourceData'
): string | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findGeometryBearingSourceDataKey(
        value[index],
        `${path}[${index}]`
      )
      if (found) {
        return found
      }
    }
    return null
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (GEOMETRY_SOURCE_DATA_KEYS.has(key)) {
      return childPath
    }
    const found = findGeometryBearingSourceDataKey(child, childPath)
    if (found) {
      return found
    }
  }
  return null
}

const assertSourceDataHasNoGeometry = (value: unknown, path: string) => {
  const found = findGeometryBearingSourceDataKey(value, path)
  if (found) {
    throw new Error(`Kumiko sourceData cannot contain geometry key: ${found}`)
  }
}

const omitRecordKeys = (record: object, keys: Set<string>) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key)))

const PROJECT_DIGEST_OMIT_KEYS = new Set([
  'exportDirty',
  'syncDirty',
  'exportedDigest',
  'syncedDigest',
  'updatedAt',
])

const GLYPH_DIGEST_OMIT_KEYS = new Set([
  'exportDirty',
  'syncDirty',
  'exportedDigest',
  'syncedDigest',
  'updatedAt',
  'unicodeKeys',
  'componentRefKeys',
])

type StoredKumikoComponentRefRecord = Omit<
  KumikoGlyphComponentRefRecord,
  'transform'
> &
  Partial<
    Pick<
      GlyphComponentRef,
      'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'xyScale' | 'yxScale'
    >
  > & {
    transform?: ComponentMatrix
  }

const isComponentMatrix = (
  value: ComponentMatrix | undefined
): value is ComponentMatrix =>
  Boolean(value) &&
  Number.isFinite(value?.a) &&
  Number.isFinite(value?.b) &&
  Number.isFinite(value?.c) &&
  Number.isFinite(value?.d) &&
  Number.isFinite(value?.e) &&
  Number.isFinite(value?.f)

export const getKumikoComponentRefMatrix = (
  componentRef: StoredKumikoComponentRefRecord
): ComponentMatrix => {
  if (isComponentMatrix(componentRef.transform)) {
    return componentRef.transform
  }

  return composeComponentMatrix({
    x: componentRef.x ?? 0,
    y: componentRef.y ?? 0,
    scaleX: componentRef.scaleX ?? 1,
    scaleY: componentRef.scaleY ?? 1,
    rotation: componentRef.rotation ?? 0,
    xyScale: componentRef.xyScale,
    yxScale: componentRef.yxScale,
  })
}

const normalizeKumikoComponentRefRecord = (
  componentRef: StoredKumikoComponentRefRecord
): KumikoGlyphComponentRefRecord => ({
  id: componentRef.id,
  identifier: componentRef.identifier,
  name: componentRef.name,
  glyphId: componentRef.glyphId,
  color: componentRef.color,
  autoAlign: componentRef.autoAlign,
  customData: componentRef.customData,
  sourceData: componentRef.sourceData,
  transform: getKumikoComponentRefMatrix(componentRef),
})

const normalizeKumikoLayerContentRecord = (
  content: KumikoGlyphLayerContentRecord
): KumikoGlyphLayerContentRecord => ({
  ...content,
  componentRefs: content.componentRefs.map(normalizeKumikoComponentRefRecord),
})

const normalizeKumikoLayerRecord = (
  layer: KumikoGlyphLayerRecord
): KumikoGlyphLayerRecord => ({
  ...layer,
  componentRefs: layer.componentRefs.map(normalizeKumikoComponentRefRecord),
  background: layer.background
    ? normalizeKumikoLayerContentRecord(layer.background)
    : layer.background,
})

export const normalizeKumikoGlyphRecord = (
  record: KumikoGlyphRecord
): KumikoGlyphRecord => {
  const layers: Record<string, KumikoGlyphLayerRecord> = Object.fromEntries(
    Object.entries(record.layers).map(([layerId, layer]) => [
      layerId,
      normalizeKumikoLayerRecord(layer),
    ])
  )
  return {
    ...record,
    layers,
  }
}

export const createKumikoProjectDigest = (record: KumikoProjectRecord) => {
  const content = omitRecordKeys(record, PROJECT_DIGEST_OMIT_KEYS)
  return hashString(deterministicStringify(content))
}

export const createKumikoGlyphDigest = (record: KumikoGlyphRecord) => {
  const content = omitRecordKeys(
    normalizeKumikoGlyphRecord(record),
    GLYPH_DIGEST_OMIT_KEYS
  )
  return hashString(deterministicStringify(content))
}

const deriveLayerOutlineKind = (
  layer: Pick<GlyphLayerData, 'paths'>
): 'cubic' | 'quadratic' => {
  const segmentTypes = new Set<PathSegmentType>()
  for (const path of layer.paths) {
    for (const node of path.nodes) {
      if (node.kind === 'oncurve' && node.segmentType) {
        segmentTypes.add(node.segmentType)
      }
    }
  }
  if (segmentTypes.has('quadratic') && segmentTypes.has('cubic')) {
    throw new Error('Kumiko glyph layer mixes cubic and quadratic segments')
  }
  return segmentTypes.has('quadratic') ? 'quadratic' : 'cubic'
}

const validateInterpolableLayerOutlineKind = (
  glyph: GlyphData,
  layers: Record<string, KumikoGlyphLayerRecord>,
  projectOutlineType?: 'cubic' | 'quadratic'
) => {
  const masterLayers = Object.values(layers).filter(
    (layer) => layer.type === 'master'
  )
  if (masterLayers.length === 0) {
    return
  }

  const firstKind = masterLayers[0].outlineKind
  for (const layer of masterLayers) {
    if (layer.outlineKind !== firstKind) {
      throw new Error(
        `Glyph ${glyph.id} has interpolable master layers with mixed outline kinds`
      )
    }
    if (projectOutlineType && layer.outlineKind !== projectOutlineType) {
      throw new Error(
        `Glyph ${glyph.id} layer ${layer.id} outlineKind ${layer.outlineKind} does not match project outlineType ${projectOutlineType}`
      )
    }
  }
}

const deriveComponentGlyphIds = (
  layers: Record<string, KumikoGlyphLayerRecord>
) => {
  const ids = new Set<string>()
  for (const layer of Object.values(layers)) {
    for (const componentRef of layer.componentRefs ?? []) {
      ids.add(componentRef.glyphId)
    }
    for (const backgroundComponentRef of layer.background?.componentRefs ??
      []) {
      ids.add(backgroundComponentRef.glyphId)
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right))
}

const deriveHasDrawableContent = (
  layers: Record<string, KumikoGlyphLayerRecord>
) =>
  Object.values(layers).some(
    (layer) => layer.paths.length > 0 || layer.componentRefs.length > 0
  )

const toKumikoComponentRefRecord = (
  componentRef: GlyphComponentRef
): KumikoGlyphComponentRefRecord => {
  assertSourceDataHasNoGeometry(
    componentRef.sourceData,
    `component(${componentRef.id}).sourceData`
  )
  return {
    id: componentRef.id,
    identifier: componentRef.identifier,
    name: componentRef.name,
    glyphId: componentRef.glyphId,
    color: componentRef.color,
    autoAlign: componentRef.autoAlign,
    customData: componentRef.customData,
    sourceData: componentRef.sourceData,
    transform: getComponentMatrix(withComponentMatrix(componentRef)),
  }
}

const assertPathSourceDataHasNoGeometry = (path: PathData) => {
  assertSourceDataHasNoGeometry(path.sourceData, `path(${path.id}).sourceData`)
  for (const node of path.nodes) {
    assertSourceDataHasNoGeometry(
      node.sourceData,
      `node(${node.id}).sourceData`
    )
  }
}

const assertAnchorSourceDataHasNoGeometry = (anchor: GlyphAnchor) => {
  assertSourceDataHasNoGeometry(
    anchor.sourceData,
    `anchor(${anchor.id}).sourceData`
  )
}

const assertGuidelineSourceDataHasNoGeometry = (guideline: GlyphGuideline) => {
  assertSourceDataHasNoGeometry(
    guideline.sourceData,
    `guideline(${guideline.id}).sourceData`
  )
}

const assertLayerContentSourceDataHasNoGeometry = (
  content: GlyphLayerContent
) => {
  content.paths.forEach(assertPathSourceDataHasNoGeometry)
  content.componentRefs.forEach((componentRef) =>
    assertSourceDataHasNoGeometry(
      componentRef.sourceData,
      `component(${componentRef.id}).sourceData`
    )
  )
  content.anchors.forEach(assertAnchorSourceDataHasNoGeometry)
  content.guidelines.forEach(assertGuidelineSourceDataHasNoGeometry)
}

const toKumikoLayerContentRecord = (
  content: GlyphLayerContent
): KumikoGlyphLayerContentRecord => {
  assertLayerContentSourceDataHasNoGeometry(content)
  return {
    paths: content.paths,
    componentRefs: content.componentRefs.map(toKumikoComponentRefRecord),
    anchors: content.anchors,
    guidelines: content.guidelines,
    metrics: content.metrics,
  }
}

const toGlyphComponentRef = (
  componentRef: KumikoGlyphComponentRefRecord
): GlyphComponentRef => {
  const transform = getKumikoComponentRefMatrix(componentRef)
  return withComponentMatrix({
    id: componentRef.id,
    identifier: componentRef.identifier,
    name: componentRef.name,
    glyphId: componentRef.glyphId,
    ...componentMatrixToRefFields(transform),
    transform,
    color: componentRef.color,
    autoAlign: componentRef.autoAlign,
    customData: componentRef.customData,
    sourceData: componentRef.sourceData,
  })
}

const toGlyphLayerContent = (
  content: KumikoGlyphLayerContentRecord
): GlyphLayerContent => ({
  paths: content.paths,
  componentRefs: content.componentRefs.map(toGlyphComponentRef),
  anchors: content.anchors,
  guidelines: content.guidelines,
  metrics: content.metrics,
})

const toKumikoLayerRecord = (layer: GlyphLayerData): KumikoGlyphLayerRecord => {
  assertSourceDataHasNoGeometry(
    layer.sourceData,
    `layer(${layer.id}).sourceData`
  )
  assertLayerContentSourceDataHasNoGeometry(layer)
  return {
    id: layer.id,
    name: layer.name,
    type: layer.type ?? 'master',
    associatedMasterId: layer.associatedMasterId,
    braceLocation: layer.braceLocation,
    bracketAxisRules: layer.bracketAxisRules,
    outlineKind: deriveLayerOutlineKind(layer),
    paths: layer.paths,
    componentRefs: layer.componentRefs.map(toKumikoComponentRefRecord),
    anchors: layer.anchors,
    guidelines: layer.guidelines,
    metrics: layer.metrics,
    verticalMetrics: layer.verticalMetrics,
    hints: layer.hints,
    color: layer.color,
    visible: layer.visible,
    locked: layer.locked,
    background: layer.background
      ? toKumikoLayerContentRecord(layer.background)
      : null,
    image: layer.image,
    customData: layer.customData,
    sourceData: layer.sourceData as GlyphSourceData | undefined,
  }
}

export const fontDataToKumikoProjectRecord = (input: {
  projectId: string
  title: string
  fontData: FontData
  createdAt: number
  updatedAt: number
  sourceName?: string | null
  sourceType?: 'local' | 'github'
  sourceFormat?: KumikoProjectSourceFormat | null
  githubSource?: KumikoProjectRecord['githubSource']
  sourceData?: KumikoProjectRecord['sourceData']
  exportDirty?: boolean
  syncDirty?: boolean
}): KumikoProjectRecord => {
  assertSourceDataHasNoGeometry(input.sourceData, 'project.sourceData')
  const record: KumikoProjectRecord = {
    schemaVersion: 1,
    projectId: input.projectId,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    sourceName: input.sourceName ?? null,
    sourceType: input.sourceType ?? 'local',
    sourceFormat: input.sourceFormat ?? null,
    githubSource: input.githubSource ?? null,
    fontInfo: input.fontData.fontInfo,
    unitsPerEm: input.fontData.unitsPerEm,
    axes: input.fontData.axes,
    sources: input.fontData.sources,
    exportInstances: input.fontData.exportInstances,
    openTypeFeatures: input.fontData.openTypeFeatures,
    kerningGroups: input.fontData.kerningGroups,
    kerningPairs: input.fontData.kerningPairs,
    statusDefinitions: input.fontData.statusDefinitions,
    settings: input.fontData.settings,
    lineMetricsHorizontalLayout: input.fontData.lineMetricsHorizontalLayout,
    glyphOrder: input.fontData.glyphOrder ?? Object.keys(input.fontData.glyphs),
    exportDirty: input.exportDirty ? 1 : 0,
    syncDirty: input.syncDirty ? 1 : 0,
    exportedDigest: null,
    syncedDigest: null,
    sourceData: input.sourceData,
  }
  const digest = createKumikoProjectDigest(record)
  return {
    ...record,
    exportedDigest: record.exportDirty ? null : digest,
    syncedDigest: record.syncDirty ? null : digest,
  }
}

export const glyphDataToKumikoGlyphRecord = (input: {
  projectId: string
  glyph: GlyphData
  updatedAt: number
  exportDirty?: boolean
  syncDirty?: boolean
  projectOutlineType?: 'cubic' | 'quadratic'
}): KumikoGlyphRecord => {
  if (!input.glyph.layers || Object.keys(input.glyph.layers).length === 0) {
    throw new Error(
      `Cannot serialize metadata-only glyph ${input.glyph.id} as a complete Kumiko glyph record`
    )
  }

  const layers = Object.fromEntries(
    Object.entries(input.glyph.layers ?? {}).map(([layerId, layer]) => [
      layerId,
      toKumikoLayerRecord(layer),
    ])
  )
  const exportDirty = input.exportDirty ?? false
  const syncDirty = input.syncDirty ?? false
  const unicodes = getGlyphUnicodes(input.glyph)
  const componentGlyphIds = deriveComponentGlyphIds(layers)
  const hasDrawableContent = deriveHasDrawableContent(layers)
  validateInterpolableLayerOutlineKind(
    input.glyph,
    layers,
    input.projectOutlineType
  )
  assertSourceDataHasNoGeometry(
    input.glyph.sourceData,
    `glyph(${input.glyph.id}).sourceData`
  )

  const record: KumikoGlyphRecord = {
    schemaVersion: 1,
    projectId: input.projectId,
    glyphId: input.glyph.id,
    displayName: input.glyph.displayName ?? null,
    unicodes,
    production: input.glyph.production,
    export: input.glyph.export,
    category: input.glyph.category,
    subCategory: input.glyph.subCategory,
    status: input.glyph.status,
    color: input.glyph.color,
    note: input.glyph.note,
    leftMetricsKey: input.glyph.leftMetricsKey,
    rightMetricsKey: input.glyph.rightMetricsKey,
    widthMetricsKey: input.glyph.widthMetricsKey,
    layerOrder: input.glyph.layerOrder ?? Object.keys(layers),
    layers,
    componentGlyphIds,
    hasDrawableContent,
    unicodeKeys: unicodes.map((unicode) =>
      storageIndexKey(input.projectId, unicode)
    ),
    componentRefKeys: componentGlyphIds.map((glyphId) =>
      storageIndexKey(input.projectId, glyphId)
    ),
    customData: input.glyph.customData,
    sourceData: input.glyph.sourceData,
    exportDirty: exportDirty ? 1 : 0,
    syncDirty: syncDirty ? 1 : 0,
    exportedDigest: null,
    syncedDigest: null,
    updatedAt: input.updatedAt,
  }
  const digest = createKumikoGlyphDigest(record)
  return {
    ...record,
    exportedDigest: record.exportDirty ? null : digest,
    syncedDigest: record.syncDirty ? null : digest,
  }
}

export const fontDataToKumikoGlyphRecords = (input: {
  projectId: string
  fontData: FontData
  updatedAt: number
  exportDirtyGlyphIds?: Iterable<string>
  syncDirtyGlyphIds?: Iterable<string>
}): KumikoGlyphRecord[] => {
  const records: KumikoGlyphRecord[] = []
  for (const batch of fontDataToKumikoGlyphRecordBatches(input)) {
    records.push(...batch)
  }
  return records
}

export const fontDataToKumikoGlyphRecordBatches = (input: {
  projectId: string
  fontData: FontData
  updatedAt: number
  exportDirtyGlyphIds?: Iterable<string>
  syncDirtyGlyphIds?: Iterable<string>
  batchSize?: number
}): Iterable<KumikoGlyphRecord[]> => {
  const exportDirtyGlyphIds = new Set(input.exportDirtyGlyphIds ?? [])
  const syncDirtyGlyphIds = new Set(input.syncDirtyGlyphIds ?? [])
  const glyphOrder = input.fontData.glyphOrder ?? []
  const orderedGlyphIds = new Set(glyphOrder)
  const glyphIds = [
    ...glyphOrder.filter((glyphId) => Boolean(input.fontData.glyphs[glyphId])),
    ...Object.keys(input.fontData.glyphs).filter(
      (glyphId) => !orderedGlyphIds.has(glyphId)
    ),
  ]
  const batchSize = Math.max(1, input.batchSize ?? 256)

  return {
    *[Symbol.iterator]() {
      for (let index = 0; index < glyphIds.length; index += batchSize) {
        const batchGlyphIds = glyphIds.slice(index, index + batchSize)
        yield batchGlyphIds.map((glyphId) => {
          const glyph = input.fontData.glyphs[glyphId]
          return glyphDataToKumikoGlyphRecord({
            projectId: input.projectId,
            glyph,
            updatedAt: input.updatedAt,
            exportDirty: exportDirtyGlyphIds.has(glyph.id),
            syncDirty: syncDirtyGlyphIds.has(glyph.id),
            projectOutlineType: input.fontData.settings?.outlineType,
          })
        })
      }
    },
  }
}

const toGlyphLayerData = (layer: KumikoGlyphLayerRecord): GlyphLayerData => ({
  id: layer.id,
  name: layer.name,
  type: layer.type,
  associatedMasterId: layer.associatedMasterId,
  braceLocation: layer.braceLocation,
  bracketAxisRules: layer.bracketAxisRules,
  paths: layer.paths,
  componentRefs: layer.componentRefs.map(toGlyphComponentRef),
  anchors: layer.anchors,
  guidelines: layer.guidelines,
  metrics: layer.metrics,
  verticalMetrics: layer.verticalMetrics,
  hints: layer.hints,
  color: layer.color,
  visible: layer.visible,
  locked: layer.locked,
  background: layer.background ? toGlyphLayerContent(layer.background) : null,
  image: layer.image,
  customData: layer.customData,
  sourceData: layer.sourceData as GlyphSourceData | undefined,
})

export const kumikoGlyphRecordToGlyphData = (
  record: KumikoGlyphRecord
): GlyphData => {
  const layers = Object.fromEntries(
    Object.entries(record.layers).map(([layerId, layer]) => [
      layerId,
      toGlyphLayerData(layer),
    ])
  )

  return {
    id: record.glyphId,
    name: record.displayName ?? record.glyphId,
    displayName: record.displayName,
    activeLayerId: record.layerOrder[0] ?? null,
    layerOrder: record.layerOrder,
    layers,
    unicodes: normalizeUnicodeValues(record.unicodes),
    production: record.production,
    export: record.export,
    category: record.category,
    subCategory: record.subCategory,
    status: record.status,
    color: record.color,
    note: record.note,
    leftMetricsKey: record.leftMetricsKey,
    rightMetricsKey: record.rightMetricsKey,
    widthMetricsKey: record.widthMetricsKey,
    componentGlyphIds: record.componentGlyphIds,
    hasDrawableContent: record.hasDrawableContent,
    customData: record.customData,
    sourceData: record.sourceData as GlyphSourceData | undefined,
  }
}

export const kumikoGlyphRecordToGlyphMetadata = (
  record: KumikoGlyphMetadataRecord | KumikoGlyphRecord
): GlyphData => ({
  id: record.glyphId,
  name: record.displayName ?? record.glyphId,
  displayName: record.displayName,
  activeLayerId: null,
  layerOrder: record.layerOrder,
  componentGlyphIds: record.componentGlyphIds,
  hasDrawableContent: record.hasDrawableContent,
  unicodes: normalizeUnicodeValues(record.unicodes),
  production: record.production,
  export: record.export,
  category: record.category,
  subCategory: record.subCategory,
  status: record.status,
  color: record.color,
  note: record.note,
  leftMetricsKey: record.leftMetricsKey,
  rightMetricsKey: record.rightMetricsKey,
  widthMetricsKey: record.widthMetricsKey,
  customData: record.customData,
  sourceData: record.sourceData as GlyphSourceData | undefined,
})

export const kumikoRecordsToFontData = (
  project: KumikoProjectRecord,
  glyphRecords: KumikoGlyphStoreRecord[],
  options: { metadataOnly?: boolean } = {}
): FontData => ({
  glyphs: Object.fromEntries(
    glyphRecords.map((record) => [
      record.glyphId,
      options.metadataOnly
        ? kumikoGlyphRecordToGlyphMetadata(record)
        : kumikoGlyphRecordToGlyphData(record),
    ])
  ),
  glyphOrder: project.glyphOrder,
  fontInfo: project.fontInfo,
  unitsPerEm: project.unitsPerEm,
  axes: project.axes,
  sources: project.sources,
  exportInstances: project.exportInstances,
  openTypeFeatures: project.openTypeFeatures
    ? normalizeRawFeatureSnippets(project.openTypeFeatures)
    : project.openTypeFeatures,
  kerningGroups: project.kerningGroups,
  kerningPairs: project.kerningPairs,
  statusDefinitions: project.statusDefinitions,
  settings: project.settings,
  lineMetricsHorizontalLayout: project.lineMetricsHorizontalLayout,
})
