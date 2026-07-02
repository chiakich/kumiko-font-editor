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
  type StaticInstanceBakeProblem,
} from 'src/font/staticInstance'
import {
  compileManagedFontFeatures,
  needsOpenTypeFeatureCompilationForBinaryExport,
} from 'src/lib/openTypeFeatures'
import { checkGlyphInterpolationCompatibility } from 'src/font/glyphCompatibility'
import { activeLayer } from 'src/store/glyphLayer'
import type {
  FontAxes,
  FontAxis,
  FontExportInstance,
  FontSource,
  GlyphData,
  GlyphLayerData,
} from 'src/store'

const BINARY_EXPORT_GLYPH_BATCH_SIZE = 256
const POST_SCRIPT_SAFE_NAME_MAX_LENGTH = 60

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

// Pass axes through unchanged: discrete `values` are now serialized as a
// designspaceLib-compatible `values` attribute so varLib treats the axis as
// discrete instead of interpolating undesigned in-between locations.
const getVariableBuildAxes = (
  axes: ReturnType<typeof kumikoRecordsToFontData>['axes']
) => axes

interface VariableMasterSource {
  id: string
  name: string
  location: Record<string, number>
}

const normalizePostScriptSafeNamePart = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const trimPostScriptSafeNamePart = (value: string) =>
  value.slice(0, POST_SCRIPT_SAFE_NAME_MAX_LENGTH).replace(/-+$/g, '')

const makePostScriptSafeNamePart = (value: string, fallback: string) => {
  const fallbackName = normalizePostScriptSafeNamePart(fallback) || 'KumikoName'
  return (
    trimPostScriptSafeNamePart(normalizePostScriptSafeNamePart(value)) ||
    trimPostScriptSafeNamePart(fallbackName)
  )
}

const makeUniquePostScriptSafeNamePart = (
  value: string,
  fallback: string,
  usedNames: Set<string>
) => {
  const base = makePostScriptSafeNamePart(value, fallback)
  let candidate = base
  let suffix = 2
  while (usedNames.has(candidate)) {
    const suffixText = `-${suffix}`
    const baseWithRoom =
      trimPostScriptSafeNamePart(
        base.slice(0, POST_SCRIPT_SAFE_NAME_MAX_LENGTH - suffixText.length)
      ) || makePostScriptSafeNamePart(fallback, 'KumikoName')
    candidate = `${baseWithRoom}${suffixText}`
    suffix += 1
  }
  usedNames.add(candidate)
  return candidate
}

export const makeVariableBuildMasterNames = (
  familyName: string,
  sources: Array<{ name: string }>
) => {
  const safeFamilyName = makePostScriptSafeNamePart(
    familyName,
    'KumikoVariable'
  )
  const usedStyleNames = new Set<string>()
  return sources.map((source, index) => ({
    familyName: safeFamilyName,
    styleName: makeUniquePostScriptSafeNamePart(
      source.name,
      `Master-${index + 1}`,
      usedStyleNames
    ),
  }))
}

const isLocationValueWithinAxisRange = (
  value: number | undefined,
  axis: FontAxis
) => {
  const locationValue = value ?? axis.defaultValue
  if (!Number.isFinite(locationValue)) {
    return false
  }
  const min = Math.min(axis.minValue, axis.maxValue)
  const max = Math.max(axis.minValue, axis.maxValue)
  return locationValue >= min && locationValue <= max
}

export const getVariableBuildExportInstances = (
  axes: FontAxes | undefined,
  instances: FontExportInstance[] = []
) => {
  const axisEntries = axes?.axes ?? []
  return instances.filter(
    (instance) =>
      instance.export !== false &&
      axisEntries.every((axis) =>
        isLocationValueWithinAxisRange(instance.location[axis.name], axis)
      )
  )
}

const formatBakeProblemPreview = (errors: StaticInstanceBakeProblem[]) => {
  const preview = errors
    .slice(0, 5)
    .map((error) => `${error.glyphName}: ${error.message}`)
    .join('；')
  const suffix = errors.length > 5 ? `；還有 ${errors.length - 5} 個 glyph` : ''
  return `${errors.length} 個 glyph 無法建立 master。${preview}${suffix}`
}

const formatVariableMasterBakeError = (
  source: Pick<VariableMasterSource, 'name'>,
  errors: StaticInstanceBakeProblem[]
) =>
  `無法匯出 Variable OTF：source「${source.name}」${formatBakeProblemPreview(errors)}`

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

interface BakedMaster {
  fileName: string
  buildNames: { familyName: string; styleName: string }
  glyphs: GlyphData[]
  source: {
    filename: string
    name: string
    styleName: string
    familyName: string
    location: Record<string, number>
  }
}

// varLib requires every master to share each glyph's point/component structure.
// Exact-source masters bypass the interpolation compatibility gate, so check the
// baked masters here and surface a readable error instead of a raw fontTools
// traceback deep inside the varLib merge.
export const findIncompatibleMasterGlyphs = (
  glyphs: GlyphData[],
  bakedMasters: Array<{ glyphs: GlyphData[] }>
): string[] => {
  if (bakedMasters.length < 2) {
    return []
  }
  const incompatible: string[] = []
  glyphs.forEach((glyph, index) => {
    const layers = bakedMasters.map((master) =>
      master.glyphs[index] ? activeLayer(master.glyphs[index]) : undefined
    )
    if (!checkGlyphInterpolationCompatibility(layers).compatible) {
      incompatible.push(glyph.displayName ?? glyph.name ?? glyph.id)
    }
  })
  return incompatible
}

const formatIncompatibleMasterError = (glyphNames: string[]) => {
  const preview = glyphNames.slice(0, 5).join('、')
  const suffix =
    glyphNames.length > 5 ? ` 等 ${glyphNames.length} 個 glyph` : ''
  return `無法匯出 Variable OTF：${glyphNames.length} 個 glyph 各 master 結構不相容（節點/component 數量或順序不一致）：${preview}${suffix}`
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
  const shouldCompileFeaturesBeforeVariableBuild = Boolean(
    bracketLayerSources.length > 0 &&
    fontData.openTypeFeatures &&
    needsOpenTypeFeatureCompilationForBinaryExport(fontData.openTypeFeatures)
  )
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
  const variableBuildMasterNames = makeVariableBuildMasterNames(
    familyName,
    variableSources
  )
  const masterFontData = {
    ...fontData,
    openTypeFeatures: shouldCompileFeaturesBeforeVariableBuild
      ? fontData.openTypeFeatures
      : undefined,
  }
  const bakedMasters: BakedMaster[] = variableSources.map((source, index) => {
    const buildNames = variableBuildMasterNames[index]
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
      throw new Error(formatVariableMasterBakeError(source, baked.errors))
    }
    const fileName = `master-${index + 1}.otf`
    return {
      fileName,
      buildNames,
      glyphs: baked.glyphs,
      source: {
        filename: fileName,
        name: buildNames.styleName,
        styleName: buildNames.styleName,
        familyName: buildNames.familyName,
        location: source.location,
      },
    }
  })

  const incompatibleGlyphs = findIncompatibleMasterGlyphs(glyphs, bakedMasters)
  if (incompatibleGlyphs.length > 0) {
    throw new Error(formatIncompatibleMasterError(incompatibleGlyphs))
  }

  const masters = await Promise.all(
    bakedMasters.map(async (master) => {
      const blob = await exportGlyphListAsBinary({
        fontData: masterFontData,
        glyphs: [...master.glyphs, ...bracketAlternateGlyphs],
        format: 'otf',
        familyName: master.buildNames.familyName,
        styleName: master.buildNames.styleName,
      })
      return {
        fileName: master.fileName,
        fontBuffer: await blobToArrayBuffer(blob),
        source: master.source,
      }
    })
  )

  const designspaceText = serializeDesignspace(
    getVariableBuildAxes(fontData.axes),
    masters.map((master) => master.source),
    bracketRules,
    getVariableBuildExportInstances(fontData.axes, fontData.exportInstances)
  )
  const variableBuffer = await buildVariableFontWithFontTools(
    designspaceText,
    masters.map((master) => ({
      fileName: master.fileName,
      fontBuffer: master.fontBuffer,
    }))
  ).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `無法建立 Variable OTF（fontTools varLib 合併失敗）：${detail}`
    )
  })
  const compiledBuffer = shouldCompileFeaturesBeforeVariableBuild
    ? variableBuffer
    : await compileManagedFontFeatures(
        variableBuffer,
        fontData.openTypeFeatures
      )
  return new Blob([compiledBuffer], { type: 'font/otf' })
}
