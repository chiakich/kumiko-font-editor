import { hashString } from '@/lib/hash'
import { gitBlobShaFromText } from '@/lib/github/sync/gitBlobSha'
import type { ParsedUfoFolder } from '@/lib/fontFormats/ufoFormat'
import {
  buildUfoFontLevelFontData,
  buildWorkspaceFileMapFromEntries,
  parseGlifText,
  parseUfoMetadataFiles,
} from '@/lib/fontFormats/ufoFormat'
import { fetchGitHubArchiveSnapshot } from '@/lib/github/githubImport'
import type {
  ProjectSyncReport,
  SyncConflictResolution,
} from '@/lib/github/sync/types'
import {
  deleteKumikoGlyphRecordBatch,
  loadKumikoProjectRecord,
  loadKumikoGlyphRecords,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecordBatch,
  saveKumikoProjectRecord,
} from '@/lib/project/kumikoProjectPersistence'
import type { KumikoGlyphRecord } from '@/lib/project/kumikoProjectTypes'
import {
  parseUfoKerning,
  parseVerticalKerningLib,
} from '@/lib/fontFormats/ufoKerning'
import { KUMIKO_VERTICAL_KERNING_LIB_KEY } from '@/lib/fontFormats/fontInfoSettings'
import { glyphDataToKumikoGlyphRecord } from '@/lib/project/kumikoFontDataAdapter'
import {
  getUfoSource,
  listProjectUfoSources,
  type KumikoProjectUfoSource,
} from '@/lib/github/sync/ufoExportSources'
import { ufoGlyphToGlyphData } from '@/lib/github/sync/ufoGlyphRecords'

export interface ApplyRemoteResult {
  appliedCount: number
  remainingConflicts: number
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

  // Remote kerning.plist changes on non-default UFOs land in the per-master
  // pair sets, so the next push round-trips them instead of clobbering.
  const nextKerningPairsByMaster = { ...project.kerningPairsByMaster }
  const nextVerticalKerningPairsByMaster = {
    ...project.verticalKerningPairsByMaster,
  }
  let kerningByMasterChanged = false
  let verticalKerningByMasterChanged = false
  for (const [ufoId, remoteMetadata] of remoteFontLevelByUfoId) {
    for (const fontSource of Object.values(project.sources ?? {})) {
      if (fontSource.ufoId !== ufoId) {
        continue
      }
      if (
        remoteMetadata?.kerning &&
        project.kerningPairsByMaster?.[fontSource.id]
      ) {
        nextKerningPairsByMaster[fontSource.id] = parseUfoKerning(
          remoteMetadata.groups,
          remoteMetadata.kerning
        ).kerningPairs
        kerningByMasterChanged = true
      }
      // Only a remote lib that carries the key speaks about vertical kerning:
      // a UFO whose lib another tool rewrote must not wipe the local set.
      if (
        remoteMetadata?.lib &&
        KUMIKO_VERTICAL_KERNING_LIB_KEY in remoteMetadata.lib &&
        project.verticalKerningPairsByMaster?.[fontSource.id]
      ) {
        nextVerticalKerningPairsByMaster[fontSource.id] =
          parseVerticalKerningLib(
            remoteMetadata.lib[KUMIKO_VERTICAL_KERNING_LIB_KEY]
          )
        verticalKerningByMasterChanged = true
      }
    }
  }

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
          verticalKerningPairs: remoteFontData.verticalKerningPairs,
          openTypeFeatures: remoteFontData.openTypeFeatures,
          lineMetricsHorizontalLayout:
            remoteFontData.lineMetricsHorizontalLayout,
        }
      : {}),
    ...(kerningByMasterChanged
      ? { kerningPairsByMaster: nextKerningPairsByMaster }
      : {}),
    ...(verticalKerningByMasterChanged
      ? { verticalKerningPairsByMaster: nextVerticalKerningPairsByMaster }
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
