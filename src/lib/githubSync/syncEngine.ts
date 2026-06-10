import { fetchGitHubArchiveSnapshot } from 'src/lib/githubImport'
import {
  buildWorkspaceFileMapFromEntries,
  parseGlifText,
  pickDefaultLayer,
} from 'src/lib/ufoFormat'
import {
  loadUfoMetadata,
  loadUfoProject,
  loadUfoGlyph,
  loadUfoUiValue,
  listUfoGlyphsInLayer,
  makeUfoGlyphKey,
  saveUfoGlyphBatch,
  saveUfoMetadata,
  saveUfoProject,
  deleteUfoGlyphBatch,
} from 'src/lib/ufoPersistence'
import { UFO_LOCAL_DELETED_GLYPHS_KEY } from 'src/lib/draftSave'
import type { UfoGlyphRecord, UfoProjectRecord } from 'src/lib/ufoTypes'
import { gitBlobShaFromText } from 'src/lib/githubSync/gitBlobSha'
import { fetchRemoteTree } from 'src/lib/githubSync/remoteTree'
import {
  buildSyncReport,
  computeGlyphSyncEntries,
  joinRepoPath,
} from 'src/lib/githubSync/computeSyncReport'
import type {
  GitHubSyncTarget,
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/githubSync/types'

export const resolveSyncTarget = (
  project: UfoProjectRecord
): GitHubSyncTarget | null => {
  if (project.lastSync) {
    return project.lastSync
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

const loadLocallyDeletedFiles = async (
  projectId: string,
  contents: Record<string, string>
) => {
  const deletedGlyphNames =
    (await loadUfoUiValue<string[]>(projectId, UFO_LOCAL_DELETED_GLYPHS_KEY)) ??
    []
  const files: Record<string, string> = {}
  for (const glyphName of deletedGlyphNames) {
    // Best effort: contents may already be pruned after a draft save, in
    // which case the deleted file falls back to the default naming rule.
    files[glyphName] = contents[glyphName] ?? `${glyphName}.glif`
  }
  return files
}

export const buildProjectSyncReport = async (input: {
  projectId: string
  activeUfoId: string
}): Promise<ProjectSyncReport | null> => {
  const project = await loadUfoProject(input.projectId)
  if (!project) {
    return null
  }
  const target = resolveSyncTarget(project)
  if (!target) {
    return null
  }

  const metadata = await loadUfoMetadata(input.projectId, input.activeUfoId)
  if (!metadata) {
    return null
  }

  const defaultLayer = pickDefaultLayer(metadata)
  const [glyphs, locallyDeletedFiles, remote] = await Promise.all([
    listUfoGlyphsInLayer(
      input.projectId,
      input.activeUfoId,
      defaultLayer.layerId
    ),
    loadLocallyDeletedFiles(input.projectId, metadata.contents),
    fetchRemoteTree({
      repo: `${target.owner}/${target.repo}`,
      ref: target.ref,
    }),
  ])

  const entries = computeGlyphSyncEntries({
    glyphs,
    locallyDeletedFiles,
    glyphDirPath: joinRepoPath(metadata.relativePath, defaultLayer.glyphDir),
    remote,
  })

  return buildSyncReport({
    target: { owner: target.owner, repo: target.repo, ref: target.ref },
    remote,
    entries,
  })
}

export interface ApplyRemoteResult {
  appliedCount: number
  remainingConflicts: number
}

export const applyRemoteSnapshot = async (input: {
  projectId: string
  activeUfoId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
}): Promise<ApplyRemoteResult> => {
  const { projectId, activeUfoId, report } = input
  const resolutions = input.resolutions ?? {}

  const project = await loadUfoProject(projectId)
  const metadata = await loadUfoMetadata(projectId, activeUfoId)
  if (!project || !metadata) {
    throw new Error('找不到專案資料，無法套用遠端更新')
  }

  const defaultLayer = pickDefaultLayer(metadata)
  const timestamp = Date.now()

  // One archive download at the reported head replaces per-file blob
  // fetches: it avoids API rate limits and works for anonymous viewers.
  const snapshot = await fetchGitHubArchiveSnapshot({
    repo: `${report.target.owner}/${report.target.repo}`,
    ref: report.remoteHeadSha,
  })
  const parsedUfos = buildWorkspaceFileMapFromEntries(snapshot.ufoEntries)
  const remoteUfo =
    parsedUfos.find((ufo) => ufo.relativePath === metadata.relativePath) ?? null

  const recordsToSave: UfoGlyphRecord[] = []
  const keysToDelete: Array<[string, string, string, string]> = []
  const nextContents = { ...metadata.contents }
  const nextGlyphOrder = [...metadata.glyphOrder]
  let appliedCount = 0
  let remainingConflicts = 0

  const takeRemoteEntry = async (fileName: string) => {
    const text = remoteUfo?.files[`${defaultLayer.glyphDir}/${fileName}`]
    if (!text) {
      return false
    }
    const parsedGlyph = parseGlifText(text, fileName)
    recordsToSave.push({
      ...parsedGlyph,
      projectId,
      ufoId: activeUfoId,
      layerId: defaultLayer.layerId,
      remoteBlobSha: await gitBlobShaFromText(text),
      dirty: false,
      dirtyIndex: 0,
      updatedAt: timestamp,
    })
    if (!nextContents[parsedGlyph.glyphName]) {
      nextContents[parsedGlyph.glyphName] = fileName
    }
    if (!nextGlyphOrder.includes(parsedGlyph.glyphName)) {
      nextGlyphOrder.push(parsedGlyph.glyphName)
    }
    return true
  }

  for (const entry of report.entries) {
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
            makeUfoGlyphKey(
              projectId,
              activeUfoId,
              defaultLayer.layerId,
              entry.glyphName
            )
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
              makeUfoGlyphKey(
                projectId,
                activeUfoId,
                defaultLayer.layerId,
                entry.glyphName
              )
            )
            delete nextContents[entry.glyphName]
            appliedCount += 1
          } else if (await takeRemoteEntry(entry.fileName)) {
            appliedCount += 1
          }
        } else if (resolution === 'keepLocal' && entry.glyphName) {
          const record = await loadUfoGlyph(
            makeUfoGlyphKey(
              projectId,
              activeUfoId,
              defaultLayer.layerId,
              entry.glyphName
            )
          )
          if (record) {
            // Adopting the remote SHA as baseline while staying dirty means
            // the next commit knowingly overwrites the remote version.
            recordsToSave.push({
              ...record,
              remoteBlobSha: entry.remoteSha,
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
    await saveUfoGlyphBatch(recordsToSave)
  }
  if (keysToDelete.length > 0) {
    await deleteUfoGlyphBatch(keysToDelete)
  }

  await saveUfoMetadata({
    ...metadata,
    contents: nextContents,
    glyphOrder: nextGlyphOrder,
    updatedAt: timestamp,
  })

  await saveUfoProject({
    ...project,
    lastSync: {
      owner: report.target.owner,
      repo: report.target.repo,
      ref: report.target.ref,
      commitSha: report.remoteHeadSha,
      syncedAt: timestamp,
    },
    updatedAt: timestamp,
  })

  return { appliedCount, remainingConflicts }
}
