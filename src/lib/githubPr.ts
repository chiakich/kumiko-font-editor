import { hashString } from 'src/lib/hash'
import { gitBlobShaFromText } from 'src/lib/githubSync/gitBlobSha'
import {
  loadUfoProject,
  loadUfoMetadata,
  listDirtyUfoGlyphs,
  saveUfoProject,
  updateUfoGlyphExportState,
} from 'src/lib/ufoPersistence'
import {
  pickDefaultLayer,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontAdapters/ufo'

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

interface GitHubPreparedCommit {
  request: GitHubCommitRequestInput
  changedGlyphNames: string[]
  exportStateUpdates: Array<{
    key: [string, string, string, string]
    dirty: boolean
    sourceHash: string | null
    remoteBlobSha: string | null
  }>
}

const joinPath = (...parts: Array<string | null | undefined>) =>
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')

export const prepareGitHubCommit = async (input: {
  projectId: string
  projectTitle: string
  activeUfoId: string
  deletedFilePaths?: string[]
}): Promise<GitHubPreparedCommit> => {
  const project = await loadUfoProject(input.projectId)
  if (!project?.githubSource) {
    throw new Error('目前專案不是從 GitHub 載入，無法提交到 GitHub')
  }

  const metadata = await loadUfoMetadata(input.projectId, input.activeUfoId)
  if (!metadata) {
    throw new Error('找不到目前 UFO 的 metadata')
  }

  const defaultLayer = pickDefaultLayer(metadata)
  const dirtyGlyphs = (await listDirtyUfoGlyphs(input.projectId)).filter(
    (glyph) =>
      glyph.ufoId === input.activeUfoId &&
      glyph.layerId === defaultLayer.layerId
  )

  const files: GitHubCommitFileInput[] = []
  const exportStateUpdates: GitHubPreparedCommit['exportStateUpdates'] = []

  for (const glyph of dirtyGlyphs) {
    const glifText = serializeGlifRecord(glyph)
    const nextHash = hashString(glifText)
    files.push({
      path: joinPath(
        metadata.relativePath,
        defaultLayer.glyphDir,
        glyph.fileName
      ),
      content: glifText,
    })
    exportStateUpdates.push({
      key: [glyph.projectId, glyph.ufoId, glyph.layerId, glyph.glyphName],
      dirty: false,
      sourceHash: nextHash,
      // The pushed content becomes the new agreed baseline with the remote.
      remoteBlobSha: await gitBlobShaFromText(glifText),
    })
  }

  const contentsPath = joinPath(
    metadata.relativePath,
    defaultLayer.glyphDir,
    'contents.plist'
  )
  files.push({
    path: contentsPath,
    content: serializeXmlPlist(metadata.contents),
  })

  for (const deletedFilePath of input.deletedFilePaths ?? []) {
    files.push({
      path: deletedFilePath,
      deleted: true,
    })
  }

  if (files.length === 0) {
    throw new Error('目前沒有可提交到 GitHub 的變更')
  }

  const changedGlyphNames = dirtyGlyphs.map((glyph) => glyph.glyphName)
  const titleSummary =
    changedGlyphNames.length > 0
      ? `Update ${changedGlyphNames.slice(0, 3).join(', ')}`
      : 'Update UFO contents'

  return {
    request: {
      repo: `${project.githubSource.owner}/${project.githubSource.repo}`,
      baseBranch: project.githubSource.defaultBranch,
      commitMessage: titleSummary,
      files,
    },
    changedGlyphNames,
    exportStateUpdates,
  }
}

export const markGitHubCommitSynced = async (
  updates: GitHubPreparedCommit['exportStateUpdates'],
  commitTarget?: {
    projectId: string
    headOwner: string
    branchName: string
    commitSha: string
  }
) => {
  await updateUfoGlyphExportState(updates)

  if (!commitTarget) {
    return
  }
  const project = await loadUfoProject(commitTarget.projectId)
  if (!project?.githubSource) {
    return
  }
  // The fork branch we pushed to is now the tracking branch for sync checks.
  await saveUfoProject({
    ...project,
    lastSync: {
      owner: commitTarget.headOwner,
      repo: project.githubSource.repo,
      ref: commitTarget.branchName,
      commitSha: commitTarget.commitSha,
      syncedAt: Date.now(),
    },
    updatedAt: Date.now(),
  })
}
