import 'src/lib/git/nodeGlobals'
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
  checkoutWorktreeBranch,
  type GitWorktree,
} from 'src/lib/git/worktree'
import { createUfoFormatAdapter } from 'src/lib/fontFormats/formatAdapter/ufoFormatAdapter'
import { materializeUfoTree } from 'src/lib/fontFormats/ufoMaterialize'
import {
  applyKumikoRemoteSnapshot,
  listProjectUfoSources,
} from 'src/lib/github/sync/kumikoUfoSync'
import { UFO_FONT_LEVEL_FILE_NAMES } from 'src/lib/fontFormats/ufoFileNames'
import type { ParsedUfoFolder } from 'src/lib/fontFormats/ufoFormat'
import type {
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'
import {
  listKumikoGlyphSyncMetadataForProject,
  listSyncDirtyKumikoGlyphIds,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
  saveKumikoProjectRecord,
  updateKumikoGlyphExportDirtyState,
  updateKumikoGlyphSyncDirtyState,
} from 'src/lib/project/kumikoProjectPersistence'
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
  // Exactly what the commit wrote, so bookkeeping never has to guess file names.
  writtenPaths: string[]
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
  // Upstream repo and branch a new patch branch should start from. Without
  // these a fresh worktree would commit with no common ancestor, and the
  // resulting pull request would show every file as newly added.
  baseRepo?: string | null
  baseBranch?: string | null
  message: string
  store?: FileStore
}): Promise<GitCommitAndPushResult> => {
  const worktree = await openGitWorktree({
    projectId: input.projectId,
    store: input.store,
  })

  let startAt: string | null = null
  if (input.baseRepo && input.baseBranch) {
    const fetched = await fetchRemoteBranch({
      worktree,
      repo: input.baseRepo,
      branch: input.baseBranch,
    })
    startAt = fetched.remoteHeadSha
  }

  await checkoutWorktreeBranch({
    worktree,
    branch: input.pushBranch,
    startAt,
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
    writtenPaths: synced.writtenPaths,
  }
}

export const remoteTrackingRefFor = trackingRefFor

// Reads the remote side of a pull out of the fetched commit, in the same shape
// the archive download produces, so the canonical apply logic is shared.
export const readRemoteUfoFolders = async (input: {
  worktree: GitWorktree
  remoteHeadSha: string
  projectId: string
  // Repo paths worth reading. Font-level files are always included so pulled
  // metadata lands the same way an import would put it there.
  paths: readonly string[]
}): Promise<ParsedUfoFolder[]> => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    return []
  }
  const sources = listProjectUfoSources(project)
  const wanted = new Set(input.paths)
  const folders: ParsedUfoFolder[] = []

  for (const source of sources) {
    const prefix = `${source.relativePath}/`
    const files: Record<string, string> = {}

    const innerPaths = new Set<string>(
      UFO_FONT_LEVEL_FILE_NAMES.map((name) => name)
    )
    for (const path of wanted) {
      if (path.startsWith(prefix)) {
        innerPaths.add(path.slice(prefix.length))
      }
    }

    for (const innerPath of innerPaths) {
      const text = await readBlobAtCommit({
        worktree: input.worktree,
        oid: input.remoteHeadSha,
        filepath: `${source.relativePath}/${innerPath}`,
      })
      if (text !== null) {
        files[innerPath] = text
      }
    }

    folders.push({
      ufoId: source.ufoId,
      relativePath: source.relativePath,
      files,
    })
  }

  return folders
}

// Applies a git-derived report to canonical records. Only the paths the report
// wants are read out of the commit, so a one-glyph pull does not touch the rest
// of a CJK-scale repository.
export const applyGitRemoteChanges = async (input: {
  projectId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
  remoteHeadSha: string
  store?: FileStore
}) => {
  const worktree = await openGitWorktree({
    projectId: input.projectId,
    store: input.store,
  })
  const paths = input.report.entries
    .filter(
      (entry) =>
        entry.status === 'remoteModified' ||
        entry.status === 'remoteAdded' ||
        entry.status === 'conflict'
    )
    .map((entry) => entry.path)

  const remoteUfos = await readRemoteUfoFolders({
    worktree,
    remoteHeadSha: input.remoteHeadSha,
    projectId: input.projectId,
    paths,
  })

  return applyKumikoRemoteSnapshot({
    projectId: input.projectId,
    report: input.report,
    resolutions: input.resolutions,
    remoteUfos,
  })
}

export interface GitCommitSyncedInput {
  projectId: string
  pushedRepo: string
  pushedBranch: string
  commitSha: string
  // The paths the commit actually wrote, from commitAndPushProject.
  writtenPaths?: readonly string[]
}

// Canonical bookkeeping after a git commit. No blob baselines are written: with
// git the merge base commit is the baseline, so the per-glyph SHA fields the
// REST transport maintains have nothing to record here.
export const markGitCommitSynced = async (input: GitCommitSyncedInput) => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    return
  }

  // The whole tree is materialized on every commit, so everything dirty is now
  // committed — no per-glyph selection needed.
  const dirtyGlyphIds = await listSyncDirtyKumikoGlyphIds(input.projectId)
  const keys = dirtyGlyphIds.map((glyphId) =>
    makeKumikoGlyphKey(input.projectId, glyphId)
  )
  await updateKumikoGlyphSyncDirtyState(keys, 0)
  await updateKumikoGlyphExportDirtyState(keys, 0)

  const glyphs = await listKumikoGlyphSyncMetadataForProject(input.projectId)
  const timestamp = Date.now()
  const liveGlyphIds = new Set(glyphs.map((glyph) => glyph.glyphId))

  // Recover glyphName → file name per UFO from the committed paths. The adapter
  // owns the path-to-entity mapping, so no naming rule is duplicated here.
  const adapters = await buildProjectAdapters(input.projectId)
  const committedNames = new Map<string, Record<string, string>>()
  for (const path of input.writtenPaths ?? []) {
    for (const [index, adapter] of adapters.entries()) {
      const entity = adapter.entityOwning(path)
      if (entity?.kind !== 'glyph' || !liveGlyphIds.has(entity.name)) {
        continue
      }
      const ufoId = listProjectUfoSources(project)[index]?.ufoId
      if (!ufoId) {
        continue
      }
      committedNames.set(ufoId, {
        ...committedNames.get(ufoId),
        [entity.name]: path.slice(path.lastIndexOf('/') + 1),
      })
      break
    }
  }

  await saveKumikoProjectRecord({
    ...project,
    syncDirty: 0,
    exportDirty: 0,
    sourceData: {
      ...project.sourceData,
      ufo: project.sourceData?.ufo
        ? {
            ...project.sourceData.ufo,
            ufos: project.sourceData.ufo.ufos?.map((ufo) => ({
              ...ufo,
              contents: Object.fromEntries(
                glyphs.map((glyph) => [
                  glyph.glyphId,
                  committedNames.get(ufo.ufoId)?.[glyph.glyphId] ??
                    ufo.contents[glyph.glyphId] ??
                    glyph.sourceData?.ufo?.fileName ??
                    `${glyph.glyphId}.glif`,
                ])
              ),
              glyphOrder: project.glyphOrder,
            })),
            lastSync: {
              owner: input.pushedRepo.split('/')[0] ?? '',
              repo: input.pushedRepo.split('/')[1] ?? '',
              ref: input.pushedBranch,
              commitSha: input.commitSha,
              syncedAt: timestamp,
            },
          }
        : project.sourceData?.ufo,
    },
    updatedAt: timestamp,
  })
}
