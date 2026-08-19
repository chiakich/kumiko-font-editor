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
  trackingRefFor,
} from 'src/lib/git/remote'
import {
  commitWorktree,
  openGitWorktree,
  stageWorktreePaths,
  syncWorktreeFromProject,
  checkoutWorktreeBranch,
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

// Hashes the local tree instead of holding it. The materializer is the only
// projection from canonical records, so these OIDs are exactly what a commit
// would produce — and a CJK-scale project stays a map of hashes, not of file
// bodies.
const collectLocalTree = async (projectId: string) => {
  const files = new Map<
    string,
    { oid: string; entity: EntitySyncInput['entity'] }
  >()
  for await (const file of materializeUfoTree({ projectId })) {
    const { oid } = await git.hashBlob({ object: file.text })
    files.set(file.path, { oid, entity: file.entity })
  }
  return files
}

// Collects path → blob OID for one commit in a single walk, rather than reading
// every file to compare content.
const collectTreeOids = async (worktree: GitWorktree, oid: string | null) => {
  const oids = new Map<string, string>()
  if (!oid) {
    return oids
  }
  try {
    await git.walk({
      fs: worktree.fs,
      dir: worktree.dir,
      trees: [git.TREE({ ref: oid })],
      map: async (path, entries) => {
        const entry = entries?.[0]
        if (!entry || path === '.') {
          return
        }
        if ((await entry.type()) !== 'blob') {
          return
        }
        const entryOid = await entry.oid()
        if (entryOid) {
          oids.set(path, entryOid)
        }
      },
    })
  } catch {
    return oids
  }
  return oids
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

  const [baseOids, remoteOids] = await Promise.all([
    collectTreeOids(worktree, fetched.mergeBaseSha),
    collectTreeOids(worktree, fetched.remoteHeadSha),
  ])

  const paths = new Set<string>([
    ...localTree.keys(),
    ...baseOids.keys(),
    ...remoteOids.keys(),
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
      baseOid: baseOids.get(path) ?? null,
      localOid: local?.oid ?? null,
      remoteOid: remoteOids.get(path) ?? null,
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
  pushedRepo: string
  pushedBranch: string
}

// Materializes, commits and pushes. Contributors push to their own fork, so the
// push repository is separate from the one the report fetched. Callers must
// resolve conflicts first: this never merges file text, matching the
// entity-level conflict model.
export const commitAndPushProject = async (input: {
  projectId: string
  // owner/repo to push to — the contributor's fork, not necessarily upstream.
  pushRepo: string
  // Branch to create or update on that fork.
  pushBranch: string
  // Commit to start a new branch from, normally the fetched upstream head.
  startAt?: string | null
  message: string
  store?: FileStore
}): Promise<GitCommitAndPushResult> => {
  const worktree = await openGitWorktree({
    projectId: input.projectId,
    store: input.store,
  })
  await checkoutWorktreeBranch({
    worktree,
    branch: input.pushBranch,
    startAt: input.startAt ?? null,
  })
  const synced = await syncWorktreeFromProject({
    projectId: input.projectId,
    worktree,
  })
  await stageWorktreePaths({ worktree, ...synced })
  const commitSha = await commitWorktree({ worktree, message: input.message })

  await pushBranch({
    worktree,
    repo: input.pushRepo,
    localRef: input.pushBranch,
  })

  return {
    commitSha,
    pushedRepo: input.pushRepo,
    pushedBranch: input.pushBranch,
  }
}

export const remoteTrackingRefFor = trackingRefFor
