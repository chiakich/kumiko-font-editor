import { hashString } from 'src/lib/hash'
import { gitBlobShaFromText } from 'src/lib/github/sync/gitBlobSha'
import {
  buildSyncReport,
  computeGlyphSyncEntries,
  joinRepoPath,
  type SyncGlyphRecord,
} from 'src/lib/github/sync/computeSyncReport'
import { fetchRemoteTree } from 'src/lib/github/sync/remoteTree'
import type {
  GitHubSyncTarget,
  ProjectSyncReport,
} from 'src/lib/github/sync/types'
import {
  listKumikoGlyphRecordsForProject,
  listSyncDirtyKumikoGlyphRecords,
  loadKumikoProjectRecord,
  saveKumikoGlyphRecordBatch,
  saveKumikoProjectRecord,
} from 'src/lib/project/kumikoProjectPersistence'
import type {
  KumikoGlyphLayerRecord,
  KumikoGlyphRecord,
  KumikoProjectRecord,
} from 'src/lib/project/kumikoProjectTypes'
import { userNameToFileName } from 'src/lib/fontFormats/ufoFileNames'
import {
  pathToUfoContour,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontFormats/ufoFormat'
import type {
  UfoGlyphRecord,
  UfoLayerRecord,
  UfoMetadataRecord,
} from 'src/lib/fontFormats/ufoTypes'
import { getComponentMatrix } from 'src/lib/components/componentTransform'

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

const getUfoSource = (project: KumikoProjectRecord, activeUfoId: string) => {
  const source = project.sourceData?.ufo?.ufos?.find(
    (candidate) => candidate.ufoId === activeUfoId
  )
  if (!source) {
    throw new Error('找不到目前 UFO 的 metadata')
  }
  const defaultLayer =
    source.layers.find((layer) => layer.layerId === source.defaultLayerId) ??
    source.layers[0] ??
    ({ layerId: 'public.default', glyphDir: 'glyphs' } satisfies UfoLayerRecord)
  return { source, defaultLayer }
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

const readGlyphUfoSource = (glyph: KumikoGlyphRecord) =>
  glyph.sourceData?.ufo ?? {}

const readLayerUfoSource = (layer: KumikoGlyphLayerRecord | undefined) =>
  layer?.sourceData?.ufo ?? {}

const selectLayerForUfo = (glyph: KumikoGlyphRecord, defaultLayerId: string) =>
  glyph.layers[defaultLayerId] ??
  glyph.layerOrder.map((layerId) => glyph.layers[layerId]).find(Boolean) ??
  Object.values(glyph.layers)[0]

const makeContents = (
  project: KumikoProjectRecord,
  glyphs: KumikoGlyphRecord[],
  activeUfoId: string
) => {
  const { source } = getUfoSource(project, activeUfoId)
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

const toUfoGlyphRecord = (input: {
  project: KumikoProjectRecord
  glyph: KumikoGlyphRecord
  activeUfoId: string
  fileName: string
}): UfoGlyphRecord => {
  const { source, defaultLayer } = getUfoSource(
    input.project,
    input.activeUfoId
  )
  const layer = selectLayerForUfo(input.glyph, source.defaultLayerId)
  if (!layer) {
    throw new Error(`字圖 ${input.glyph.glyphId} 沒有可寫入 UFO 的 layer`)
  }
  const glyphSource = readGlyphUfoSource(input.glyph)
  const layerSource = readLayerUfoSource(layer)

  return {
    projectId: input.project.projectId,
    ufoId: source.ufoId,
    layerId: defaultLayer.layerId,
    glyphName: input.glyph.glyphId,
    fileName: input.fileName,
    sourceHash: glyphSource.sourceHash ?? layerSource.sourceHash ?? null,
    remoteBlobSha:
      glyphSource.remoteBlobSha ?? layerSource.remoteBlobSha ?? null,
    unicodes: input.glyph.unicodes,
    advance: {
      width: layer.metrics.width,
      height: layer.verticalMetrics?.height ?? null,
    },
    anchors: layer.anchors.map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      name: anchor.name,
      color: anchor.color,
      identifier: anchor.identifier ?? anchor.id,
    })),
    guidelines: layer.guidelines.map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
      name: guide.name ?? null,
      color: guide.color,
      identifier: guide.identifier ?? guide.id,
    })),
    contours: layer.paths.map((path) => pathToUfoContour(path)),
    components: layer.componentRefs.map((component) => {
      const matrix = getComponentMatrix(component)
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
    note: layerSource.note ?? input.glyph.note ?? null,
    image: layerSource.image ?? null,
    lib: layerSource.lib ?? null,
    dirty: input.glyph.syncDirty === 1,
    dirtyIndex: input.glyph.syncDirty,
    updatedAt: input.glyph.updatedAt,
  }
}

const toSyncGlyphRecord = (input: {
  project: KumikoProjectRecord
  glyph: KumikoGlyphRecord
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
  contents: Record<string, string>
): UfoMetadataRecord => {
  const { source } = getUfoSource(project, activeUfoId)
  return {
    projectId: project.projectId,
    ufoId: source.ufoId,
    relativePath: source.relativePath,
    metainfo: source.metainfo ?? {},
    fontinfo: source.fontinfoExtra ?? {},
    lib: source.libExtra ?? {},
    groups: source.groupsExtra ?? {},
    kerning: source.kerningExtra ?? {},
    featuresText: project.features?.text ?? null,
    layers: source.layers,
    contents,
    glyphOrder: project.glyphOrder,
    updatedAt: project.updatedAt,
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

  const allGlyphs = await listKumikoGlyphRecordsForProject(input.projectId)
  const dirtyGlyphIds = new Set(
    (await listSyncDirtyKumikoGlyphRecords(input.projectId)).map(
      (glyph) => glyph.glyphId
    )
  )
  const contents = makeContents(project, allGlyphs, input.activeUfoId)
  const metadata = buildMetadata(project, input.activeUfoId, contents)
  const { source, defaultLayer } = getUfoSource(project, input.activeUfoId)
  const liveGlyphIds = new Set(allGlyphs.map((glyph) => glyph.glyphId))
  const files: GitHubCommitFileInput[] = []
  const exportStateUpdates: GitHubPreparedCommit['exportStateUpdates'] = []

  for (const glyph of allGlyphs) {
    if (!dirtyGlyphIds.has(glyph.glyphId)) {
      continue
    }
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
      glyphId: glyph.glyphId,
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
    listKumikoGlyphRecordsForProject(projectId),
  ])
  if (!project) {
    return
  }

  const updateByGlyphId = new Map(
    updates.map((update) => [update.glyphId, update])
  )
  const timestamp = Date.now()
  await saveKumikoGlyphRecordBatch(
    glyphs.map((glyph) => {
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
            sourceHash: update.sourceHash,
            remoteBlobSha: update.remoteBlobSha,
          },
        },
        updatedAt: timestamp,
      }
    })
  )

  await saveKumikoProjectRecord({
    ...project,
    syncDirty: 0,
    sourceData: {
      ...project.sourceData,
      ufo: project.sourceData?.ufo
        ? {
            ...project.sourceData.ufo,
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

  const glyphs = await listKumikoGlyphRecordsForProject(input.projectId)
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
