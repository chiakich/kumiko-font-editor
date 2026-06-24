import {
  exportGlyphListAsBinary,
  type BinaryFontExportFormat,
} from 'src/lib/fontFormats/fontBinaryFormat'
import { buildVariableFontWithFontTools } from 'src/lib/fontFormats/fontToolsVariableFontExport'
import {
  serializeDesignspace,
  type DesignspaceRule,
} from 'src/lib/fontFormats/designspace'
import {
  getOrderedGlyphLayers,
  locationsMatch,
} from 'src/font/designspaceLocation'
import {
  listKumikoGlyphMetadataForProject,
  loadKumikoGlyphRecords,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
} from 'src/lib/project/kumikoProjectPersistence'
import {
  kumikoGlyphRecordToGlyphData,
  kumikoRecordsToFontData,
} from 'src/lib/project/kumikoFontDataAdapter'
import {
  bakeStaticInstanceGlyphs,
  formatStaticInstanceBakeError,
} from 'src/font/staticInstance'
import {
  compileManagedFontFeatures,
  needsOpenTypeFeatureCompilationForBinaryExport,
} from 'src/lib/openTypeFeatures'
import type { FontAxis, FontSource, GlyphData, GlyphLayerData } from 'src/store'

const BINARY_EXPORT_GLYPH_BATCH_SIZE = 256

const getCanonicalBinaryExportGlyphIds = async (
  projectId: string,
  glyphOrder: string[]
) => {
  const metadataRecords = await listKumikoGlyphMetadataForProject(projectId)
  const metadataByGlyphId = new Map(
    metadataRecords.map((record) => [record.glyphId, record])
  )
  const orderedGlyphIds = new Set<string>()
  const appendGlyphId = (glyphId: string) => {
    if (metadataByGlyphId.has(glyphId)) {
      orderedGlyphIds.add(glyphId)
    }
  }

  appendGlyphId('.notdef')
  glyphOrder.forEach(appendGlyphId)
  metadataRecords.forEach((record) => appendGlyphId(record.glyphId))

  return [...orderedGlyphIds]
}

const loadCanonicalGlyphs = async (
  projectId: string,
  glyphIds: string[],
  batchSize = BINARY_EXPORT_GLYPH_BATCH_SIZE
) => {
  const glyphs: GlyphData[] = []
  for (let index = 0; index < glyphIds.length; index += batchSize) {
    const batchGlyphIds = glyphIds.slice(index, index + batchSize)
    const records = await loadKumikoGlyphRecords(
      batchGlyphIds.map((glyphId) => makeKumikoGlyphKey(projectId, glyphId))
    )
    const recordsByGlyphId = new Map(
      records.map((record) => [record.glyphId, record])
    )
    glyphs.push(
      ...batchGlyphIds
        .map((glyphId) => recordsByGlyphId.get(glyphId))
        .filter((record): record is NonNullable<typeof record> =>
          Boolean(record)
        )
        .map(kumikoGlyphRecordToGlyphData)
    )
  }
  return glyphs
}

export const exportCanonicalProjectAsBinary = async (input: {
  projectId: string
  format: BinaryFontExportFormat
  batchSize?: number
}) => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }

  const glyphIds = await getCanonicalBinaryExportGlyphIds(
    input.projectId,
    project.glyphOrder
  )
  const glyphs = await loadCanonicalGlyphs(
    input.projectId,
    glyphIds,
    input.batchSize
  )

  return exportGlyphListAsBinary({
    fontData: kumikoRecordsToFontData(project, [], { metadataOnly: true }),
    glyphs,
    format: input.format,
  })
}

export const exportCanonicalProjectInstanceAsBinary = async (input: {
  projectId: string
  format: BinaryFontExportFormat
  instanceId: string
  batchSize?: number
}) => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }

  const instance = project.exportInstances?.find(
    (item) => item.id === input.instanceId
  )
  if (!instance) {
    throw new Error('找不到指定的 export instance')
  }

  const glyphIds = await getCanonicalBinaryExportGlyphIds(
    input.projectId,
    project.glyphOrder
  )
  const glyphs = await loadCanonicalGlyphs(
    input.projectId,
    glyphIds,
    input.batchSize
  )
  const fontData = kumikoRecordsToFontData(project, [], { metadataOnly: true })
  const baked = bakeStaticInstanceGlyphs({
    fontData,
    glyphs,
    instance,
  })

  if (baked.errors.length > 0) {
    throw new Error(formatStaticInstanceBakeError(instance, baked.errors))
  }

  return exportGlyphListAsBinary({
    fontData,
    glyphs: baked.glyphs,
    format: input.format,
    familyName: instance.familyName,
    styleName: instance.styleName || instance.name,
  })
}

const blobToArrayBuffer = (blob: Blob) => blob.arrayBuffer()

const getVariableBuildAxes = (
  axes: ReturnType<typeof kumikoRecordsToFontData>['axes']
) =>
  axes
    ? {
        ...axes,
        axes: axes.axes.map((axis) => {
          const axisWithoutDiscreteValues = { ...axis }
          delete axisWithoutDiscreteValues.values
          return axisWithoutDiscreteValues
        }),
      }
    : undefined

interface VariableMasterSource {
  id: string
  name: string
  location: Record<string, number>
}

interface BracketLayerSource {
  glyph: GlyphData
  layer: GlyphLayerData
  substituteName: string
}

const locationKey = (
  location: Record<string, number>,
  axes: FontAxis[]
): string =>
  axes
    .map((axis) => `${axis.name}:${location[axis.name] ?? axis.defaultValue}`)
    .join('|')

const sanitizeGlyphNamePart = (value: string) =>
  Array.from(value.trim() || 'layer', (char) =>
    char.charCodeAt(0) < 32 || /[\s<>:"/\\|?*]/.test(char) ? '_' : char
  ).join('')

const makeBracketSubstituteGlyphName = (glyphId: string, layerId: string) =>
  `${glyphId}.bracket.${sanitizeGlyphNamePart(layerId)}`

const getBracketLayerSources = (glyphs: GlyphData[]): BracketLayerSource[] =>
  glyphs.flatMap((glyph) =>
    getOrderedGlyphLayers(glyph)
      .filter(
        (layer) =>
          layer.type === 'bracket' &&
          layer.bracketAxisRules &&
          Object.keys(layer.bracketAxisRules).length > 0
      )
      .map((layer) => ({
        glyph,
        layer,
        substituteName: makeBracketSubstituteGlyphName(glyph.id, layer.id),
      }))
  )

const makeBracketRules = (
  bracketLayers: BracketLayerSource[]
): DesignspaceRule[] =>
  bracketLayers.map(({ glyph, layer, substituteName }) => ({
    name: `${glyph.id}.${layer.id}`,
    conditions: Object.fromEntries(
      Object.entries(layer.bracketAxisRules ?? {}).map(([axis, rule]) => [
        axis,
        {
          ...(rule.min !== undefined ? { minimum: rule.min } : {}),
          ...(rule.max !== undefined ? { maximum: rule.max } : {}),
        },
      ])
    ),
    substitutions: [
      {
        name: glyph.id,
        with: substituteName,
      },
    ],
  }))

const cloneBracketLayerAsMaster = (
  layer: GlyphLayerData,
  layerId: string
): GlyphLayerData => ({
  ...structuredClone(layer),
  id: layerId,
  name: layer.name || layerId,
  type: 'master',
  associatedMasterId: layerId,
})

const makeBracketAlternateGlyphs = (
  bracketLayers: BracketLayerSource[]
): GlyphData[] =>
  bracketLayers.map(({ glyph, layer, substituteName }) => {
    const layerId = 'public.default'
    return {
      ...structuredClone(glyph),
      id: substituteName,
      name: substituteName,
      displayName: substituteName,
      unicodes: [],
      activeLayerId: layerId,
      layerOrder: [layerId],
      layers: {
        [layerId]: cloneBracketLayerAsMaster(layer, layerId),
      },
    }
  })

const getVariableMasterSources = (
  regularSources: FontSource[],
  glyphs: GlyphData[],
  axes: FontAxis[]
): VariableMasterSource[] => {
  const masterSources: VariableMasterSource[] = regularSources.map(
    (source) => ({
      id: source.id,
      name: source.name,
      location: source.location,
    })
  )
  const usedLocations = new Set(
    masterSources.map((source) => locationKey(source.location, axes))
  )

  let braceIndex = 1
  for (const glyph of glyphs) {
    for (const layer of getOrderedGlyphLayers(glyph)) {
      if (layer.type !== 'brace' || !layer.braceLocation) {
        continue
      }
      const key = locationKey(layer.braceLocation, axes)
      if (usedLocations.has(key)) {
        continue
      }
      usedLocations.add(key)
      masterSources.push({
        id: `brace-${braceIndex}`,
        name: `Brace ${braceIndex}`,
        location: layer.braceLocation,
      })
      braceIndex += 1
    }
  }

  return masterSources
}

export const exportCanonicalProjectAsVariableOtf = async (input: {
  projectId: string
  batchSize?: number
}) => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }

  const fontData = kumikoRecordsToFontData(project, [], { metadataOnly: true })
  const axes = fontData.axes?.axes ?? []
  const regularSources = Object.values(fontData.sources ?? {})
  if (axes.length === 0 || regularSources.length <= 1) {
    throw new Error('需要至少一條可變軸與兩個 source 才能匯出 variable OTF。')
  }

  const glyphIds = await getCanonicalBinaryExportGlyphIds(
    input.projectId,
    project.glyphOrder
  )
  const glyphs = await loadCanonicalGlyphs(
    input.projectId,
    glyphIds,
    input.batchSize
  )
  const bracketLayerSources = getBracketLayerSources(glyphs)
  if (
    bracketLayerSources.length > 0 &&
    fontData.openTypeFeatures &&
    needsOpenTypeFeatureCompilationForBinaryExport(fontData.openTypeFeatures)
  ) {
    throw new Error(
      'Variable OTF 的 bracket layers 需要保留 fontTools 產生的 FeatureVariations；目前不能同時重編 OpenType features。請先改用 preserve compiled tables 或暫時移除 feature edits。'
    )
  }
  const defaultLocation = Object.fromEntries(
    axes.map((axis) => [axis.name, axis.defaultValue])
  )
  if (
    !regularSources.some((source) =>
      locationsMatch(source.location, defaultLocation, axes)
    )
  ) {
    throw new Error('Variable OTF 匯出需要一個位於軸預設值的 default source。')
  }
  const variableSources = getVariableMasterSources(regularSources, glyphs, axes)
  const bracketAlternateGlyphs = makeBracketAlternateGlyphs(bracketLayerSources)
  const bracketRules = makeBracketRules(bracketLayerSources)
  const familyName = fontData.fontInfo?.familyName || project.title || 'Kumiko'
  const masterFontData = {
    ...fontData,
    openTypeFeatures: undefined,
  }
  const masters = await Promise.all(
    variableSources.map(async (source, index) => {
      const baked = bakeStaticInstanceGlyphs({
        fontData,
        glyphs,
        instance: {
          id: `source-${source.id}`,
          name: source.name,
          styleName: source.name,
          familyName,
          location: source.location,
          export: true,
        },
        includeBracketLayers: false,
      })
      if (baked.errors.length > 0) {
        throw new Error(
          formatStaticInstanceBakeError(
            { name: source.name, styleName: source.name },
            baked.errors
          )
        )
      }
      const fileName = `master-${index + 1}.otf`
      const blob = await exportGlyphListAsBinary({
        fontData: masterFontData,
        glyphs: [...baked.glyphs, ...bracketAlternateGlyphs],
        format: 'otf',
        familyName,
        styleName: source.name,
      })
      return {
        fileName,
        fontBuffer: await blobToArrayBuffer(blob),
        source: {
          filename: fileName,
          name: source.name,
          styleName: source.name,
          familyName,
          location: source.location,
        },
      }
    })
  )

  const designspaceText = serializeDesignspace(
    getVariableBuildAxes(fontData.axes),
    masters.map((master) => master.source),
    bracketRules,
    fontData.exportInstances ?? []
  )
  const variableBuffer = await buildVariableFontWithFontTools(
    designspaceText,
    masters.map((master) => ({
      fileName: master.fileName,
      fontBuffer: master.fontBuffer,
    }))
  )
  const compiledBuffer = await compileManagedFontFeatures(
    variableBuffer,
    fontData.openTypeFeatures
  )
  return new Blob([compiledBuffer], { type: 'font/otf' })
}
