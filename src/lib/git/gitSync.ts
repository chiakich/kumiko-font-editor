import git from 'isomorphic-git'
import {
  buildEntitySyncEntries,
  summarizeEntitySync,
  type EntitySyncInput,
  type EntitySyncReport,
} from 'src/lib/git/entitySync'
import {
  fetchRemoteBranch,
  pushBranch,
  readBlobAtCommit,
  trackingRefFor,
} from 'src/lib/git/remote'
import {
  commitWorktree,
  openGitWorktree,
  stageWorktreePaths,
  syncWorktreeFromProject,
  type GitWorktree,
} from 'src/lib/git/worktree'
import { createUfoFormatAdapter } from 'src/lib/fontFormats/formatAdapter/ufoFormatAdapter'
import { materializeUfoTree } from 'src/lib/fontFormats/ufoMaterialize'
import { listProjectUfoSources } from 'src/lib/github/sync/kumikoUfoSync'
import { loadKumikoProjectRecord } from 'src/lib/project/kumikoProjectPersistence'
import type { FileStore } from 'src/lib/git/fileStore'

export interface GitSyncTarget {
  projectId: string
  repo: string
  branch: string
}

export interface GitSyncReport extends EntitySyncReport {
  remoteHeadSha: string
  mergeBaseSha: string | null
  localHeadSha: string | null
}

// Collects the local file tree once. The materializer is the only projection
// from canonical records, so local content here is exactly what a commit
// would write.
const collectLocalTree = async (projectId: string) => {
  const files = new Map<
    string,
    { text: string; entity: EntitySyncInput['entity'] }
  >()
  for await (const file of materializeUfoTree({ projectId })) {
    files.set(file.path, { text: file.text, entity: file.entity })
  }
  return files
}

const listCommitPaths = async (worktree: GitWorktree, oid: string | null) => {
  if (!oid) {
    return [] as string[]
  }
  try {
    return await git.listFiles({ fs: worktree.fs, dir: worktree.dir, ref: oid })
  } catch {
    return [] as string[]
  }
}

const buildProjectAdapters = async (projectId: string) => {
  const project = await loadKumikoProjectRecord(projectId)
  if (!project) {
    return []
  }
  const designspacePath = project.sourceData?.ufo?.designspacePath ?? null
  return listProjectUfoSources(project).map((source) =>
    createUfoFormatAdapter({
      relativePath: source.relativePath,
      glyphDir:
        source.layers.find((layer) => layer.layerId === source.defaultLayerId)
          ?.glyphDir ?? 'glyphs',
      designspacePath,
      contents: source.contents,
    })
  )
}

// Builds a sync report by comparing the local materialization, the merge base
// and the fetched remote head. No per-file baseline is stored anywhere: the
// merge base commit is the baseline.
export const buildGitSyncReport = async (input: {
  target: GitSyncTarget
  store?: FileStore
}): Promise<GitSyncReport> => {
  const worktree = await openGitWorktree({
    projectId: input.target.projectId,
    store: input.store,
  })
  const fetched = await fetchRemoteBranch({
    worktree,
    repo: input.target.repo,
    branch: input.target.branch,
  })

  const localTree = await collectLocalTree(input.target.projectId)
  const adapters = await buildProjectAdapters(input.target.projectId)
  // Paths only the remote knows still need an owning entity, and which UFO owns
  // one depends on the project's real layout.
  const entityOwning = (path: string) => {
    for (const adapter of adapters) {
      const entity = adapter.entityOwning(path)
      if (entity) {
        return entity
      }
    }
    return null
  }

  const [basePaths, remotePaths] = await Promise.all([
    listCommitPaths(worktree, fetched.mergeBaseSha),
    listCommitPaths(worktree, fetched.remoteHeadSha),
  ])

  const paths = new Set<string>([
    ...localTree.keys(),
    ...basePaths,
    ...remotePaths,
  ])

  const inputs: EntitySyncInput[] = []
  for (const path of paths) {
    const local = localTree.get(path) ?? null
    const entity = local?.entity ?? entityOwning(path)
    if (!entity) {
      continue
    }
    inputs.push({
      entity,
      path,
      baseText: fetched.mergeBaseSha
        ? await readBlobAtCommit({
            worktree,
            oid: fetched.mergeBaseSha,
            filepath: path,
          })
        : null,
      localText: local?.text ?? null,
      remoteText: await readBlobAtCommit({
        worktree,
        oid: fetched.remoteHeadSha,
        filepath: path,
      }),
    })
  }

  return {
    ...summarizeEntitySync(buildEntitySyncEntries(inputs)),
    remoteHeadSha: fetched.remoteHeadSha,
    mergeBaseSha: fetched.mergeBaseSha,
    localHeadSha: fetched.localHeadSha,
  }
}

export interface GitCommitAndPushResult {
  commitSha: string
  pushedBranch: string
}

// Materializes, commits and pushes. Callers must resolve conflicts first: this
// never merges file text, matching the entity-level conflict model.
export const commitAndPushProject = async (input: {
  target: GitSyncTarget
  message: string
  pushBranchName?: string
  store?: FileStore
}): Promise<GitCommitAndPushResult> => {
  const worktree = await openGitWorktree({
    projectId: input.target.projectId,
    store: input.store,
  })
  const synced = await syncWorktreeFromProject({
    projectId: input.target.projectId,
    worktree,
  })
  await stageWorktreePaths({ worktree, ...synced })
  const commitSha = await commitWorktree({ worktree, message: input.message })

  const branch = input.pushBranchName ?? input.target.branch
  await pushBranch({ worktree, repo: input.target.repo, branch })

  return { commitSha, pushedBranch: branch }
}

export const remoteTrackingRefFor = trackingRefFor
