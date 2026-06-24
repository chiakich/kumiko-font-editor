import { hashString } from 'src/lib/hash'
import { gitBlobShaFromText } from 'src/lib/github/sync/gitBlobSha'
import {
  buildSyncReport,
  computeGlyphSyncEntries,
  joinRepoPath,
  type SyncGlyphRecord,
} from 'src/lib/github/sync/computeSyncReport'
import { fetchRemoteTree } from 'src/lib/github/sync/remoteTree'
import { fetchGitHubArchiveSnapshot } from 'src/lib/github/githubImport'
import type {
  GitHubSyncTarget,
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'
import {
  deleteKumikoGlyphRecordBatch,
  listKumikoGlyphMetadataForProject,
  listKumikoGlyphSpecialLayerMetadataForProject,
  listKumikoGlyphSyncMetadataForProject,
  listSyncDirtyKumikoGlyphIds,
  loadKumikoProjectRecord,
  loadKumikoGlyphRecords,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecordBatch,
  saveKumikoProjectRecord,
} from 'src/lib/project/kumikoProjectPersistence'
import type {
  KumikoGlyphLayerRecord,
  KumikoGlyphMetadataRecord,
  KumikoGlyphRecord,
  KumikoGlyphSpecialLayerMetadata,
  KumikoProjectRecord,
} from 'src/lib/project/kumikoProjectTypes'
import {
  serializeDesignspace,
  type DesignspaceRule,
  type DesignspaceSourceOut,
} from 'src/lib/fontFormats/designspace'
import {
  buildUfoLibFromFontData,
  fontInfoToUfoFontInfo,
} from 'src/lib/fontFormats/fontInfoSettings'
import { selectUfoFeatureText } from 'src/lib/openTypeFeatures'
import { userNameToFileName } from 'src/lib/fontFormats/ufoFileNames'
import {
  buildBoundsResolver,
  buildWorkspaceFileMapFromEntries,
  glyphRecordToLayerContent,
  isUfoBackgroundLayer,
  pathToUfoContour,
  parseGlifText,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontFormats/ufoFormat'
import type {
  UfoGlyphRecord,
  UfoLayerRecord,
  UfoMetadataRecord,
} from 'src/lib/fontFormats/ufoTypes'
import { parseUfoColor, serializeUfoColor } from 'src/lib/color/kumikoColor'
import {
  getKumikoComponentRefMatrix,
  glyphDataToKumikoGlyphRecord,
  kumikoGlyphRecordToGlyphData,
  kumikoGlyphRecordToGlyphMetadata,
} from 'src/lib/project/kumikoFontDataAdapter'
import type {
  FontData,
  GlyphData,
  GlyphLayerData,
  PathSegmentType,
} from 'src/store'

export interface GitHubCommitFileInput {
  path: string
  content?: string
  deleted?: boolean
}

export interface GitHubCommitRequestInput {
  repo: string
  baseBranch: string
  commitMessage: string
  branchName?: string
  files: GitHubCommitFileInput[]
}

export interface GitHubPreparedCommit {
  request: GitHubCommitRequestInput
  changedGlyphNames: string[]
  exportStateUpdates: Array<{
    activeUfoId: string
    glyphId: string
    fileName: string
    sourceHash: string | null
    remoteBlobSha: string | null
  }>
  syncTarget: {
    projectId: string
    headOwner?: string
    branchName?: string
    commitSha?: string
  }
}

export interface ApplyRemoteResult {
  appliedCount: number
  remainingConflicts: number
}

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

const UFO_STATE_MARK_BATCH_SIZE = 256
const GENERIC_UFO_ID = 'font-export'
const DEFAULT_UFO_LAYER_ID = 'public.default'
const DEFAULT_UFO_GLYPH_DIR = 'glyphs'

export type KumikoProjectUfoSource = NonNullable<
  NonNullable<NonNullable<KumikoProjectRecord['sourceData']>['ufo']>['ufos']
>[number]

const makeProjectFontDataFromMetadata = (
  project: KumikoProjectRecord,
  glyphs: KumikoGlyphMetadataRecord[]
): FontData => ({
  glyphs: Object.fromEntries(
    glyphs.map((glyph) => [
      glyph.glyphId,
      kumikoGlyphRecordToGlyphMetadata(glyph),
    ])
  ),
  glyphOrder: project.glyphOrder,
  fontInfo: project.fontInfo,
  unitsPerEm: project.unitsPerEm,
  axes: project.axes,
  sources: project.sources,
  exportInstances: project.exportInstances,
  openTypeFeatures: project.openTypeFeatures,
  kerningGroups: project.kerningGroups,
  kerningPairs: project.kerningPairs,
  statusDefinitions: project.statusDefinitions,
  settings: project.settings,
  lineMetricsHorizontalLayout: project.lineMetricsHorizontalLayout,
})

const buildUfoFontInfoFromProject = (
  project: KumikoProjectRecord,
  fontInfoName: string
) => ({
  ...fontInfoToUfoFontInfo(
    project.fontInfo,
    fontInfoName,
    project.unitsPerEm ?? 1000
  ),
  ...(project.lineMetricsHorizontalLayout?.ascender
    ? { ascender: project.lineMetricsHorizontalLayout.ascender.value }
    : {}),
  ...(project.lineMetricsHorizontalLayout?.descender
    ? { descender: project.lineMetricsHorizontalLayout.descender.value }
    : {}),
  ...(project.lineMetricsHorizontalLayout?.xHeight
    ? { xHeight: project.lineMetricsHorizontalLayout.xHeight.value }
    : {}),
  ...(project.lineMetricsHorizontalLayout?.capHeight
    ? { capHeight: project.lineMetricsHorizontalLayout.capHeight.value }
    : {}),
})

const makeUniqueUfoDir = (
  name: string,
  usedNames: Set<string>,
  fallback = 'font'
) => {
  const fileBase = Array.from((name || fallback).trim() || fallback, (char) =>
    char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char
  ).join('')
  let fileName = `${fileBase}.ufo`
  let suffix = 2
  while (usedNames.has(fileName.toLowerCase())) {
    fileName = `${fileBase}-${suffix}.ufo`
    suffix += 1
  }
  usedNames.add(fileName.toLowerCase())
  return fileName
}

const sanitizeGlyphNamePart = (value: string) =>
  Array.from(value.trim() || 'layer', (char) =>
    char.charCodeAt(0) < 32 || /[\s<>:"/\\|?*]/.test(char) ? '_' : char
  ).join('')

const substituteGlyphName = (glyphId: string, layerId: string) =>
  `${glyphId}.bracket.${sanitizeGlyphNamePart(layerId)}`

const makeBraceUfoId = (glyphId: string, layerId: string) =>
  `brace:${glyphId}:${layerId}`

const getGenericExportSources = (
  project: KumikoProjectRecord
): Array<{
  source: KumikoProjectUfoSource
  designspaceSource?: DesignspaceSourceOut
}> => {
  const projectSources = Object.values(project.sources ?? {})
  const usedNames = new Set<string>()
  if (projectSources.length > 1) {
    return projectSources.map((source) => {
      const relativePath = makeUniqueUfoDir(source.name || source.id, usedNames)
      return {
        source: {
          ufoId: source.id,
          relativePath,
          defaultLayerId: source.id,
          layers: [
            {
              layerId: DEFAULT_UFO_LAYER_ID,
              glyphDir: DEFAULT_UFO_GLYPH_DIR,
            },
          ],
          contents: {},
          glyphOrder: project.glyphOrder,
          metainfo: null,
          fontinfoExtra: null,
          libExtra: null,
          groupsExtra: null,
          kerningExtra: null,
        },
        designspaceSource: {
          filename: relativePath,
          name: source.name || source.id,
          styleName: source.name || source.id,
          location: source.location,
        },
      }
    })
  }

  const onlySource = projectSources[0]
  return [
    {
      source: {
        ufoId: onlySource?.id ?? GENERIC_UFO_ID,
        relativePath: makeUniqueUfoDir(
          project.title || project.projectId,
          usedNames
        ),
        defaultLayerId: onlySource?.id ?? DEFAULT_UFO_LAYER_ID,
        layers: [
          {
            layerId: DEFAULT_UFO_LAYER_ID,
            glyphDir: DEFAULT_UFO_GLYPH_DIR,
          },
        ],
        contents: {},
        glyphOrder: project.glyphOrder,
        metainfo: null,
        fontinfoExtra: null,
        libExtra: null,
        groupsExtra: null,
        kerningExtra: null,
      },
    },
  ]
}

const getProjectDesignspaceSource = (
  project: KumikoProjectRecord,
  source: KumikoProjectUfoSource,
  index: number
): DesignspaceSourceOut | undefined => {
  const importedSource = project.sourceData?.ufo?.designspace?.sources.find(
    (candidate) => candidate.filename === source.relativePath
  )
  if (importedSource) {
    return {
      filename: source.relativePath,
      name: importedSource.name,
      styleName: importedSource.styleName,
      location: importedSource.location,
    }
  }

  const projectSource = Object.values(project.sources ?? {})[index]
  if (!projectSource) {
    return undefined
  }

  return {
    filename: source.relativePath,
    name: projectSource.name || projectSource.id,
    styleName: projectSource.name || projectSource.id,
    location: projectSource.location,
  }
}

const getCanonicalLayerIdForUfo = (
  project: KumikoProjectRecord,
  source: KumikoProjectUfoSource
) => {
  const designspaceSource = project.sourceData?.ufo?.designspace?.sources.find(
    (candidate) => candidate.filename === source.relativePath
  )
  if (!designspaceSource) {
    return source.defaultLayerId
  }

  const projectSources = Object.values(project.sources ?? {})
  return (
    projectSources.find((candidate) => candidate.id === designspaceSource.name)
      ?.id ??
    projectSources.find(
      (candidate) => candidate.name === designspaceSource.name
    )?.id ??
    designspaceSource.name
  )
}

const getUfoSource = (
  project: KumikoProjectRecord,
  activeUfoId: string,
  sourceOverride?: KumikoProjectUfoSource
) => {
  const source =
    sourceOverride ??
    project.sourceData?.ufo?.ufos?.find(
      (candidate) => candidate.ufoId === activeUfoId
    ) ??
    getGenericExportSources(project).find(
      (candidate) => candidate.source.ufoId === activeUfoId
    )?.source
  if (!source) {
    throw new Error('找不到目前 UFO 的 metadata')
  }
  const defaultLayer =
    source.layers.find((layer) => layer.layerId === source.defaultLayerId) ??
    source.layers[0] ??
    ({ layerId: 'public.default', glyphDir: 'glyphs' } satisfies UfoLayerRecord)
  return {
    source,
    defaultLayer,
    canonicalLayerId: getCanonicalLayerIdForUfo(project, source),
  }
}

export const resolveKumikoSyncTarget = (
  project: KumikoProjectRecord
): GitHubSyncTarget | null => {
  if (project.sourceData?.ufo?.lastSync) {
    return project.sourceData.ufo.lastSync
  }
  if (!project.githubSource) {
    return null
  }
  return {
    owner: project.githubSource.owner,
    repo: project.githubSource.repo,
    ref: project.githubSource.ref,
    commitSha: project.githubSource.commitSha ?? null,
    syncedAt: project.createdAt,
  }
}

const readGlyphUfoSource = (glyph: Pick<KumikoGlyphRecord, 'sourceData'>) =>
  glyph.sourceData?.ufo ?? {}

const readLayerUfoSource = (layer: KumikoGlyphLayerRecord | undefined) =>
  layer?.sourceData?.ufo ?? {}

const selectLayerForUfo = (glyph: KumikoGlyphRecord, defaultLayerId: string) =>
  glyph.layers[defaultLayerId] ??
  glyph.layerOrder.map((layerId) => glyph.layers[layerId]).find(Boolean) ??
  Object.values(glyph.layers)[0]

type KumikoUfoLayerContent = Pick<
  KumikoGlyphLayerRecord,
  'paths' | 'componentRefs' | 'anchors' | 'guidelines' | 'metrics'
>

const makeContents = (
  project: KumikoProjectRecord,
  glyphs: Array<Pick<KumikoGlyphRecord, 'glyphId' | 'sourceData'>>,
  activeUfoId: string,
  sourceOverride?: KumikoProjectUfoSource
) => {
  const { source } = getUfoSource(project, activeUfoId, sourceOverride)
  const usedFileNames = new Set(
    Object.values(source.contents).map((fileName) => fileName.toLowerCase())
  )
  const contents: Record<string, string> = {}
  for (const glyph of glyphs) {
    const existing =
      readGlyphUfoSource(glyph).fileName ?? source.contents[glyph.glyphId]
    const fileName =
      existing ?? userNameToFileName(glyph.glyphId, usedFileNames, '.glif')
    usedFileNames.add(fileName.toLowerCase())
    contents[glyph.glyphId] = fileName
  }
  return contents
}

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

const toUfoGlyphRecord = (input: {
  project: KumikoProjectRecord
  glyph: KumikoGlyphRecord
  activeUfoId: string
  fileName: string
  source?: KumikoProjectUfoSource
  layerId?: string
  glyphName?: string
  targetLayer?: UfoLayerRecord
}): UfoGlyphRecord => {
  const { source, defaultLayer } = getUfoSource(
    input.project,
    input.activeUfoId,
    input.source
  )
  const targetLayer = input.targetLayer ?? defaultLayer
  const layer = input.layerId
    ? input.glyph.layers[input.layerId]
    : selectLayerForUfo(
        input.glyph,
        getCanonicalLayerIdForUfo(input.project, source)
      )
  if (!layer) {
    throw new Error(`字圖 ${input.glyph.glyphId} 沒有可寫入 UFO 的 layer`)
  }
  const isSyntheticBraceSource = source.ufoId.startsWith('brace:')
  const isPrimaryDefaultGlyph =
    targetLayer.layerId === defaultLayer.layerId &&
    !input.glyphName &&
    !input.layerId &&
    !isSyntheticBraceSource
  const content: KumikoUfoLayerContent | null =
    targetLayer.layerId === defaultLayer.layerId
      ? {
          paths: layer.paths,
          componentRefs: layer.componentRefs,
          anchors: layer.anchors,
          guidelines: layer.guidelines,
          metrics: layer.metrics,
        }
      : isUfoBackgroundLayer(targetLayer, defaultLayer)
        ? (layer.background ?? null)
        : null
  if (!content) {
    throw new Error(
      `字圖 ${input.glyph.glyphId} 沒有可寫入 UFO layer ${targetLayer.layerId} 的內容`
    )
  }
  const glyphSource = readGlyphUfoSource(input.glyph)
  const layerSource = readLayerUfoSource(layer)

  return {
    projectId: input.project.projectId,
    ufoId: source.ufoId,
    layerId: targetLayer.layerId,
    glyphName: input.glyphName ?? input.glyph.glyphId,
    fileName: input.fileName,
    sourceHash: isPrimaryDefaultGlyph
      ? (glyphSource.sourceHash ?? layerSource.sourceHash ?? null)
      : null,
    remoteBlobSha: isPrimaryDefaultGlyph
      ? (glyphSource.remoteBlobSha ?? layerSource.remoteBlobSha ?? null)
      : null,
    unicodes: isPrimaryDefaultGlyph ? input.glyph.unicodes : [],
    advance: {
      width: content.metrics.width,
      height: isPrimaryDefaultGlyph
        ? (layer.verticalMetrics?.height ?? null)
        : null,
    },
    anchors: content.anchors.map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      name: anchor.name,
      color: serializeUfoColor(anchor.color),
      identifier: anchor.identifier ?? anchor.id,
    })),
    guidelines: content.guidelines.map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
      name: guide.name ?? null,
      color: serializeUfoColor(guide.color),
      identifier: guide.identifier ?? guide.id,
    })),
    contours: content.paths.map((path) => pathToUfoContour(path)),
    components: content.componentRefs.map((component) => {
      const matrix = getKumikoComponentRefMatrix(component)
      return {
        base: component.glyphId,
        identifier: component.identifier ?? component.id,
        xScale: matrix.a,
        yScale: matrix.d,
        ...(matrix.b !== 0 ? { xyScale: matrix.b } : {}),
        ...(matrix.c !== 0 ? { yxScale: matrix.c } : {}),
        xOffset: matrix.e,
        yOffset: matrix.f,
      }
    }),
    note: isPrimaryDefaultGlyph
      ? (layerSource.note ?? input.glyph.note ?? null)
      : null,
    image:
      isPrimaryDefaultGlyph && layer.image
        ? {
            ...layer.image,
            color: serializeUfoColor(layer.image.color),
          }
        : null,
    lib: isPrimaryDefaultGlyph ? (layerSource.lib ?? null) : null,
    dirty: input.glyph.syncDirty === 1,
    dirtyIndex: input.glyph.syncDirty,
    updatedAt: input.glyph.updatedAt,
  }
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
  return segmentTypes.has('quadratic') && !segmentTypes.has('cubic')
    ? 'quadratic'
    : 'cubic'
}

type UfoLayerContent = ReturnType<typeof glyphRecordToLayerContent>
type KumikoLayerContent = Omit<UfoLayerContent, 'components'>

const asPlainRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const omitLegacyLayerComponents = (content: UfoLayerContent) => {
  const layerContent = { ...content } as KumikoLayerContent & {
    components?: unknown
  }
  delete layerContent.components
  return layerContent
}

const ufoGlyphToGlyphData = (input: {
  project: KumikoProjectRecord
  activeUfoId: string
  record: UfoGlyphRecord
  text: string
  existing?: KumikoGlyphRecord
  remoteBlobSha: string | null
}): GlyphData => {
  const { source, defaultLayer, canonicalLayerId } = getUfoSource(
    input.project,
    input.activeUfoId
  )
  const resolveBounds = buildBoundsResolver([input.record])
  const layerContent = glyphRecordToLayerContent(input.record, resolveBounds)
  const content = omitLegacyLayerComponents(layerContent)
  const existingGlyph = input.existing
    ? kumikoGlyphRecordToGlyphData(input.existing)
    : null
  const sourceHash = hashString(input.text)
  const layer: GlyphLayerData = {
    id: canonicalLayerId,
    name: canonicalLayerId,
    type: 'master',
    associatedMasterId: canonicalLayerId,
    ...content,
    sourceData: {
      ...existingGlyph?.layers?.[canonicalLayerId]?.sourceData,
      ufo: {
        ufoId: source.ufoId,
        layerId: defaultLayer.layerId,
        glyphDir: defaultLayer.glyphDir,
        fileName: input.record.fileName,
        sourceHash,
        remoteBlobSha: input.remoteBlobSha,
        note: input.record.note,
        lib: input.record.lib,
      },
    },
    image: input.record.image
      ? {
          ...input.record.image,
          color: parseUfoColor(input.record.image.color),
        }
      : null,
  }

  return {
    ...(existingGlyph ?? {}),
    id: input.record.glyphName,
    name: existingGlyph?.name ?? input.record.glyphName,
    displayName: existingGlyph?.displayName ?? null,
    activeLayerId: canonicalLayerId,
    layerOrder: [
      canonicalLayerId,
      ...(existingGlyph?.layerOrder ?? []).filter(
        (layerId) => layerId !== canonicalLayerId
      ),
    ],
    layers: {
      ...(existingGlyph?.layers ?? {}),
      [canonicalLayerId]: layer,
    },
    unicodes: input.record.unicodes,
    production: existingGlyph?.production,
    export: existingGlyph?.export ?? true,
    sourceData: {
      ...existingGlyph?.sourceData,
      ufo: {
        ...asPlainRecord(existingGlyph?.sourceData?.ufo),
        fileName: input.record.fileName,
        sourceHash,
        remoteBlobSha: input.remoteBlobSha,
      },
    },
  }
}

const toSyncGlyphRecord = (input: {
  project: KumikoProjectRecord
  glyph: Pick<KumikoGlyphRecord, 'glyphId' | 'sourceData' | 'syncDirty'>
  activeUfoId: string
  fileName: string
}): SyncGlyphRecord => {
  const source = readGlyphUfoSource(input.glyph)
  return {
    glyphName: input.glyph.glyphId,
    fileName: input.fileName,
    dirty: input.glyph.syncDirty === 1,
    remoteBlobSha: source.remoteBlobSha ?? null,
  }
}

const buildMetadata = (
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
  return {
    projectId: project.projectId,
    ufoId: source.ufoId,
    relativePath: source.relativePath,
    metainfo: source.metainfo ?? {},
    fontinfo:
      source.fontinfoExtra ??
      buildUfoFontInfoFromProject(project, project.title || project.projectId),
    lib: buildUfoLibFromFontData(metadataFontData, source.libExtra),
    groups: source.groupsExtra ?? {},
    kerning: source.kerningExtra ?? {},
    featuresText: selectUfoFeatureText(metadataFontData),
    layers: source.layers,
    contents,
    glyphOrder:
      source.glyphOrder.length > 0 ? source.glyphOrder : project.glyphOrder,
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

  const glyphs = orderGlyphExportMetadata(
    project,
    await listKumikoGlyphMetadataForProject(projectId)
  )
  const glyphIds = glyphs.map((glyph) => glyph.glyphId)
  const glyphIdSet = new Set(glyphIds)
  const specialLayers = (
    await listKumikoGlyphSpecialLayerMetadataForProject(projectId)
  ).filter((layer) => glyphIdSet.has(layer.glyphId))
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
    return {
      source,
      metadata,
      defaultLayer,
      contents,
      glyphIds: entryGlyphIds,
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

export const prepareKumikoGitHubCommit = async (input: {
  projectId: string
  projectTitle: string
  activeUfoId: string
}): Promise<GitHubPreparedCommit> => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project?.githubSource) {
    throw new Error('目前專案不是從 GitHub 載入，無法提交到 GitHub')
  }

  const glyphMetadata = await listKumikoGlyphSyncMetadataForProject(
    input.projectId
  )
  const glyphExportMetadata = await listKumikoGlyphMetadataForProject(
    input.projectId
  )
  const dirtyGlyphIds = new Set(
    await listSyncDirtyKumikoGlyphIds(input.projectId)
  )
  const dirtyGlyphs = await loadKumikoGlyphRecords(
    [...dirtyGlyphIds].map((glyphId) =>
      makeKumikoGlyphKey(input.projectId, glyphId)
    )
  )
  const contents = makeContents(project, glyphMetadata, input.activeUfoId)
  const metadata = buildMetadata(
    project,
    input.activeUfoId,
    contents,
    glyphExportMetadata
  )
  const { source, defaultLayer } = getUfoSource(project, input.activeUfoId)
  const liveGlyphIds = new Set(glyphMetadata.map((glyph) => glyph.glyphId))
  const files: GitHubCommitFileInput[] = []
  const exportStateUpdates: GitHubPreparedCommit['exportStateUpdates'] = []

  for (const glyph of dirtyGlyphs) {
    const fileName = contents[glyph.glyphId]
    if (!fileName) {
      continue
    }
    const ufoGlyph = toUfoGlyphRecord({
      project,
      glyph,
      activeUfoId: input.activeUfoId,
      fileName,
    })
    const glifText = serializeGlifRecord(ufoGlyph)
    files.push({
      path: joinRepoPath(source.relativePath, defaultLayer.glyphDir, fileName),
      content: glifText,
    })
    exportStateUpdates.push({
      activeUfoId: input.activeUfoId,
      glyphId: glyph.glyphId,
      fileName,
      sourceHash: hashString(glifText),
      remoteBlobSha: await gitBlobShaFromText(glifText),
    })
  }

  for (const [glyphId, fileName] of Object.entries(source.contents)) {
    if (liveGlyphIds.has(glyphId)) {
      continue
    }
    files.push({
      path: joinRepoPath(source.relativePath, defaultLayer.glyphDir, fileName),
      deleted: true,
    })
  }

  if (project.syncDirty === 1 || files.length > 0) {
    files.push({
      path: joinRepoPath(
        source.relativePath,
        defaultLayer.glyphDir,
        'contents.plist'
      ),
      content: serializeXmlPlist(metadata.contents),
    })
  }

  if (files.length === 0) {
    throw new Error('目前沒有可提交到 GitHub 的變更')
  }

  const changedGlyphNames = [...dirtyGlyphIds]
  const titleSummary =
    changedGlyphNames.length > 0
      ? `Update ${changedGlyphNames.slice(0, 3).join(', ')}`
      : `Update ${input.projectTitle}`

  return {
    request: {
      repo: `${project.githubSource.owner}/${project.githubSource.repo}`,
      baseBranch: project.githubSource.defaultBranch,
      commitMessage: titleSummary,
      files,
    },
    changedGlyphNames,
    exportStateUpdates,
    syncTarget: { projectId: input.projectId },
  }
}

export const markKumikoGitHubCommitSynced = async (
  updates: GitHubPreparedCommit['exportStateUpdates'],
  commitTarget?: {
    projectId: string
    activeUfoId: string
    headOwner: string
    branchName: string
    commitSha: string
  }
) => {
  const projectId = commitTarget?.projectId
  if (!projectId) {
    return
  }
  const [project, glyphs] = await Promise.all([
    loadKumikoProjectRecord(projectId),
    listKumikoGlyphSyncMetadataForProject(projectId),
  ])
  if (!project) {
    return
  }

  const updateByGlyphId = new Map(
    updates.map((update) => [update.glyphId, update])
  )
  const activeUfoId = commitTarget.activeUfoId
  const { source } = getUfoSource(project, activeUfoId)
  const liveContents = Object.fromEntries(
    glyphs.map((glyph) => [
      glyph.glyphId,
      updateByGlyphId.get(glyph.glyphId)?.fileName ??
        glyph.sourceData?.ufo?.fileName ??
        source.contents[glyph.glyphId] ??
        `${glyph.glyphId}.glif`,
    ])
  )
  const timestamp = Date.now()
  const updatedGlyphIds = [...updateByGlyphId.keys()]
  for (
    let index = 0;
    index < updatedGlyphIds.length;
    index += UFO_STATE_MARK_BATCH_SIZE
  ) {
    const batchGlyphIds = updatedGlyphIds.slice(
      index,
      index + UFO_STATE_MARK_BATCH_SIZE
    )
    const updatedGlyphs = await loadKumikoGlyphRecords(
      batchGlyphIds.map((glyphId) => makeKumikoGlyphKey(projectId, glyphId))
    )
    await saveKumikoGlyphRecordBatch(
      updatedGlyphs.map((glyph) => {
        const update = updateByGlyphId.get(glyph.glyphId)
        if (!update) {
          return glyph
        }
        return {
          ...glyph,
          syncDirty: 0,
          exportDirty: 0,
          syncedDigest: update.sourceHash,
          exportedDigest: update.sourceHash,
          sourceData: {
            ...glyph.sourceData,
            ufo: {
              ...glyph.sourceData?.ufo,
              fileName: update.fileName,
              sourceHash: update.sourceHash,
              remoteBlobSha: update.remoteBlobSha,
            },
          },
          updatedAt: timestamp,
        }
      })
    )
  }

  await saveKumikoProjectRecord({
    ...project,
    syncDirty: 0,
    sourceData: {
      ...project.sourceData,
      ufo: project.sourceData?.ufo
        ? {
            ...project.sourceData.ufo,
            ufos: project.sourceData.ufo.ufos?.map((ufo) =>
              ufo.ufoId === activeUfoId
                ? {
                    ...ufo,
                    contents: liveContents,
                    glyphOrder: project.glyphOrder,
                  }
                : ufo
            ),
            lastSync: {
              owner: commitTarget.headOwner,
              repo: project.githubSource?.repo ?? commitTarget.headOwner,
              ref: commitTarget.branchName,
              commitSha: commitTarget.commitSha,
              syncedAt: timestamp,
            },
          }
        : project.sourceData?.ufo,
    },
    updatedAt: timestamp,
  })
}

export const markKumikoUfoExportClean = async (
  projectId: string,
  updates: KumikoUfoExportStateUpdate[]
) => {
  if (updates.length === 0) {
    return
  }
  const project = await loadKumikoProjectRecord(projectId)
  if (!project) {
    return
  }
  const updateByGlyphId = new Map(
    updates.map((update) => [update.glyphId, update])
  )
  const glyphIds = [...updateByGlyphId.keys()]
  const timestamp = Date.now()

  for (
    let index = 0;
    index < glyphIds.length;
    index += UFO_STATE_MARK_BATCH_SIZE
  ) {
    const batchGlyphIds = glyphIds.slice(
      index,
      index + UFO_STATE_MARK_BATCH_SIZE
    )
    const glyphs = await loadKumikoGlyphRecords(
      batchGlyphIds.map((glyphId) => makeKumikoGlyphKey(projectId, glyphId))
    )
    await saveKumikoGlyphRecordBatch(
      glyphs.map((glyph) => {
        const update = updateByGlyphId.get(glyph.glyphId)
        if (!update) {
          return glyph
        }
        return {
          ...glyph,
          exportDirty: 0,
          exportedDigest: update.sourceHash,
          sourceData: {
            ...glyph.sourceData,
            ufo: {
              ...glyph.sourceData?.ufo,
              fileName: update.fileName,
              sourceHash: update.sourceHash,
            },
          },
          updatedAt: timestamp,
        }
      })
    )
  }

  await saveKumikoProjectRecord({
    ...project,
    exportDirty: 0,
    updatedAt: timestamp,
  })
}

export const buildKumikoProjectSyncReport = async (input: {
  projectId: string
  activeUfoId: string
}): Promise<ProjectSyncReport | null> => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    return null
  }
  const target = resolveKumikoSyncTarget(project)
  if (!target) {
    return null
  }

  const glyphs = await listKumikoGlyphSyncMetadataForProject(input.projectId)
  const contents = makeContents(project, glyphs, input.activeUfoId)
  const { source, defaultLayer } = getUfoSource(project, input.activeUfoId)
  const remote = await fetchRemoteTree({
    repo: `${target.owner}/${target.repo}`,
    ref: target.ref,
  })
  const liveGlyphIds = new Set(glyphs.map((glyph) => glyph.glyphId))
  const locallyDeletedFiles = Object.fromEntries(
    Object.entries(source.contents).filter(
      ([glyphId]) => !liveGlyphIds.has(glyphId)
    )
  )

  const entries = computeGlyphSyncEntries({
    glyphs: glyphs.map((glyph) =>
      toSyncGlyphRecord({
        project,
        glyph,
        activeUfoId: input.activeUfoId,
        fileName: contents[glyph.glyphId] ?? `${glyph.glyphId}.glif`,
      })
    ),
    locallyDeletedFiles,
    glyphDirPath: joinRepoPath(source.relativePath, defaultLayer.glyphDir),
    remote,
  })

  return buildSyncReport({
    target: { owner: target.owner, repo: target.repo, ref: target.ref },
    remote,
    entries,
  })
}

export const applyKumikoRemoteSnapshot = async (input: {
  projectId: string
  activeUfoId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
}): Promise<ApplyRemoteResult> => {
  const resolutions = input.resolutions ?? {}
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    throw new Error('找不到專案資料，無法套用遠端更新')
  }
  const { source, defaultLayer } = getUfoSource(project, input.activeUfoId)
  const timestamp = Date.now()
  const snapshot = await fetchGitHubArchiveSnapshot({
    repo: `${input.report.target.owner}/${input.report.target.repo}`,
    ref: input.report.remoteHeadSha,
  })
  const parsedUfos = buildWorkspaceFileMapFromEntries(snapshot.ufoEntries)
  const remoteUfo =
    parsedUfos.find((ufo) => ufo.relativePath === source.relativePath) ?? null
  const affectedGlyphIds = [
    ...new Set(
      input.report.entries
        .map((entry) => entry.glyphName)
        .filter((glyphName): glyphName is string => Boolean(glyphName))
    ),
  ]
  const existingGlyphs = await loadKumikoGlyphRecords(
    affectedGlyphIds.map((glyphId) =>
      makeKumikoGlyphKey(input.projectId, glyphId)
    )
  )
  const existingById = new Map(
    existingGlyphs.map((glyph) => [glyph.glyphId, glyph])
  )
  const recordsToSave: KumikoGlyphRecord[] = []
  const keysToDelete: Array<[string, string]> = []
  const nextContents = { ...source.contents }
  const nextGlyphOrder = [...project.glyphOrder]
  let appliedCount = 0
  let remainingConflicts = 0

  const takeRemoteEntry = async (fileName: string) => {
    const text = remoteUfo?.files[`${defaultLayer.glyphDir}/${fileName}`]
    if (!text) {
      return false
    }
    const parsedGlyph = parseGlifText(text, fileName)
    const sourceHash = hashString(text)
    const remoteBlobSha = await gitBlobShaFromText(text)
    const glyphData = ufoGlyphToGlyphData({
      project,
      activeUfoId: input.activeUfoId,
      record: {
        ...parsedGlyph,
        projectId: input.projectId,
        ufoId: source.ufoId,
        layerId: defaultLayer.layerId,
        remoteBlobSha,
        dirty: false,
        dirtyIndex: 0,
        updatedAt: timestamp,
      },
      text,
      existing: existingById.get(parsedGlyph.glyphName),
      remoteBlobSha,
    })
    const record = glyphDataToKumikoGlyphRecord({
      projectId: input.projectId,
      glyph: glyphData,
      updatedAt: timestamp,
      exportDirty: false,
      syncDirty: false,
    })
    recordsToSave.push({
      ...record,
      exportedDigest: sourceHash,
      syncedDigest: sourceHash,
      layers: Object.fromEntries(
        Object.entries(record.layers).map(([layerId, layer]) => [
          layerId,
          {
            ...layer,
            outlineKind: deriveLayerOutlineKind(layer),
          },
        ])
      ),
    })
    nextContents[parsedGlyph.glyphName] = fileName
    if (!nextGlyphOrder.includes(parsedGlyph.glyphName)) {
      nextGlyphOrder.push(parsedGlyph.glyphName)
    }
    return true
  }

  for (const entry of input.report.entries) {
    switch (entry.status) {
      case 'remoteModified':
      case 'remoteAdded': {
        if (await takeRemoteEntry(entry.fileName)) {
          appliedCount += 1
        }
        break
      }
      case 'remoteDeleted': {
        if (entry.glyphName) {
          keysToDelete.push(
            makeKumikoGlyphKey(input.projectId, entry.glyphName)
          )
          delete nextContents[entry.glyphName]
          const orderIndex = nextGlyphOrder.indexOf(entry.glyphName)
          if (orderIndex >= 0) {
            nextGlyphOrder.splice(orderIndex, 1)
          }
          appliedCount += 1
        }
        break
      }
      case 'conflict': {
        const resolution = resolutions[entry.path]
        if (resolution === 'takeRemote') {
          if (entry.remoteSha === null && entry.glyphName) {
            keysToDelete.push(
              makeKumikoGlyphKey(input.projectId, entry.glyphName)
            )
            delete nextContents[entry.glyphName]
            appliedCount += 1
          } else if (await takeRemoteEntry(entry.fileName)) {
            appliedCount += 1
          }
        } else if (resolution === 'keepLocal' && entry.glyphName) {
          const existing = existingById.get(entry.glyphName)
          if (existing) {
            recordsToSave.push({
              ...existing,
              sourceData: {
                ...existing.sourceData,
                ufo: {
                  ...existing.sourceData?.ufo,
                  remoteBlobSha: entry.remoteSha,
                },
              },
              updatedAt: timestamp,
            })
            appliedCount += 1
          }
        } else {
          remainingConflicts += 1
        }
        break
      }
      default:
        break
    }
  }

  if (recordsToSave.length > 0) {
    await saveKumikoGlyphRecordBatch(recordsToSave)
  }
  if (keysToDelete.length > 0) {
    await deleteKumikoGlyphRecordBatch(keysToDelete)
  }

  await saveKumikoProjectRecord({
    ...project,
    glyphOrder: nextGlyphOrder,
    sourceData: {
      ...project.sourceData,
      ufo: project.sourceData?.ufo
        ? {
            ...project.sourceData.ufo,
            ufos: project.sourceData.ufo.ufos?.map((ufo) =>
              ufo.ufoId === source.ufoId
                ? {
                    ...ufo,
                    contents: nextContents,
                    glyphOrder: nextGlyphOrder,
                  }
                : ufo
            ),
            lastSync: {
              owner: input.report.target.owner,
              repo: input.report.target.repo,
              ref: input.report.target.ref,
              commitSha: input.report.remoteHeadSha,
              syncedAt: timestamp,
            },
          }
        : project.sourceData?.ufo,
    },
    updatedAt: timestamp,
  })

  return { appliedCount, remainingConflicts }
}
