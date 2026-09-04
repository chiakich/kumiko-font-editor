import { UFO_FONT_LEVEL_FILE_NAMES } from '@/lib/fontFormats/ufoFileNames'
import type { GitHubSyncTarget } from '@/lib/github/sync/types'
import type {
  KumikoGlyphLayerRecord,
  KumikoGlyphMetadataRecord,
  KumikoGlyphRecord,
  KumikoProjectRecord,
} from '@/lib/project/kumikoProjectTypes'
import type { DesignspaceSourceOut } from '@/lib/fontFormats/designspace'
import { fontInfoToUfoFontInfo } from '@/lib/fontFormats/fontInfoSettings'
import { selectUfoFeatureText } from '@/lib/openTypeFeatures'
import { userNameToFileName } from '@/lib/fontFormats/ufoFileNames'
import type { UfoLayerRecord } from '@/lib/fontFormats/ufoTypes'
import { kumikoGlyphRecordToGlyphMetadata } from '@/lib/project/kumikoFontDataAdapter'
import type { FontData } from '@/domain'

const GENERIC_UFO_ID = 'font-export'
export const DEFAULT_UFO_LAYER_ID = 'public.default'
export const DEFAULT_UFO_GLYPH_DIR = 'glyphs'

export type KumikoProjectUfoSource = NonNullable<
  NonNullable<NonNullable<KumikoProjectRecord['sourceData']>['ufo']>['ufos']
>[number]

export const makeProjectFontDataFromMetadata = (
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
  kerningPairsByMaster: project.kerningPairsByMaster,
  verticalKerningPairs: project.verticalKerningPairs,
  verticalKerningPairsByMaster: project.verticalKerningPairsByMaster,
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
export const buildMergedUfoFontInfo = (
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

export const makeUniqueUfoDir = (
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

export const getGenericExportSources = (
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

export const getProjectDesignspaceSource = (
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

export const getCanonicalLayerIdForUfo = (
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

export const getUfoSource = (
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
export const readGlyphBaselineFor = (
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

export const resolveDesignspacePath = (
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

// The kerning pairs a given UFO package should carry: the source (master)
// that came from this UFO keeps its own set; the default UFO (no by-master
// entry) carries the canonical pairs.
const resolveUfoPairsForOrientation = (
  project: KumikoProjectRecord,
  ufoId: string,
  orientation: 'horizontal' | 'vertical'
) => {
  const byMaster =
    orientation === 'vertical'
      ? project.verticalKerningPairsByMaster
      : project.kerningPairsByMaster
  const sources = Object.values(project.sources ?? {})
  const ownEntry = sources.find(
    (fontSource) => fontSource.ufoId === ufoId && byMaster?.[fontSource.id]
  )
  if (ownEntry && byMaster) {
    return byMaster[ownEntry.id]
  }
  // A non-default master (identified by its horizontal entry) must not inherit
  // the canonical set: projects saved before an orientation existed have no
  // entry for it, and writing the default master's pairs into every UFO is
  // exactly the clobbering per-master data exists to prevent.
  const isNonDefaultMaster = sources.some(
    (fontSource) =>
      fontSource.ufoId === ufoId &&
      project.kerningPairsByMaster?.[fontSource.id]
  )
  if (isNonDefaultMaster) {
    return []
  }
  return orientation === 'vertical'
    ? project.verticalKerningPairs
    : project.kerningPairs
}

export const resolveUfoKerningPairs = (
  project: KumikoProjectRecord,
  ufoId: string
) => resolveUfoPairsForOrientation(project, ufoId, 'horizontal')

export const resolveUfoVerticalKerningPairs = (
  project: KumikoProjectRecord,
  ufoId: string
) => resolveUfoPairsForOrientation(project, ufoId, 'vertical')

export const shouldSkipUfoKerningFiles = (
  project: KumikoProjectRecord,
  source: KumikoProjectUfoSource
) => {
  const hasKerningData =
    (project.kerningGroups?.length ?? 0) > 0 ||
    (resolveUfoKerningPairs(project, source.ufoId)?.length ?? 0) > 0
  const hadKerningContent =
    Object.keys(source.groupsExtra ?? {}).length > 0 ||
    Object.keys(source.kerningExtra ?? {}).length > 0
  return !hasKerningData && !hadKerningContent
}

export const listLocalUfoFontLevelFileNames = (
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

export const readGlyphUfoSource = (
  glyph: Pick<KumikoGlyphRecord, 'sourceData'>
) => glyph.sourceData?.ufo ?? {}

export const readLayerUfoSource = (layer: KumikoGlyphLayerRecord | undefined) =>
  layer?.sourceData?.ufo ?? {}

// Generic over the layer payload so the metadata-only scan can resolve the same
// layer the export would pick, without loading geometry.
export const selectLayerForUfo = <T>(
  glyph: { layers: Record<string, T>; layerOrder: string[] },
  defaultLayerId: string
): T | undefined =>
  glyph.layers[defaultLayerId] ??
  glyph.layerOrder.map((layerId) => glyph.layers[layerId]).find(Boolean) ??
  Object.values(glyph.layers)[0]

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
