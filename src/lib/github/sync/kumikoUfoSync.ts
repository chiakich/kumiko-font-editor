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
  listKumikoGlyphRecordsForProject,
  listSyncDirtyKumikoGlyphRecords,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
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
  buildBoundsResolver,
  buildWorkspaceFileMapFromEntries,
  glyphRecordToLayerContent,
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
import { getComponentMatrix } from 'src/lib/components/componentTransform'
import { parseUfoColor, serializeUfoColor } from 'src/lib/color/kumikoColor'
import {
  glyphDataToKumikoGlyphRecord,
  kumikoGlyphRecordToGlyphData,
} from 'src/lib/project/kumikoFontDataAdapter'
import type { GlyphData, GlyphLayerData, PathSegmentType } from 'src/store'

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

export interface KumikoUfoExportStateUpdate {
  activeUfoId: string
  glyphId: string
  fileName: string
  sourceHash: string | null
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
      color: serializeUfoColor(anchor.color),
      identifier: anchor.identifier ?? anchor.id,
    })),
    guidelines: layer.guidelines.map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
      name: guide.name ?? null,
      color: serializeUfoColor(guide.color),
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
    image: layer.image
      ? {
          ...layer.image,
          color: serializeUfoColor(layer.image.color),
        }
      : null,
    lib: layerSource.lib ?? null,
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
  const { source, defaultLayer } = getUfoSource(
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
    id: source.defaultLayerId,
    name: source.defaultLayerId,
    type: 'master',
    associatedMasterId: source.defaultLayerId,
    ...content,
    sourceData: {
      ...existingGlyph?.layers?.[source.defaultLayerId]?.sourceData,
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
    activeLayerId: source.defaultLayerId,
    layerOrder: [
      source.defaultLayerId,
      ...(existingGlyph?.layerOrder ?? []).filter(
        (layerId) => layerId !== source.defaultLayerId
      ),
    ],
    layers: {
      ...(existingGlyph?.layers ?? {}),
      [source.defaultLayerId]: layer,
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

export const buildKumikoUfoExportState = async (projectId: string) => {
  const project = await loadKumikoProjectRecord(projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }
  const ufoSources = project.sourceData?.ufo?.ufos
  if (!ufoSources || ufoSources.length === 0) {
    throw new Error('這個專案沒有可匯出的 UFO source metadata')
  }

  const glyphs = await listKumikoGlyphRecordsForProject(projectId)
  return {
    project,
    ufos: ufoSources.map((source) => {
      const contents = makeContents(project, glyphs, source.ufoId)
      const metadata = buildMetadata(project, source.ufoId, contents)
      const defaultLayer =
        source.layers.find(
          (layer) => layer.layerId === source.defaultLayerId
        ) ??
        source.layers[0] ??
        ({
          layerId: 'public.default',
          glyphDir: 'glyphs',
        } satisfies UfoLayerRecord)
      const defaultGlyphs = glyphs.map((glyph) =>
        toUfoGlyphRecord({
          project,
          glyph,
          activeUfoId: source.ufoId,
          fileName: contents[glyph.glyphId] ?? `${glyph.glyphId}.glif`,
        })
      )
      return {
        metadata,
        layers: metadata.layers.map((layer) => ({
          layer,
          glyphs: layer.layerId === defaultLayer.layerId ? defaultGlyphs : [],
        })),
      } satisfies KumikoUfoExportUfo
    }),
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
    listKumikoGlyphRecordsForProject(projectId),
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
            fileName: update.fileName,
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
  const existingGlyphs = await listKumikoGlyphRecordsForProject(input.projectId)
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
