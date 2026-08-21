import { hashString } from 'src/lib/hash'
import { gitBlobShaFromText } from 'src/lib/github/sync/gitBlobSha'
import { buildUfoFontLevelFiles } from 'src/lib/fontFormats/ufoFontLevelFiles'
import type { ParsedUfoFolder } from 'src/lib/fontFormats/ufoFormat'
import {
  buildUfoFontLevelFontData,
  parseUfoMetadataFiles,
} from 'src/lib/fontFormats/ufoFormat'
import { UFO_FONT_LEVEL_FILE_NAMES } from 'src/lib/fontFormats/ufoFileNames'
import { buildGlyphCommitMessage } from 'src/lib/github/sync/commitMessage'
import { createUfoFormatAdapter } from 'src/lib/fontFormats/formatAdapter/ufoFormatAdapter'
import {
  buildSyncReport,
  computeFontLevelSyncEntries,
  computeGlyphSyncEntries,
  joinRepoPath,
} from 'src/lib/github/sync/computeSyncReport'
import { fetchRemoteTree } from 'src/lib/github/sync/remoteTree'
import { fetchGitHubArchiveSnapshot } from 'src/lib/github/githubImport'
import type {
  GitHubSyncTarget,
  GlyphSyncEntry,
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'
import {
  deleteKumikoGlyphRecordBatch,
  listKumikoGlyphExportScanForProject,
  listKumikoGlyphMetadataForProject,
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
import { serializeUfoKerning } from 'src/lib/fontFormats/ufoKerning'
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
import type { FontData, GlyphData, GlyphLayerData } from 'src/store'

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
    glyphId: string
    // One .glif file name per master UFO this glyph was written to.
    fileNameByUfoId: Record<string, string>
    sourceHash: string | null
    // Git baseline per master, so a later report can compare each file.
    remoteBlobShaByUfoId: Record<string, string>
  }>
  // Git blob SHA of every font-level file as committed, keyed by repo path.
  fontLevelBlobShas: Record<string, string>
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
): Record<string, unknown> => ({
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

// `fontinfoExtra` preserves fields Kumiko does not edit, but it must not mask
// fields the user *does* edit. Keep the source's style name (Kumiko has no UI
// for it) while letting the canonical project settings replace their matching
// UFO fields.
const buildMergedUfoFontInfo = (
  project: KumikoProjectRecord,
  source: KumikoProjectUfoSource,
  fontInfoName: string
) => {
  const generated = buildUfoFontInfoFromProject(project, fontInfoName)
  if (!source.fontinfoExtra) {
    return generated
  }
  const { styleName, ...generatedWithoutStyleName } = generated
  return {
    ...source.fontinfoExtra,
    ...generatedWithoutStyleName,
    styleName: source.fontinfoExtra.styleName ?? styleName,
  }
}

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

// Kerning plists stay out of repos that never had them and still have no
// kerning data, so importing a plain UFO does not grow new files. Shared by the
// commit and report paths so the two can never disagree on the file set.
// The designspace lives beside the .ufo folders rather than inside one, so it is
// tracked as its own font-level path.
// Every UFO the project writes. Source-backed projects list them explicitly;
// projects without UFO source metadata get the generic single-UFO projection.
export const listProjectUfoSources = (
  project: KumikoProjectRecord
): KumikoProjectUfoSource[] => {
  const sources = project.sourceData?.ufo?.ufos
  return sources?.length
    ? sources
    : getGenericExportSources(project).map((entry) => entry.source)
}

// Reads a glyph's per-master git baseline, falling back to the pre-migration
// scalar so records written before the split still compare correctly.
const readGlyphBaselineFor = (
  glyph: Pick<KumikoGlyphRecord, 'sourceData'>,
  ufoId: string,
  primaryUfoId: string
): string | null => {
  const source = readGlyphUfoSource(glyph)
  const byUfoId = source.remoteBlobShaByUfoId ?? null
  if (byUfoId && ufoId in byUfoId) {
    return byUfoId[ufoId] ?? null
  }
  return ufoId === primaryUfoId ? (source.remoteBlobSha ?? null) : null
}

const resolveDesignspacePath = (
  project: KumikoProjectRecord
): string | null => {
  const hasDesignspace =
    project.sourceFormat === 'designspace' ||
    Boolean(project.sourceData?.ufo?.designspacePath)
  if (!hasDesignspace) {
    return null
  }
  return (
    project.sourceData?.ufo?.designspacePath ??
    `${project.title || project.projectId}.designspace`
  )
}

const shouldSkipUfoKerningFiles = (
  project: KumikoProjectRecord,
  source: KumikoProjectUfoSource
) => {
  const hasKerningData =
    (project.kerningGroups?.length ?? 0) > 0 ||
    (project.kerningPairs?.length ?? 0) > 0
  const hadKerningContent =
    Object.keys(source.groupsExtra ?? {}).length > 0 ||
    Object.keys(source.kerningExtra ?? {}).length > 0
  return !hasKerningData && !hadKerningContent
}

const listLocalUfoFontLevelFileNames = (
  project: KumikoProjectRecord,
  source: KumikoProjectUfoSource
): string[] => {
  const skipKerning = shouldSkipUfoKerningFiles(project, source)
  const hasFeatures =
    selectUfoFeatureText(makeProjectFontDataFromMetadata(project, [])) !== null
  return UFO_FONT_LEVEL_FILE_NAMES.filter((name) => {
    if (skipKerning && (name === 'groups.plist' || name === 'kerning.plist')) {
      return false
    }
    if (name === 'features.fea') {
      return hasFeatures
    }
    return true
  })
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

// Generic over the layer payload so the metadata-only scan can resolve the same
// layer the export would pick, without loading geometry.
const selectLayerForUfo = <T>(
  glyph: { layers: Record<string, T>; layerOrder: string[] },
  defaultLayerId: string
): T | undefined =>
  glyph.layers[defaultLayerId] ??
  glyph.layerOrder.map((layerId) => glyph.layers[layerId]).find(Boolean) ??
  Object.values(glyph.layers)[0]

type KumikoUfoLayerContent = Pick<
  KumikoGlyphLayerRecord,
  'paths' | 'componentRefs' | 'anchors' | 'guidelines' | 'metrics'
>

// The single rule for glyphId → .glif file name. Anything that needs to name a
// glyph file must go through here, or two call sites will derive different names
// for the same glyph and the difference reads as a rename.
export const makeContents = (
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
      identifier: anchor.identifier ?? null,
    })),
    guidelines: content.guidelines.map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
      name: guide.name ?? null,
      color: serializeUfoColor(guide.color),
      identifier: guide.identifier ?? null,
    })),
    contours: content.paths.map((path) => pathToUfoContour(path)),
    components: content.componentRefs.map((component) => {
      const matrix = getKumikoComponentRefMatrix(component)
      return {
        base: component.glyphId,
        identifier: component.identifier ?? null,
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
    glifStyle: layerSource.glifStyle ?? null,
    dirty: input.glyph.syncDirty === 1,
    dirtyIndex: input.glyph.syncDirty,
    updatedAt: input.glyph.updatedAt,
  }
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
  // Canonical project kerning wins; imported non-kerning groups survive.
  const ufoKerning = serializeUfoKerning(metadataFontData, {
    groups: source.groupsExtra,
  })
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
    lib: buildUfoLibFromFontData(metadataFontData, source.libExtra),
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

export const prepareKumikoGitHubCommit = async (input: {
  projectId: string
  projectTitle: string
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
  const liveGlyphIds = new Set(glyphMetadata.map((glyph) => glyph.glyphId))
  const files: GitHubCommitFileInput[] = []
  const fontLevelBlobShas: Record<string, string> = {}
  const blobShaByGlyphAndUfo = new Map<string, Record<string, string>>()
  const fileNameByGlyphAndUfo = new Map<string, Record<string, string>>()
  const sourceHashByGlyph = new Map<string, string>()

  // Every master gets its own .glif, so a dirty glyph is written once per UFO.
  for (const source of listProjectUfoSources(project)) {
    const filesBeforeSource = files.length
    const contents = makeContents(project, glyphMetadata, source.ufoId, source)
    const metadata = buildMetadata(
      project,
      source.ufoId,
      contents,
      glyphExportMetadata,
      source
    )
    const { defaultLayer } = getUfoSource(project, source.ufoId, source)

    for (const glyph of dirtyGlyphs) {
      const fileName = contents[glyph.glyphId]
      if (!fileName) {
        continue
      }
      const ufoGlyph = toUfoGlyphRecord({
        project,
        glyph,
        activeUfoId: source.ufoId,
        source,
        fileName,
      })
      const glifText = serializeGlifRecord(ufoGlyph, metadata.textStyle)
      files.push({
        path: joinRepoPath(
          source.relativePath,
          defaultLayer.glyphDir,
          fileName
        ),
        content: glifText,
      })
      blobShaByGlyphAndUfo.set(glyph.glyphId, {
        ...blobShaByGlyphAndUfo.get(glyph.glyphId),
        [source.ufoId]: await gitBlobShaFromText(glifText),
      })
      fileNameByGlyphAndUfo.set(glyph.glyphId, {
        ...fileNameByGlyphAndUfo.get(glyph.glyphId),
        [source.ufoId]: fileName,
      })
      // The export digest tracks the primary projection only.
      if (!sourceHashByGlyph.has(glyph.glyphId)) {
        sourceHashByGlyph.set(glyph.glyphId, hashString(glifText))
      }
    }

    for (const [glyphId, fileName] of Object.entries(source.contents)) {
      if (liveGlyphIds.has(glyphId)) {
        continue
      }
      files.push({
        path: joinRepoPath(
          source.relativePath,
          defaultLayer.glyphDir,
          fileName
        ),
        deleted: true,
      })
    }

    // Only when this UFO itself gained or lost glyph files, not when a sibling
    // master did.
    if (project.syncDirty === 1 || files.length > filesBeforeSource) {
      files.push({
        path: joinRepoPath(
          source.relativePath,
          defaultLayer.glyphDir,
          'contents.plist'
        ),
        content: serializeXmlPlist(metadata.contents, metadata.textStyle),
      })
    }

    // Font-level files ride on the project-level dirty flag only. Editing
    // glyphs must not reformat plists the repo already has.
    if (project.syncDirty === 1) {
      const baseline = source.remoteBlobShaByPath ?? {}
      const skipKerning = shouldSkipUfoKerningFiles(project, source)

      for (const file of buildUfoFontLevelFiles(metadata)) {
        if (
          skipKerning &&
          (file.path === 'groups.plist' || file.path === 'kerning.plist')
        ) {
          continue
        }
        const path = joinRepoPath(source.relativePath, file.path)
        const blobSha = await gitBlobShaFromText(file.text)
        fontLevelBlobShas[path] = blobSha
        // A matching baseline means the remote already has this exact content;
        // skipping it keeps commits free of no-op font-level churn.
        if (baseline[path] === blobSha) {
          continue
        }
        files.push({ path, content: file.text })
      }
    }
  }

  if (project.syncDirty === 1 && resolveDesignspacePath(project)) {
    const manifest = await buildKumikoUfoExportManifest(input.projectId)
    if (manifest.designspace) {
      const blobSha = await gitBlobShaFromText(manifest.designspace.text)
      const baseline =
        listProjectUfoSources(project)[0]?.remoteBlobShaByPath ?? {}
      fontLevelBlobShas[manifest.designspace.relativePath] = blobSha
      if (baseline[manifest.designspace.relativePath] !== blobSha) {
        files.push({
          path: manifest.designspace.relativePath,
          content: manifest.designspace.text,
        })
      }
    }
  }

  if (files.length === 0) {
    throw new Error('目前沒有可提交到 GitHub 的變更')
  }

  const exportStateUpdates: GitHubPreparedCommit['exportStateUpdates'] = [
    ...blobShaByGlyphAndUfo.keys(),
  ].map((glyphId) => ({
    glyphId,
    fileNameByUfoId: fileNameByGlyphAndUfo.get(glyphId) ?? {},
    sourceHash: sourceHashByGlyph.get(glyphId) ?? null,
    remoteBlobShaByUfoId: blobShaByGlyphAndUfo.get(glyphId) ?? {},
  }))

  const changedGlyphNames = [...dirtyGlyphIds]
  // A glyph with no recorded remote baseline has never been pushed, so it reads
  // as an addition rather than an edit.
  const isNewOnRemote = (glyph: KumikoGlyphRecord) => {
    const source = readGlyphUfoSource(glyph)
    return (
      !source.remoteBlobSha &&
      Object.keys(source.remoteBlobShaByUfoId ?? {}).length === 0
    )
  }
  const titleSummary = buildGlyphCommitMessage({
    added: dirtyGlyphs.filter(isNewOnRemote).map((glyph) => ({
      glyphName: glyph.glyphId,
      unicodes: glyph.unicodes,
    })),
    updated: dirtyGlyphs
      .filter((glyph) => !isNewOnRemote(glyph))
      .map((glyph) => ({ glyphName: glyph.glyphId, unicodes: glyph.unicodes })),
    fallbackTitle: input.projectTitle,
  })

  return {
    request: {
      repo: `${project.githubSource.owner}/${project.githubSource.repo}`,
      baseBranch: project.githubSource.defaultBranch,
      commitMessage: titleSummary,
      files,
    },
    changedGlyphNames,
    exportStateUpdates,
    fontLevelBlobShas,
    syncTarget: { projectId: input.projectId },
  }
}

export const markKumikoGitHubCommitSynced = async (
  updates: GitHubPreparedCommit['exportStateUpdates'],
  commitTarget?: {
    projectId: string
    headOwner: string
    branchName: string
    commitSha: string
    fontLevelBlobShas?: Record<string, string>
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
        const primaryUfoId = Object.keys(update.fileNameByUfoId)[0] ?? null
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
              fileName: primaryUfoId
                ? update.fileNameByUfoId[primaryUfoId]
                : glyph.sourceData?.ufo?.fileName,
              sourceHash: update.sourceHash,
              // The scalar baseline is retired once the per-master map exists.
              remoteBlobSha: null,
              remoteBlobShaByUfoId: {
                ...glyph.sourceData?.ufo?.remoteBlobShaByUfoId,
                ...update.remoteBlobShaByUfoId,
              },
            },
          },
          updatedAt: timestamp,
        }
      })
    )
  }

  const liveContentsFor = (ufoId: string) =>
    Object.fromEntries(
      glyphs.map((glyph) => [
        glyph.glyphId,
        updateByGlyphId.get(glyph.glyphId)?.fileNameByUfoId[ufoId] ??
          glyph.sourceData?.ufo?.fileName ??
          project.sourceData?.ufo?.ufos?.find((ufo) => ufo.ufoId === ufoId)
            ?.contents[glyph.glyphId] ??
          `${glyph.glyphId}.glif`,
      ])
    )

  await saveKumikoProjectRecord({
    ...project,
    syncDirty: 0,
    sourceData: {
      ...project.sourceData,
      ufo: project.sourceData?.ufo
        ? {
            ...project.sourceData.ufo,
            ufos: project.sourceData.ufo.ufos?.map((ufo) => ({
              ...ufo,
              contents: liveContentsFor(ufo.ufoId),
              glyphOrder: project.glyphOrder,
              remoteBlobShaByPath: {
                ...ufo.remoteBlobShaByPath,
                ...commitTarget.fontLevelBlobShas,
              },
            })),
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
  const remote = await fetchRemoteTree({
    repo: `${target.owner}/${target.repo}`,
    ref: target.ref,
  })
  const liveGlyphIds = new Set(glyphs.map((glyph) => glyph.glyphId))
  const designspacePath = resolveDesignspacePath(project)
  const ufoSources = listProjectUfoSources(project)
  const primaryUfoId = ufoSources[0]?.ufoId ?? ''
  const entries: GlyphSyncEntry[] = []

  for (const source of ufoSources) {
    const contents = makeContents(project, glyphs, source.ufoId, source)
    const { defaultLayer } = getUfoSource(project, source.ufoId, source)
    const adapter = createUfoFormatAdapter({
      relativePath: source.relativePath,
      glyphDir: defaultLayer.glyphDir,
      designspacePath,
      contents,
    })
    const locallyDeletedFiles = Object.fromEntries(
      Object.entries(source.contents).filter(
        ([glyphId]) => !liveGlyphIds.has(glyphId)
      )
    )

    entries.push(
      ...computeGlyphSyncEntries({
        glyphs: glyphs.map((glyph) => {
          const fileName = contents[glyph.glyphId] ?? `${glyph.glyphId}.glif`
          const path = joinRepoPath(
            source.relativePath,
            defaultLayer.glyphDir,
            fileName
          )
          const baseline = readGlyphBaselineFor(
            glyph,
            source.ufoId,
            primaryUfoId
          )
          return {
            glyphName: glyph.glyphId,
            fileName,
            dirty: glyph.syncDirty === 1,
            // Records written before baselines went per-master have nothing to
            // compare on secondary masters. Adopting the remote SHA keeps the
            // first report after the upgrade from proposing a pull that would
            // overwrite local layers; the next commit writes a real baseline.
            remoteBlobSha:
              baseline ??
              (source.ufoId === primaryUfoId
                ? null
                : (remote.blobShaByPath.get(path) ?? null)),
          }
        }),
        locallyDeletedFiles,
        glyphDirPath: joinRepoPath(source.relativePath, defaultLayer.glyphDir),
        adapter,
        remote,
      })
    )

    const localFontLevelNames = listLocalUfoFontLevelFileNames(project, source)
    entries.push(
      ...computeFontLevelSyncEntries({
        candidatePaths: UFO_FONT_LEVEL_FILE_NAMES.map((name) =>
          joinRepoPath(source.relativePath, name)
        ),
        localPaths: new Set(
          localFontLevelNames.map((name) =>
            joinRepoPath(source.relativePath, name)
          )
        ),
        dirty: project.syncDirty === 1,
        baseline: source.remoteBlobShaByPath ?? {},
        remote,
      })
    )
  }

  // The designspace sits outside every .ufo, so it is tracked once.
  if (designspacePath) {
    entries.push(
      ...computeFontLevelSyncEntries({
        candidatePaths: [designspacePath],
        localPaths: new Set([designspacePath]),
        dirty: project.syncDirty === 1,
        baseline: ufoSources[0]?.remoteBlobShaByPath ?? {},
        remote,
      })
    )
  }

  return buildSyncReport({
    target: { owner: target.owner, repo: target.repo, ref: target.ref },
    remote,
    entries,
  })
}

export const applyKumikoRemoteSnapshot = async (input: {
  projectId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
  // Lets the git transport supply the remote tree from a fetched commit instead
  // of downloading an archive. Same shape either way, so everything downstream
  // of here is shared between the two transports.
  remoteUfos?: ParsedUfoFolder[]
}): Promise<ApplyRemoteResult> => {
  const resolutions = input.resolutions ?? {}
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    throw new Error('找不到專案資料，無法套用遠端更新')
  }
  const ufoSources = listProjectUfoSources(project)
  const primarySource = ufoSources[0]
  if (!primarySource) {
    throw new Error('專案沒有可同步的 UFO 來源')
  }
  const timestamp = Date.now()
  const parsedUfos =
    input.remoteUfos ??
    buildWorkspaceFileMapFromEntries(
      (
        await fetchGitHubArchiveSnapshot({
          repo: `${input.report.target.owner}/${input.report.target.repo}`,
          ref: input.report.remoteHeadSha,
        })
      ).ufoEntries
    )
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
  // Keyed so a glyph touched in several masters merges into one record rather
  // than the last master overwriting the others.
  const recordsToSave = new Map<string, KumikoGlyphRecord>()
  const keysToDelete: Array<[string, string]> = []
  const nextContentsByUfoId = new Map<string, Record<string, string>>(
    ufoSources.map((entry) => [entry.ufoId, { ...entry.contents }])
  )
  const nextGlyphOrder = [...project.glyphOrder]
  let appliedCount = 0
  let remainingConflicts = 0

  const takeRemoteEntry = async (
    source: KumikoProjectUfoSource,
    fileName: string
  ) => {
    const { defaultLayer } = getUfoSource(project, source.ufoId, source)
    const remoteUfo =
      parsedUfos.find((ufo) => ufo.relativePath === source.relativePath) ?? null
    const text = remoteUfo?.files[`${defaultLayer.glyphDir}/${fileName}`]
    if (!text) {
      return false
    }
    const parsedGlyph = parseGlifText(text, fileName)
    const sourceHash = hashString(text)
    const remoteBlobSha = await gitBlobShaFromText(text)
    const existing =
      recordsToSave.get(parsedGlyph.glyphName) ??
      existingById.get(parsedGlyph.glyphName)
    const glyphData = ufoGlyphToGlyphData({
      project,
      activeUfoId: source.ufoId,
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
      existing,
      remoteBlobSha,
    })
    const record = glyphDataToKumikoGlyphRecord({
      projectId: input.projectId,
      glyph: glyphData,
      updatedAt: timestamp,
      exportDirty: false,
      syncDirty: false,
      projectOutlineType: project.settings?.outlineType,
    })
    recordsToSave.set(parsedGlyph.glyphName, {
      ...record,
      exportedDigest: sourceHash,
      syncedDigest: sourceHash,
      sourceData: {
        ...record.sourceData,
        ufo: {
          ...record.sourceData?.ufo,
          remoteBlobSha: null,
          remoteBlobShaByUfoId: {
            ...existing?.sourceData?.ufo?.remoteBlobShaByUfoId,
            [source.ufoId]: remoteBlobSha,
          },
        },
      },
    })
    const contents = nextContentsByUfoId.get(source.ufoId)
    if (contents) {
      contents[parsedGlyph.glyphName] = fileName
    }
    if (!nextGlyphOrder.includes(parsedGlyph.glyphName)) {
      nextGlyphOrder.push(parsedGlyph.glyphName)
    }
    return true
  }

  // Maps a report entry back to the UFO that owns its path.
  const sourceForPath = (path: string) =>
    ufoSources.find((entry) => path.startsWith(`${entry.relativePath}/`)) ??
    primarySource

  const fontLevelEntries = input.report.entries.filter(
    (entry) => entry.kind === 'font'
  )
  const appliedFontLevelShas: Record<string, string> = {}
  let applyFontLevel = false
  for (const entry of fontLevelEntries) {
    const takeRemote =
      entry.status === 'remoteModified' ||
      entry.status === 'remoteAdded' ||
      (entry.status === 'conflict' && resolutions[entry.path] === 'takeRemote')
    if (entry.status === 'conflict' && resolutions[entry.path] === undefined) {
      remainingConflicts += 1
      continue
    }
    if (
      entry.status === 'conflict' &&
      resolutions[entry.path] === 'keepLocal'
    ) {
      // Re-baseline so the next report compares against what the remote holds.
      if (entry.remoteSha) {
        appliedFontLevelShas[entry.path] = entry.remoteSha
      }
      appliedCount += 1
      continue
    }
    if (!takeRemote || !entry.remoteSha) {
      continue
    }
    applyFontLevel = true
    appliedFontLevelShas[entry.path] = entry.remoteSha
    appliedCount += 1
  }

  // A glyph is only gone once every master dropped it.
  const remoteDeletedCount = new Map<string, number>()
  const countRemoteDeleted = (
    glyphName: string,
    source: KumikoProjectUfoSource
  ) => {
    const next = (remoteDeletedCount.get(glyphName) ?? 0) + 1
    remoteDeletedCount.set(glyphName, next)
    delete nextContentsByUfoId.get(source.ufoId)?.[glyphName]
    return next === ufoSources.length
  }

  for (const entry of input.report.entries) {
    if (entry.kind === 'font') {
      continue
    }
    const source = sourceForPath(entry.path)
    switch (entry.status) {
      case 'remoteModified':
      case 'remoteAdded': {
        if (await takeRemoteEntry(source, entry.fileName)) {
          appliedCount += 1
        }
        break
      }
      case 'remoteDeleted': {
        if (entry.glyphName && countRemoteDeleted(entry.glyphName, source)) {
          keysToDelete.push(
            makeKumikoGlyphKey(input.projectId, entry.glyphName)
          )
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
            if (countRemoteDeleted(entry.glyphName, source)) {
              keysToDelete.push(
                makeKumikoGlyphKey(input.projectId, entry.glyphName)
              )
            }
            appliedCount += 1
          } else if (await takeRemoteEntry(source, entry.fileName)) {
            appliedCount += 1
          }
        } else if (resolution === 'keepLocal' && entry.glyphName) {
          const existing =
            recordsToSave.get(entry.glyphName) ??
            existingById.get(entry.glyphName)
          if (existing && entry.remoteSha) {
            // Re-baseline this master so the next report sees it as settled.
            recordsToSave.set(entry.glyphName, {
              ...existing,
              sourceData: {
                ...existing.sourceData,
                ufo: {
                  ...existing.sourceData?.ufo,
                  remoteBlobShaByUfoId: {
                    ...existing.sourceData?.ufo?.remoteBlobShaByUfoId,
                    [source.ufoId]: entry.remoteSha,
                  },
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

  if (recordsToSave.size > 0) {
    await saveKumikoGlyphRecordBatch([...recordsToSave.values()])
  }
  if (keysToDelete.length > 0) {
    await deleteKumikoGlyphRecordBatch(keysToDelete)
  }

  // Re-read each remote UFO through the import parser so pulled font-level
  // state lands in canonical fields exactly the way an import would put it.
  const remoteFontLevelByUfoId = new Map(
    applyFontLevel
      ? ufoSources.flatMap((entry) => {
          const remoteUfo = parsedUfos.find(
            (ufo) => ufo.relativePath === entry.relativePath
          )
          if (!remoteUfo) {
            return []
          }
          return [
            [
              entry.ufoId,
              parseUfoMetadataFiles({
                projectId: input.projectId,
                ufo: remoteUfo,
                updatedAt: timestamp,
              }).metadata,
            ] as const,
          ]
        })
      : []
  )
  // Project-level fields come from the primary master; the others contribute
  // their own round-trip stores below.
  const remoteFontLevel =
    remoteFontLevelByUfoId.get(primarySource.ufoId) ?? null
  const remoteFontData = remoteFontLevel
    ? buildUfoFontLevelFontData(remoteFontLevel)
    : null

  await saveKumikoProjectRecord({
    ...project,
    ...(remoteFontData
      ? {
          fontInfo: remoteFontData.fontInfo,
          unitsPerEm: remoteFontData.unitsPerEm,
          axes: remoteFontData.axes,
          settings: remoteFontData.settings,
          kerningGroups: remoteFontData.kerningGroups,
          kerningPairs: remoteFontData.kerningPairs,
          openTypeFeatures: remoteFontData.openTypeFeatures,
          lineMetricsHorizontalLayout:
            remoteFontData.lineMetricsHorizontalLayout,
        }
      : {}),
    glyphOrder: nextGlyphOrder,
    sourceData: {
      ...project.sourceData,
      ufo: project.sourceData?.ufo
        ? {
            ...project.sourceData.ufo,
            ufos: project.sourceData.ufo.ufos?.map((ufo) => {
              const remoteMetadata = remoteFontLevelByUfoId.get(ufo.ufoId)
              return {
                ...ufo,
                contents: nextContentsByUfoId.get(ufo.ufoId) ?? ufo.contents,
                glyphOrder: nextGlyphOrder,
                ...(remoteMetadata
                  ? {
                      metainfo: remoteMetadata.metainfo,
                      fontinfoExtra: remoteMetadata.fontinfo,
                      libExtra: remoteMetadata.lib,
                      groupsExtra: remoteMetadata.groups,
                      kerningExtra: remoteMetadata.kerning,
                    }
                  : {}),
                remoteBlobShaByPath: {
                  ...ufo.remoteBlobShaByPath,
                  ...appliedFontLevelShas,
                },
              }
            }),
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
