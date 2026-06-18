import type {
  KumikoGlyphLayerRecord,
  KumikoGlyphRecord,
  KumikoProjectRecord,
  KumikoProjectSourceFormat,
} from 'src/lib/project/kumikoProjectTypes'
import type { FontData, GlyphData, GlyphLayerData } from 'src/store'

const toKumikoLayerRecord = (
  layer: GlyphLayerData
): KumikoGlyphLayerRecord => ({
  ...layer,
  type: layer.type ?? 'master',
  components: layer.components ?? layer.componentRefs.map((ref) => ref.glyphId),
})

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
}): KumikoProjectRecord => ({
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
  features: input.fontData.features,
  openTypeFeatures: input.fontData.openTypeFeatures,
  kerningGroups: input.fontData.kerningGroups,
  kerningPairs: input.fontData.kerningPairs,
  statusDefinitions: input.fontData.statusDefinitions,
  settings: input.fontData.settings,
  lineMetricsHorizontalLayout: input.fontData.lineMetricsHorizontalLayout,
  glyphOrder: input.fontData.glyphOrder ?? Object.keys(input.fontData.glyphs),
  sourceData: input.sourceData,
})

export const glyphDataToKumikoGlyphRecord = (input: {
  projectId: string
  glyph: GlyphData
  updatedAt: number
  dirty?: boolean
}): KumikoGlyphRecord => {
  const layers = Object.fromEntries(
    Object.entries(input.glyph.layers ?? {}).map(([layerId, layer]) => [
      layerId,
      toKumikoLayerRecord(layer),
    ])
  )
  const dirty = input.dirty ?? false

  return {
    schemaVersion: 1,
    projectId: input.projectId,
    glyphId: input.glyph.id,
    name: input.glyph.name,
    unicodes: input.glyph.unicode ? [input.glyph.unicode.toUpperCase()] : [],
    production: input.glyph.production,
    export: input.glyph.export,
    category: input.glyph.category,
    subCategory: input.glyph.subCategory,
    activeLayerId: input.glyph.activeLayerId,
    layerOrder: input.glyph.layerOrder ?? Object.keys(layers),
    layers,
    dirty,
    dirtyIndex: dirty ? 1 : 0,
    updatedAt: input.updatedAt,
  }
}

export const fontDataToKumikoGlyphRecords = (input: {
  projectId: string
  fontData: FontData
  updatedAt: number
  dirtyGlyphIds?: Iterable<string>
}): KumikoGlyphRecord[] => {
  const dirtyGlyphIds = new Set(input.dirtyGlyphIds ?? [])
  return Object.values(input.fontData.glyphs).map((glyph) =>
    glyphDataToKumikoGlyphRecord({
      projectId: input.projectId,
      glyph,
      updatedAt: input.updatedAt,
      dirty: dirtyGlyphIds.has(glyph.id),
    })
  )
}

const toGlyphLayerData = (layer: KumikoGlyphLayerRecord): GlyphLayerData => ({
  id: layer.id,
  name: layer.name,
  type: layer.type,
  associatedMasterId: layer.associatedMasterId,
  paths: layer.paths,
  components: layer.components ?? layer.componentRefs.map((ref) => ref.glyphId),
  componentRefs: layer.componentRefs,
  anchors: layer.anchors,
  guidelines: layer.guidelines,
  metrics: layer.metrics,
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
    name: record.name,
    activeLayerId: record.activeLayerId,
    layerOrder: record.layerOrder,
    layers,
    unicode: record.unicodes[0] ?? null,
    production: record.production,
    export: record.export,
    category: record.category,
    subCategory: record.subCategory,
  }
}

export const kumikoRecordsToFontData = (
  project: KumikoProjectRecord,
  glyphRecords: KumikoGlyphRecord[]
): FontData => ({
  glyphs: Object.fromEntries(
    glyphRecords.map((record) => [
      record.glyphId,
      kumikoGlyphRecordToGlyphData(record),
    ])
  ),
  glyphOrder: project.glyphOrder,
  fontInfo: project.fontInfo,
  unitsPerEm: project.unitsPerEm,
  axes: project.axes,
  sources: project.sources,
  exportInstances: project.exportInstances,
  features: project.features,
  openTypeFeatures: project.openTypeFeatures,
  kerningGroups: project.kerningGroups,
  kerningPairs: project.kerningPairs,
  statusDefinitions: project.statusDefinitions,
  settings: project.settings,
  lineMetricsHorizontalLayout: project.lineMetricsHorizontalLayout,
})
