import type { FontData } from '@/domain'
import { parseDesignspace } from '@/lib/fontFormats/designspace'
import type { ProjectSourceFormat } from '@/lib/project/projectFormats'
import type { KumikoProjectSourceData } from '@/lib/project/kumikoProjectTypes'
import { gitBlobShaFromText } from '@/lib/github/sync/gitBlobSha'
import { UFO_FONT_LEVEL_FILE_NAMES } from '@/lib/fontFormats/ufoFileNames'
import { detectUfoTextStyle } from '@/lib/fontFormats/ufoTextStyle'
import { parseXmlPlist } from '@/lib/fontFormats/ufoPlist'
import { parseGlifText } from '@/lib/fontFormats/ufoGlif'
import {
  buildFontDataFromUfoGlyphs,
  isUfoBackgroundLayer,
  pickDefaultLayer,
} from '@/lib/fontFormats/ufoFontData'
import { buildMultiMasterFontData } from '@/lib/fontFormats/ufoMultiMaster'
import {
  basename,
  buildWorkspaceEntriesFromFiles,
  buildWorkspaceFileMapFromEntries,
  getProjectTitleFromFolder,
  pickDesignspaceEntry,
  type ParsedUfoFolder,
  type UfoWorkspaceEntry,
} from '@/lib/fontFormats/ufoWorkspace'
import type {
  UfoGithubSource,
  UfoGlyphRecord,
  UfoLayerRecord,
  UfoMetadataRecord,
  UfoProjectRecord,
} from '@/lib/fontFormats/ufoTypes'

// Re-exported so importers keep one entry point for the UFO format.
export { parseXmlPlist, serializeXmlPlist } from '@/lib/fontFormats/ufoPlist'
export {
  buildBoundsResolver,
  glyphRecordToLayerContent,
  parseGlifText,
  pathToUfoContour,
  serializeGlifRecord,
} from '@/lib/fontFormats/ufoGlif'
export {
  isUfoBackgroundLayer,
  pickDefaultLayer,
} from '@/lib/fontFormats/ufoFontData'
export {
  buildMultiMasterFontData,
  resolveDefaultSourceRef,
  resolveSourceRefs,
} from '@/lib/fontFormats/ufoMultiMaster'
export type { SourceRef } from '@/lib/fontFormats/ufoMultiMaster'
export {
  UFO_DESIGNSPACE_KEY,
  buildWorkspaceEntriesFromFiles,
  buildWorkspaceFileMapFromEntries,
  isDesignspaceFile,
  isRelevantUfoTextFile,
  listDesignspaceCandidates,
} from '@/lib/fontFormats/ufoWorkspace'
export type {
  DesignspaceCandidate,
  ParsedUfoFolder,
  UfoWorkspaceEntry,
} from '@/lib/fontFormats/ufoWorkspace'

export interface ImportedUfoWorkspace {
  project: UfoProjectRecord
  metadataRecords: UfoMetadataRecord[]
  glyphRecords: UfoGlyphRecord[]
  fontData: FontData
  projectMetadata: Record<string, unknown>
  projectSourceData: KumikoProjectSourceData
  projectSourceFormat: ProjectSourceFormat
}

export interface UfoImportSourceOptions {
  title: string
  sourceFolderName: string
  sourceType?: 'local' | 'github'
  githubSource?: UfoGithubSource | null
  designspacePath?: string | null
}

// Baseline the font-level files against what the repo actually holds, so the
// first sync report after an import compares like with like.
const computeUfoFontLevelBaselines = async (ufo: ParsedUfoFolder) => {
  const baselines: Record<string, string> = {}
  for (const name of UFO_FONT_LEVEL_FILE_NAMES) {
    const text = ufo.files[name]
    if (text === undefined) {
      continue
    }
    baselines[[ufo.relativePath, name].filter(Boolean).join('/')] =
      await gitBlobShaFromText(text)
  }
  return baselines
}

// Parses the font-level files of one .ufo folder into a metadata record. Shared
// by import and by GitHub pull so remote font-level state is read exactly the
// way an import would read it.
export const parseUfoMetadataFiles = (input: {
  projectId: string
  ufo: ParsedUfoFolder
  updatedAt: number
}): { metadata: UfoMetadataRecord; defaultLayer: UfoLayerRecord } => {
  const { projectId, ufo, updatedAt } = input
  const readPlist = (name: string) =>
    (ufo.files[name] ? parseXmlPlist(ufo.files[name]) : {}) as Record<
      string,
      unknown
    >

  const metainfo = readPlist('metainfo.plist')
  const fontinfo = readPlist('fontinfo.plist')
  const lib = readPlist('lib.plist')
  const groups = readPlist('groups.plist')
  const kerning = readPlist('kerning.plist')
  const featuresText = ufo.files['features.fea'] ?? null
  const layercontents = ufo.files['layercontents.plist']
    ? (parseXmlPlist(ufo.files['layercontents.plist']) as unknown[])
    : [['public.default', 'glyphs']]

  const layers: UfoLayerRecord[] = Array.isArray(layercontents)
    ? layercontents
        .map((entry) => (Array.isArray(entry) ? entry : null))
        .filter((entry): entry is unknown[] => Boolean(entry))
        .map((entry) => ({
          layerId: String(entry[0] ?? 'public.default'),
          glyphDir: String(entry[1] ?? 'glyphs'),
        }))
    : [{ layerId: 'public.default', glyphDir: 'glyphs' }]

  const baseRecord: UfoMetadataRecord = {
    projectId,
    ufoId: ufo.ufoId,
    relativePath: ufo.relativePath,
    metainfo,
    fontinfo,
    lib,
    groups,
    kerning,
    featuresText,
    layers,
    contents: {},
    glyphOrder: [],
    textStyle: detectUfoTextStyle({
      plist: ufo.files['fontinfo.plist'] ?? ufo.files['metainfo.plist'],
      glif: Object.entries(ufo.files).find(([name]) =>
        name.endsWith('.glif')
      )?.[1],
    }),
    updatedAt,
  }

  const defaultLayer = pickDefaultLayer(baseRecord)
  const contentsPath = `${defaultLayer.glyphDir}/contents.plist`
  const contents = (
    ufo.files[contentsPath] ? parseXmlPlist(ufo.files[contentsPath]) : {}
  ) as Record<string, string>
  const glyphOrder = Array.isArray(lib?.['public.glyphOrder'])
    ? (lib['public.glyphOrder'] as string[])
    : Object.keys(contents)

  return {
    metadata: { ...baseRecord, contents, glyphOrder },
    defaultLayer,
  }
}

// Font-level projection of a UFO metadata record: every project-level field a
// UFO carries, with no glyph data attached.
export const buildUfoFontLevelFontData = (metadata: UfoMetadataRecord) =>
  buildFontDataFromUfoGlyphs([], metadata)

export const importUfoWorkspaceEntries = async (
  entries: UfoWorkspaceEntry[],
  options: UfoImportSourceOptions
): Promise<ImportedUfoWorkspace> => {
  const parsedUfos = buildWorkspaceFileMapFromEntries(entries)
  if (parsedUfos.length === 0) {
    throw new Error('選到的資料夾裡沒有找到任何 .ufo')
  }

  const designspaceEntry = pickDesignspaceEntry(entries, {
    sourceFolderName: options.sourceFolderName,
    designspacePath: options.designspacePath,
  })
  if (options.designspacePath && !designspaceEntry) {
    throw new Error(`找不到指定的 designspace：${options.designspacePath}`)
  }
  const designspace = designspaceEntry
    ? parseDesignspace(designspaceEntry.text, designspaceEntry.relativePath)
    : null
  const designspaceLayerIdsByUfoBasename = new Map<string, Set<string>>()
  for (const source of designspace?.sources ?? []) {
    if (!source.layer) {
      continue
    }
    const key = basename(source.filename)
    const layerIds = designspaceLayerIdsByUfoBasename.get(key) ?? new Set()
    layerIds.add(source.layer)
    designspaceLayerIdsByUfoBasename.set(key, layerIds)
  }

  const projectId = `ufo-${Date.now()}`
  const title = options.title
  const activeUfoId = parsedUfos[0]?.ufoId ?? null
  const createdAt = Date.now()

  const metadataRecords: UfoMetadataRecord[] = []
  const glyphRecords: UfoGlyphRecord[] = []

  for (const ufo of parsedUfos) {
    const { metadata: metadataRecord, defaultLayer } = parseUfoMetadataFiles({
      projectId,
      ufo,
      updatedAt: createdAt,
    })
    const { layers, contents } = metadataRecord
    const designspaceLayerIds =
      designspaceLayerIdsByUfoBasename.get(basename(ufo.relativePath)) ??
      new Set<string>()

    metadataRecords.push(metadataRecord)

    for (const layer of layers) {
      const layerContents =
        layer.layerId === defaultLayer.layerId
          ? contents
          : ((ufo.files[`${layer.glyphDir}/contents.plist`]
              ? parseXmlPlist(ufo.files[`${layer.glyphDir}/contents.plist`])
              : {}) as Record<string, string>)

      if (
        layer.layerId !== defaultLayer.layerId &&
        !isUfoBackgroundLayer(layer, defaultLayer) &&
        !designspaceLayerIds.has(layer.layerId)
      ) {
        continue
      }

      for (const [, fileName] of Object.entries(layerContents)) {
        const glifText = ufo.files[`${layer.glyphDir}/${fileName}`]
        if (!glifText) {
          continue
        }
        const parsedGlyph = parseGlifText(glifText, fileName)
        glyphRecords.push({
          ...parsedGlyph,
          projectId,
          ufoId: ufo.ufoId,
          layerId: layer.layerId,
          remoteBlobSha:
            options.githubSource && layer.layerId === defaultLayer.layerId
              ? await gitBlobShaFromText(glifText)
              : null,
          dirty: false,
          dirtyIndex: 0,
          updatedAt: createdAt,
        })
      }
    }
  }

  const project: UfoProjectRecord = {
    projectId,
    title,
    sourceFolderName: options.sourceFolderName,
    ufoIds: parsedUfos.map((ufo) => ufo.ufoId),
    selectedUfoId: activeUfoId,
    createdAt,
    updatedAt: createdAt,
    sourceType: options.sourceType ?? 'local',
    githubSource: options.githubSource ?? null,
    lastSync: options.githubSource
      ? {
          owner: options.githubSource.owner,
          repo: options.githubSource.repo,
          ref: options.githubSource.ref,
          commitSha: options.githubSource.commitSha ?? null,
          syncedAt: createdAt,
        }
      : null,
  }

  const activeMetadata =
    metadataRecords.find((record) => record.ufoId === activeUfoId) ??
    metadataRecords[0]
  const activeLayer = activeMetadata
    ? pickDefaultLayer(activeMetadata)
    : { layerId: 'public.default', glyphDir: 'glyphs' }
  const activeGlyphs = glyphRecords.filter(
    (record) =>
      record.ufoId === activeUfoId && record.layerId === activeLayer.layerId
  )

  const fontData = designspace
    ? buildMultiMasterFontData(metadataRecords, glyphRecords, designspace)
    : activeMetadata
      ? buildFontDataFromUfoGlyphs(activeGlyphs, activeMetadata, glyphRecords)
      : { glyphs: {} }
  const projectMetadata = {
    activeUfoId,
    ufoIds: project.ufoIds,
    sourceType: project.sourceType ?? 'local',
    githubSource: project.githubSource ?? null,
    ufos: metadataRecords.map((record) => ({
      ufoId: record.ufoId,
      relativePath: record.relativePath,
      familyName: record.fontinfo?.familyName ?? record.ufoId,
      styleName: record.fontinfo?.styleName ?? null,
      layerIds: record.layers.map((layer) => layer.layerId),
    })),
    fontinfo: activeMetadata?.fontinfo ?? {},
    metainfo: activeMetadata?.metainfo ?? {},
  }

  const fontLevelBaselines = new Map<string, Record<string, string>>(
    await Promise.all(
      parsedUfos.map(
        async (ufo) =>
          [ufo.ufoId, await computeUfoFontLevelBaselines(ufo)] as const
      )
    )
  )

  const projectSourceData: KumikoProjectSourceData = {
    ufo: {
      designspace,
      designspacePath: designspaceEntry?.relativePath ?? null,
      ufos: metadataRecords.map((record) => ({
        ufoId: record.ufoId,
        relativePath: record.relativePath,
        defaultLayerId: pickDefaultLayer(record).layerId,
        layers: record.layers.map((layer) => ({
          layerId: layer.layerId,
          glyphDir: layer.glyphDir,
        })),
        contents: record.contents,
        glyphOrder: record.glyphOrder,
        metainfo: record.metainfo,
        fontinfoExtra: record.fontinfo,
        libExtra: record.lib,
        groupsExtra: record.groups,
        kerningExtra: record.kerning,
        textStyle: record.textStyle ?? null,
        remoteBlobShaByPath: fontLevelBaselines.get(record.ufoId) ?? {},
      })),
      lastSync: project.lastSync,
    },
  }

  return {
    project,
    metadataRecords,
    glyphRecords,
    fontData,
    projectMetadata,
    projectSourceData,
    projectSourceFormat: designspace ? 'designspace' : 'ufo',
  }
}

export const importUfoWorkspace = async (
  inputFiles: FileList | File[],
  options: { designspacePath?: string | null } = {}
): Promise<ImportedUfoWorkspace> => {
  const entries = await buildWorkspaceEntriesFromFiles(inputFiles)
  return importUfoWorkspaceEntries(entries, {
    title: getProjectTitleFromFolder(inputFiles),
    sourceFolderName: getProjectTitleFromFolder(inputFiles),
    sourceType: 'local',
    designspacePath: options.designspacePath,
  })
}
