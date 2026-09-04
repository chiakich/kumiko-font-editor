import { hashString } from '@/lib/hash'
import { gitBlobShaFromText } from '@/lib/github/sync/gitBlobSha'
import { buildUfoFontLevelFiles } from '@/lib/fontFormats/ufoFontLevelFiles'
import { buildGlyphCommitMessage } from '@/lib/github/sync/commitMessage'
import { joinRepoPath } from '@/lib/github/sync/computeSyncReport'
import {
  listKumikoGlyphMetadataForProject,
  listKumikoGlyphSyncMetadataForProject,
  listSyncDirtyKumikoGlyphIds,
  loadKumikoProjectRecord,
  loadKumikoGlyphRecords,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecordBatch,
  saveKumikoProjectRecord,
} from '@/lib/project/kumikoProjectPersistence'
import type { KumikoGlyphRecord } from '@/lib/project/kumikoProjectTypes'
import {
  serializeGlifRecord,
  serializeXmlPlist,
} from '@/lib/fontFormats/ufoFormat'
import {
  getUfoSource,
  listProjectUfoSources,
  makeContents,
  readGlyphUfoSource,
  resolveDesignspacePath,
  shouldSkipUfoKerningFiles,
} from '@/lib/github/sync/ufoExportSources'
import {
  buildKumikoUfoExportManifest,
  buildMetadata,
  type KumikoUfoExportStateUpdate,
} from '@/lib/github/sync/ufoExportManifest'
import { toUfoGlyphRecord } from '@/lib/github/sync/ufoGlyphRecords'

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

const UFO_STATE_MARK_BATCH_SIZE = 256

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
