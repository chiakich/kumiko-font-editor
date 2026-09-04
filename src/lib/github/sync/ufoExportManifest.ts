import {
  serializeDesignspace,
  type DesignspaceRule,
  type DesignspaceSourceOut,
} from '@/lib/fontFormats/designspace'
import { buildUfoLibFromFontData } from '@/lib/fontFormats/fontInfoSettings'
import { selectUfoFeatureText } from '@/lib/openTypeFeatures'
import { userNameToFileName } from '@/lib/fontFormats/ufoFileNames'
import { serializeUfoKerning } from '@/lib/fontFormats/ufoKerning'
import { isUfoBackgroundLayer } from '@/lib/fontFormats/ufoFormat'
import type {
  UfoGlyphRecord,
  UfoLayerRecord,
  UfoMetadataRecord,
} from '@/lib/fontFormats/ufoTypes'
import {
  listKumikoGlyphExportScanForProject,
  loadKumikoProjectRecord,
  loadKumikoGlyphRecords,
  makeKumikoGlyphKey,
} from '@/lib/project/kumikoProjectPersistence'
import type {
  KumikoGlyphMetadataRecord,
  KumikoGlyphRecord,
  KumikoGlyphSpecialLayerMetadata,
  KumikoProjectRecord,
} from '@/lib/project/kumikoProjectTypes'
import {
  DEFAULT_UFO_GLYPH_DIR,
  DEFAULT_UFO_LAYER_ID,
  buildMergedUfoFontInfo,
  getGenericExportSources,
  getProjectDesignspaceSource,
  getUfoSource,
  makeContents,
  makeProjectFontDataFromMetadata,
  makeUniqueUfoDir,
  resolveUfoKerningPairs,
  resolveUfoVerticalKerningPairs,
  selectLayerForUfo,
  type KumikoProjectUfoSource,
} from '@/lib/github/sync/ufoExportSources'
import { toUfoGlyphRecord } from '@/lib/github/sync/ufoGlyphRecords'

export interface KumikoUfoExportLayer {
  layer: UfoLayerRecord
  glyphs: UfoGlyphRecord[]
}

export interface KumikoUfoExportUfo {
  metadata: UfoMetadataRecord
  layers: KumikoUfoExportLayer[]
}

export interface KumikoUfoExportManifestUfo {
  source: KumikoProjectUfoSource
  metadata: UfoMetadataRecord
  defaultLayer: UfoLayerRecord
  contents: Record<string, string>
  glyphIds: string[]
  // The subset of glyphIds whose canonical layer for this UFO carries a
  // background. Both projections read it so the path listing and the file
  // stream can never disagree on which background .glif files exist.
  backgroundGlyphIds: Set<string>
  canonicalLayerId: string
  extraGlyphs?: KumikoUfoExportExtraGlyph[]
  designspaceSource?: DesignspaceSourceOut
}

export interface KumikoUfoExportManifest {
  project: KumikoProjectRecord
  ufos: KumikoUfoExportManifestUfo[]
  totalGlyphs: number
  designspace?: {
    relativePath: string
    text: string
  } | null
}

export interface KumikoUfoExportStateUpdate {
  activeUfoId: string
  glyphId: string
  fileName: string
  sourceHash: string | null
}

export interface KumikoUfoExportExtraGlyph {
  glyphId: string
  layerId: string
  glyphName: string
  fileName: string
}

interface KumikoUfoExportSourceEntry {
  source: KumikoProjectUfoSource
  designspaceSource?: DesignspaceSourceOut
  glyphIds?: string[]
  includeBracketExtras: boolean
}

const sanitizeGlyphNamePart = (value: string) =>
  Array.from(value.trim() || 'layer', (char) =>
    char.charCodeAt(0) < 32 || /[\s<>:"/\\|?*]/.test(char) ? '_' : char
  ).join('')

const substituteGlyphName = (glyphId: string, layerId: string) =>
  `${glyphId}.bracket.${sanitizeGlyphNamePart(layerId)}`

const makeBraceUfoId = (glyphId: string, layerId: string) =>
  `brace:${glyphId}:${layerId}`

const makeBracketExtraGlyphs = (
  bracketLayers: KumikoGlyphSpecialLayerMetadata[],
  contents: Record<string, string>
): KumikoUfoExportExtraGlyph[] => {
  const usedFileNames = new Set(
    Object.values(contents).map((fileName) => fileName.toLowerCase())
  )
  return bracketLayers.map((layer) => {
    const glyphName = substituteGlyphName(layer.glyphId, layer.layerId)
    const fileName = userNameToFileName(glyphName, usedFileNames, '.glif')
    usedFileNames.add(fileName.toLowerCase())
    return {
      glyphId: layer.glyphId,
      layerId: layer.layerId,
      glyphName,
      fileName,
    }
  })
}

const makeBracketRules = (
  bracketLayers: KumikoGlyphSpecialLayerMetadata[]
): DesignspaceRule[] =>
  bracketLayers.map((layer) => ({
    name: `${layer.glyphId}.${layer.layerId}`,
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
        name: layer.glyphId,
        with: substituteGlyphName(layer.glyphId, layer.layerId),
      },
    ],
  }))

const mergeDesignspaceRules = (
  existingRules: DesignspaceRule[],
  generatedRules: DesignspaceRule[]
) => {
  const generatedNames = new Set(generatedRules.map((rule) => rule.name))
  return [
    ...existingRules.filter((rule) => !generatedNames.has(rule.name)),
    ...generatedRules,
  ]
}

const makeBraceUfoSourceEntries = (
  braceLayers: KumikoGlyphSpecialLayerMetadata[],
  usedDirs: Set<string>
): KumikoUfoExportSourceEntry[] =>
  braceLayers.map((layer) => {
    const relativePath = makeUniqueUfoDir(
      `${layer.glyphId}-${layer.layerId}.brace`,
      usedDirs
    )
    return {
      source: {
        ufoId: makeBraceUfoId(layer.glyphId, layer.layerId),
        relativePath,
        defaultLayerId: layer.layerId,
        layers: [
          {
            layerId: DEFAULT_UFO_LAYER_ID,
            glyphDir: DEFAULT_UFO_GLYPH_DIR,
          },
        ],
        contents: {
          [layer.glyphId]: userNameToFileName(
            layer.glyphId,
            new Set(),
            '.glif'
          ),
        },
        glyphOrder: [layer.glyphId],
        metainfo: null,
        fontinfoExtra: null,
        libExtra: null,
        groupsExtra: null,
        kerningExtra: null,
      },
      designspaceSource: {
        filename: relativePath,
        name: layer.name || layer.layerId,
        styleName: layer.name || layer.layerId,
        location: layer.braceLocation ?? {},
      },
      glyphIds: [layer.glyphId],
      includeBracketExtras: false,
    }
  })

export const buildMetadata = (
  project: KumikoProjectRecord,
  activeUfoId: string,
  contents: Record<string, string>,
  glyphMetadata: KumikoGlyphMetadataRecord[],
  sourceOverride?: KumikoProjectUfoSource
): UfoMetadataRecord => {
  const { source } = getUfoSource(project, activeUfoId, sourceOverride)
  const metadataFontData = makeProjectFontDataFromMetadata(
    project,
    glyphMetadata
  )
  // Canonical project kerning wins; imported non-kerning groups survive.
  // Each UFO gets its own master's pairs — writing the default master's
  // kerning into every UFO would clobber the other masters' data.
  const ufoKerning = serializeUfoKerning(
    {
      kerningGroups: metadataFontData.kerningGroups,
      kerningPairs: resolveUfoKerningPairs(project, source.ufoId),
      verticalKerningPairs: resolveUfoVerticalKerningPairs(
        project,
        source.ufoId
      ),
    },
    {
      groups: source.groupsExtra,
    }
  )
  return {
    projectId: project.projectId,
    ufoId: source.ufoId,
    relativePath: source.relativePath,
    metainfo: source.metainfo ?? {},
    fontinfo: buildMergedUfoFontInfo(
      project,
      source,
      project.title || project.projectId
    ),
    lib: buildUfoLibFromFontData(metadataFontData, source.libExtra, {
      // Each UFO's lib carries its own master's vertical kerning, with group
      // references mapped to this UFO's group keys.
      verticalKerning: ufoKerning.verticalKerning,
    }),
    groups: ufoKerning.groups,
    kerning: ufoKerning.kerning,
    featuresText: selectUfoFeatureText(metadataFontData),
    layers: source.layers,
    contents,
    glyphOrder:
      source.glyphOrder.length > 0 ? source.glyphOrder : project.glyphOrder,
    textStyle: source.textStyle ?? null,
    updatedAt: project.updatedAt,
  }
}

const orderGlyphExportMetadata = <
  T extends Pick<KumikoGlyphRecord, 'glyphId' | 'sourceData'>,
>(
  project: KumikoProjectRecord,
  glyphs: T[]
): T[] => {
  const byGlyphId = new Map(glyphs.map((glyph) => [glyph.glyphId, glyph]))
  const orderedGlyphIds = new Set(project.glyphOrder)
  return [
    ...project.glyphOrder
      .map((glyphId) => byGlyphId.get(glyphId))
      .filter((glyph): glyph is T => Boolean(glyph)),
    ...glyphs.filter((glyph) => !orderedGlyphIds.has(glyph.glyphId)),
  ]
}

export const buildKumikoUfoExportManifest = async (
  projectId: string
): Promise<KumikoUfoExportManifest> => {
  const project = await loadKumikoProjectRecord(projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }
  const sourceBackedUfos = project.sourceData?.ufo?.ufos
  const baseUfoSourceEntries: KumikoUfoExportSourceEntry[] =
    sourceBackedUfos?.length
      ? sourceBackedUfos.map((source, index) => ({
          source,
          designspaceSource: getProjectDesignspaceSource(
            project,
            source,
            index
          ),
          includeBracketExtras: true,
        }))
      : getGenericExportSources(project).map((entry) => ({
          ...entry,
          includeBracketExtras: true,
        }))

  const glyphScan = await listKumikoGlyphExportScanForProject(projectId)
  const glyphs = orderGlyphExportMetadata(project, glyphScan.metadata)
  const glyphIds = glyphs.map((glyph) => glyph.glyphId)
  const glyphIdSet = new Set(glyphIds)
  const specialLayers = glyphScan.specialLayers.filter((layer) =>
    glyphIdSet.has(layer.glyphId)
  )
  const braceLayers = specialLayers.filter(
    (layer) => layer.type === 'brace' && layer.braceLocation
  )
  const bracketLayers = specialLayers.filter(
    (layer) => layer.type === 'bracket' && layer.bracketAxisRules
  )
  const usedDirs = new Set(
    baseUfoSourceEntries.map(({ source }) => source.relativePath.toLowerCase())
  )
  const braceUfoSourceEntries = makeBraceUfoSourceEntries(braceLayers, usedDirs)
  const glyphsById = new Map(glyphs.map((glyph) => [glyph.glyphId, glyph]))
  const ufoSourceEntries = [...baseUfoSourceEntries, ...braceUfoSourceEntries]
  const ufos = ufoSourceEntries.map((entry) => {
    const { source, designspaceSource } = entry
    const entryGlyphIds = entry.glyphIds ?? glyphIds
    const entryGlyphs = entryGlyphIds
      .map((glyphId) => glyphsById.get(glyphId))
      .filter((glyph): glyph is KumikoGlyphMetadataRecord => Boolean(glyph))
    const contents = makeContents(project, entryGlyphs, source.ufoId, source)
    const extraGlyphs = entry.includeBracketExtras
      ? makeBracketExtraGlyphs(bracketLayers, contents)
      : []
    const metadataContents = {
      ...contents,
      ...Object.fromEntries(
        extraGlyphs.map((glyph) => [glyph.glyphName, glyph.fileName])
      ),
    }
    const metadata = buildMetadata(
      project,
      source.ufoId,
      metadataContents,
      entryGlyphs,
      source
    )
    const { defaultLayer, canonicalLayerId } = getUfoSource(
      project,
      source.ufoId,
      source
    )
    const backgroundGlyphIds = new Set(
      entryGlyphIds.filter((glyphId) => {
        const presence = glyphScan.presence.get(glyphId)
        return presence
          ? Boolean(
              selectLayerForUfo(presence, canonicalLayerId)?.hasBackground
            )
          : false
      })
    )
    return {
      source,
      metadata,
      defaultLayer,
      contents,
      glyphIds: entryGlyphIds,
      backgroundGlyphIds,
      canonicalLayerId,
      ...(extraGlyphs.length > 0 ? { extraGlyphs } : {}),
      designspaceSource,
    }
  })
  const designspaceSources = ufos
    .map((ufo) => ufo.designspaceSource)
    .filter((source): source is DesignspaceSourceOut => Boolean(source))
  const needsDesignspace =
    project.sourceFormat === 'designspace' ||
    designspaceSources.length > 1 ||
    braceUfoSourceEntries.length > 0 ||
    bracketLayers.length > 0
  const designspaceRules = mergeDesignspaceRules(
    project.sourceData?.ufo?.designspace?.rules ?? [],
    makeBracketRules(bracketLayers)
  )
  const designspace =
    needsDesignspace && designspaceSources.length > 0
      ? {
          relativePath:
            project.sourceData?.ufo?.designspacePath ??
            `${project.title || project.projectId}.designspace`,
          text: serializeDesignspace(
            project.axes,
            designspaceSources,
            designspaceRules,
            project.exportInstances ?? []
          ),
        }
      : null
  return {
    project,
    ufos,
    totalGlyphs: ufos.reduce(
      (sum, ufo) => sum + ufo.glyphIds.length + (ufo.extraGlyphs?.length ?? 0),
      0
    ),
    designspace,
  }
}

export const loadKumikoUfoExportGlyphBatch = async (input: {
  project: KumikoProjectRecord
  activeUfoId: string
  source?: KumikoProjectUfoSource
  contents: Record<string, string>
  glyphIds: string[]
  targetLayer?: UfoLayerRecord
}): Promise<UfoGlyphRecord[]> => {
  const glyphs = await loadKumikoGlyphRecords(
    input.glyphIds.map((glyphId) =>
      makeKumikoGlyphKey(input.project.projectId, glyphId)
    )
  )
  const { defaultLayer, canonicalLayerId } = getUfoSource(
    input.project,
    input.activeUfoId,
    input.source
  )
  const targetLayer = input.targetLayer ?? defaultLayer
  return glyphs.flatMap((glyph) => {
    const layer = selectLayerForUfo(glyph, canonicalLayerId)
    if (
      targetLayer.layerId !== defaultLayer.layerId &&
      (!isUfoBackgroundLayer(targetLayer, defaultLayer) || !layer?.background)
    ) {
      return []
    }
    return [
      toUfoGlyphRecord({
        project: input.project,
        glyph,
        activeUfoId: input.activeUfoId,
        source: input.source,
        fileName: input.contents[glyph.glyphId] ?? `${glyph.glyphId}.glif`,
        targetLayer,
      }),
    ]
  })
}

export const loadKumikoUfoExportExtraGlyphBatch = async (input: {
  project: KumikoProjectRecord
  activeUfoId: string
  source?: KumikoProjectUfoSource
  extraGlyphs: KumikoUfoExportExtraGlyph[]
  targetLayer?: UfoLayerRecord
}): Promise<UfoGlyphRecord[]> => {
  const uniqueGlyphIds = [
    ...new Set(input.extraGlyphs.map((glyph) => glyph.glyphId)),
  ]
  const glyphs = await loadKumikoGlyphRecords(
    uniqueGlyphIds.map((glyphId) =>
      makeKumikoGlyphKey(input.project.projectId, glyphId)
    )
  )
  const glyphsById = new Map(glyphs.map((glyph) => [glyph.glyphId, glyph]))
  return input.extraGlyphs.flatMap((extraGlyph) => {
    const glyph = glyphsById.get(extraGlyph.glyphId)
    if (!glyph) {
      return []
    }
    return [
      toUfoGlyphRecord({
        project: input.project,
        glyph,
        activeUfoId: input.activeUfoId,
        source: input.source,
        fileName: extraGlyph.fileName,
        targetLayer: input.targetLayer,
        layerId: extraGlyph.layerId,
        glyphName: extraGlyph.glyphName,
      }),
    ]
  })
}

export const buildKumikoUfoExportState = async (
  projectId: string
): Promise<{ project: KumikoProjectRecord; ufos: KumikoUfoExportUfo[] }> => {
  const manifest = await buildKumikoUfoExportManifest(projectId)
  const ufos = await Promise.all(
    manifest.ufos.map(async (ufo) => {
      const defaultGlyphs = await loadKumikoUfoExportGlyphBatch({
        project: manifest.project,
        activeUfoId: ufo.metadata.ufoId,
        source: ufo.source,
        contents: ufo.contents,
        glyphIds: ufo.glyphIds,
      })
      const extraGlyphs = await loadKumikoUfoExportExtraGlyphBatch({
        project: manifest.project,
        activeUfoId: ufo.metadata.ufoId,
        source: ufo.source,
        extraGlyphs: ufo.extraGlyphs ?? [],
        targetLayer: ufo.defaultLayer,
      })
      return {
        metadata: ufo.metadata,
        layers: ufo.metadata.layers.map((layer) => ({
          layer,
          glyphs:
            layer.layerId === ufo.defaultLayer.layerId
              ? [...defaultGlyphs, ...extraGlyphs]
              : [],
        })),
      } satisfies KumikoUfoExportUfo
    })
  )
  return {
    project: manifest.project,
    ufos,
  }
}
