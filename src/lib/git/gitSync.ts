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
  resetWorktreeIndex,
  stageWorktreePaths,
  syncWorktreeFromProject,
  checkoutWorktreeBranch,
  type GitCommitAuthor,
  type GitWorktree,
} from 'src/lib/git/worktree'
import { buildProjectAdapters } from 'src/lib/git/projectAdapters'
import {
  listUfoTreePaths,
  materializeUfoTree,
} from 'src/lib/fontFormats/ufoMaterialize'
import {
  applyKumikoRemoteSnapshot,
  buildKumikoUfoExportManifest,
  listProjectUfoSources,
  makeContents,
  type KumikoUfoExportManifest,
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
import {
  baseTargetForProject,
  sameGitTarget,
  withUpdatedChangeDraft,
} from 'src/lib/git/collaboration'

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

// Hashes materialized local entities instead of holding their bodies. Callers
// normally pass the dirty scope, so a CJK project stays proportional to the
// user's changes rather than its total glyph count.
const collectLocalTree = async (input: {
  projectId: string
  scope?: 'all' | 'dirty'
  manifest?: KumikoUfoExportManifest
}) => {
  const files = new Map<
    string,
    { oid: string; entity: EntitySyncInput['entity'] }
  >()
  for await (const file of materializeUfoTree(input)) {
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

// The commit the project was imported from, when the fetch actually brought it
// in. A force-pushed or pruned branch no longer contains it, and then there is
// no honest base: reporting conflicts beats inventing a baseline.
const resolveImportedBaseSha = async (
  worktree: GitWorktree,
  projectId: string
) => {
  const project = await loadKumikoProjectRecord(projectId)
  const importedSha = project?.githubSource?.commitSha
  if (!importedSha) {
    return null
  }
  try {
    const { type } = await git.readObject({
      fs: worktree.fs,
      dir: worktree.dir,
      oid: importedSha,
    })
    return type === 'commit' ? importedSha : null
  } catch {
    return null
  }
}

// A commit is built from the index, and the index of a fresh worktree holds only
// what we staged. Every base path we did not stage therefore has to be carried
// through explicitly, or the commit reads as "delete everything this project did
// not happen to materialize" — that wiped a repository's README, licence and
// docs, and later deleted glyphs that only existed on the remote.
//
// The rule is deliberately about evidence rather than ownership: a base path is
// dropped only when this sync decided to delete it. Anything else is carried,
// whether or not the path looks like ours. Runs after staging so removedPaths is
// known, and returns the base tree so the caller does not walk it twice.
const carryBasePaths = async (input: {
  worktree: GitWorktree
  baseSha: string
  writtenPaths: ReadonlySet<string>
  removedPaths: ReadonlySet<string>
}) => {
  const { worktree } = input
  const baseOids = await collectTreeOids(worktree, input.baseSha)
  const tracked = new Set(
    await git
      .listFiles({ fs: worktree.fs, dir: worktree.dir })
      .catch(() => [] as string[])
  )

  for (const [path, oid] of baseOids) {
    if (tracked.has(path) || input.removedPaths.has(path)) {
      continue
    }
    const blob = await git.readBlob({
      fs: worktree.fs,
      dir: worktree.dir,
      oid,
    })
    await worktree.fs.promises.writeFile(`${worktree.dir}/${path}`, blob.blob)
    await git.add({ fs: worktree.fs, dir: worktree.dir, filepath: path })
  }

  // Mirror deletions too: a file the base no longer has, and that this sync did
  // not write, is left over from an earlier branch and must not be resurrected
  // by our index.
  for (const path of tracked) {
    if (baseOids.has(path) || input.writtenPaths.has(path)) {
      continue
    }
    await git
      .remove({ fs: worktree.fs, dir: worktree.dir, filepath: path })
      .catch(() => undefined)
  }

  return baseOids
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

  const project = await loadKumikoProjectRecord(input.target.projectId)
  const dirtyGlyphIds = await listSyncDirtyKumikoGlyphIds(
    input.target.projectId
  )
  const hasPotentialLocalChanges =
    dirtyGlyphIds.length > 0 || project?.syncDirty === 1
  const adapters = await buildProjectAdapters(input.target.projectId)
  const canRemovePath = (path: string) =>
    adapters.some((adapter) => adapter.canRemovePath(path))
  // Paths only the remote knows still need an owning entity, and which UFO owns
  // one depends on the project's real layout.
  const entityOwning = (path: string) => {
    for (const adapter of adapters) {
      const entity = adapter.entityOwning(path)
      if (entity) {
        return { entity, mergePolicy: adapter.mergePolicy(entity) }
      }
    }
    return null
  }

  // A project imported from GitHub has no local git history, so there is no
  // merge base — and without a base every path looks changed on both sides,
  // turning a clean project into one conflict per glyph. The import records the
  // commit it came from, which is exactly the base that history would name.
  const baseSha =
    fetched.mergeBaseSha ??
    (fetched.localHeadSha === null
      ? await resolveImportedBaseSha(worktree, input.target.projectId)
      : null)

  // This is the common path after a successful send: HEAD already equals the
  // fetched copy and IndexedDB has no dirty entity. Do not reserialize or hash
  // an entire CJK font merely to rediscover that fact.
  if (!hasPotentialLocalChanges && baseSha === fetched.remoteHeadSha) {
    return {
      ...summarizeEntitySync([]),
      remoteHeadSha: fetched.remoteHeadSha,
      mergeBaseSha: baseSha,
      localHeadSha: fetched.localHeadSha,
    }
  }

  // Dirty flags are Kumiko's local change index. Hash only the affected
  // entities; clean paths are known to still equal the merge base.
  // Both projections below scan every glyph record to build a manifest, so the
  // report builds one and shares it.
  const manifest = await buildKumikoUfoExportManifest(input.target.projectId)
  const localTree = await collectLocalTree({
    projectId: input.target.projectId,
    scope: 'dirty',
    manifest,
  })

  const [baseOids, remoteOids, localPaths] = await Promise.all([
    collectTreeOids(worktree, baseSha),
    collectTreeOids(worktree, fetched.remoteHeadSha),
    hasPotentialLocalChanges
      ? listUfoTreePaths(input.target.projectId, manifest)
      : Promise.resolve<string[] | null>(null),
  ])
  const localPathSet = localPaths ? new Set(localPaths) : null

  const paths = new Set<string>([
    ...localTree.keys(),
    ...baseOids.keys(),
    ...remoteOids.keys(),
  ])

  const inputs: EntitySyncInput[] = []
  for (const path of paths) {
    const owned = entityOwning(path)
    const entity = owned?.entity ?? localTree.get(path)?.entity ?? null
    if (!entity) {
      continue
    }
    inputs.push({
      entity,
      path,
      baseOid: baseOids.get(path) ?? null,
      // A path absent from the dirty projection did not change locally, so its
      // OID is the base OID. It reads as a local deletion only when the project
      // can account for the path having been ours — otherwise this is content we
      // never had (another contributor's glyph), and calling that a local
      // deletion would offer to delete their work.
      localOid:
        localTree.get(path)?.oid ??
        (localPathSet && !localPathSet.has(path) && canRemovePath(path)
          ? null
          : (baseOids.get(path) ?? null)),
      remoteOid: remoteOids.get(path) ?? null,
      mergePolicy: owned?.mergePolicy ?? 'atomic',
    })
  }

  return {
    ...summarizeEntitySync(buildEntitySyncEntries(inputs)),
    remoteHeadSha: fetched.remoteHeadSha,
    mergeBaseSha: baseSha,
    localHeadSha: fetched.localHeadSha,
  }
}

export interface GitCommitAndPushResult {
  commitSha: string
  pushedRepo: string
  pushedBranch: string
  // Exactly what the commit wrote, so bookkeeping never has to guess file names.
  writtenPaths: string[]
  // Paths the caller struck out: materialized in the worktree but deliberately
  // left unstaged, so the commit keeps the base version and they stay dirty.
  excludedPaths: string[]
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
  author: GitCommitAuthor
  // Struck-out paths: left out of the index so this commit does not carry them.
  // Anything omitted keeps whatever the base commit has, and stays a local
  // change for a later send.
  excludePaths?: readonly string[]
  store?: FileStore
}): Promise<GitCommitAndPushResult> => {
  const worktree = await openGitWorktree({
    projectId: input.projectId,
    store: input.store,
  })

  const existingBranches = await git
    .listBranches({ fs: worktree.fs, dir: worktree.dir })
    .catch(() => [] as string[])
  const isExistingDraft = existingBranches.includes(input.pushBranch)
  let startAt: string | null = null
  // The first send needs an upstream tree to create a reviewable change draft.
  // Once the draft exists, its local branch and index already carry that tree;
  // fetching and walking upstream again only delays a small follow-up change.
  if (!isExistingDraft && input.baseRepo && input.baseBranch) {
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

  const baseSha =
    startAt ??
    (await git
      .resolveRef({ fs: worktree.fs, dir: worktree.dir, ref: 'HEAD' })
      .catch(() => null))

  const synced = await syncWorktreeFromProject({
    projectId: input.projectId,
    worktree,
  })
  const excluded = new Set(input.excludePaths ?? [])
  const stagedWrittenPaths = synced.writtenPaths.filter(
    (path) => !excluded.has(path)
  )
  const stagedRemovedPaths = synced.removedPaths.filter(
    (path) => !excluded.has(path)
  )
  // Excluded paths are left unstaged on purpose: the index still holds the
  // checked-out base version of them, which is exactly what "not sent" means.
  await stageWorktreePaths({
    worktree,
    writtenPaths: stagedWrittenPaths,
    removedPaths: stagedRemovedPaths,
  })

  if (baseSha) {
    const removedPaths = new Set(stagedRemovedPaths)
    const baseOids = await carryBasePaths({
      worktree,
      baseSha,
      writtenPaths: new Set(synced.writtenPaths),
      removedPaths,
    })

    // Fail closed rather than push a commit that drops files nobody asked to
    // delete. The commit takes its tree from the index, so checking the index is
    // exactly a check of what is about to be committed — and nothing has been
    // pushed yet. After the carry above this should never fire; it stays as the
    // assertion that no future change reintroduces a silent deletion.
    const staged = new Set(
      await git.listFiles({ fs: worktree.fs, dir: worktree.dir })
    )
    const dropped = [...baseOids.keys()]
      .filter((path) => !staged.has(path) && !removedPaths.has(path))
      .slice(0, 5)
    if (dropped.length > 0) {
      throw new Error(
        `這次 commit 會刪掉沒有要求刪除的檔案（${dropped.join('、')}），已中止。`
      )
    }
  }

  const commitSha = await commitWorktree({
    worktree,
    message: input.message,
    author: input.author,
  })

  await pushBranch({
    worktree,
    repo: input.pushRepo,
    localRef: input.pushBranch,
  })

  return {
    commitSha,
    pushedRepo: input.pushRepo,
    pushedBranch: input.pushBranch,
    writtenPaths: stagedWrittenPaths,
    excludedPaths: [...excluded],
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

// A branch switch changes the project the user is looking at, rather than just
// changing where the next commit will be sent. IndexedDB holds one canonical
// project, so this intentionally hydrates every managed entity from the target
// commit after refusing to overwrite any unsent local work.
export const switchGitProjectBranch = async (input: {
  target: GitSyncTarget
  store?: FileStore
}) => {
  const project = await loadKumikoProjectRecord(input.target.projectId)
  if (!project) {
    throw new Error('找不到專案資料，無法切換版本')
  }
  const dirtyGlyphIds = await listSyncDirtyKumikoGlyphIds(
    input.target.projectId
  )
  if (dirtyGlyphIds.length > 0 || project.syncDirty === 1) {
    throw new Error('請先送出、暫存或放棄本機修改，再切換版本')
  }

  const worktree = await openGitWorktree({
    projectId: input.target.projectId,
    store: input.store,
  })
  const fetched = await fetchRemoteBranch({
    worktree,
    repo: input.target.repo,
    branch: input.target.branch,
  })
  const adapters = await buildProjectAdapters(input.target.projectId)
  const entityOwning = (path: string) => {
    for (const adapter of adapters) {
      const entity = adapter.entityOwning(path)
      if (entity) {
        return entity
      }
    }
    return null
  }
  const [remoteOids, currentPaths] = await Promise.all([
    collectTreeOids(worktree, fetched.remoteHeadSha),
    listUfoTreePaths(input.target.projectId),
  ])
  const currentPathSet = new Set(currentPaths)
  const entries: ProjectSyncReport['entries'] = []
  for (const path of new Set([...currentPathSet, ...remoteOids.keys()])) {
    const entity = entityOwning(path)
    if (!entity) {
      continue
    }
    const onTarget = remoteOids.has(path)
    entries.push({
      kind: entity.kind,
      glyphName: entity.kind === 'glyph' ? entity.name : null,
      fileName: path.slice(path.lastIndexOf('/') + 1),
      path,
      // Force a full canonical hydration even when a file happens to be byte
      // identical across branches: its owning entity may have changed in a
      // sibling master or in the font-level metadata.
      status: onTarget
        ? currentPathSet.has(path)
          ? 'remoteModified'
          : 'remoteAdded'
        : 'remoteDeleted',
      baselineSha: null,
      remoteSha: onTarget ? fetched.remoteHeadSha : null,
    })
  }
  const report: ProjectSyncReport = {
    target: {
      owner: input.target.repo.split('/')[0] ?? '',
      repo: input.target.repo.split('/')[1] ?? '',
      ref: input.target.branch,
    },
    remoteHeadSha: fetched.remoteHeadSha,
    remoteTreeTruncated: false,
    entries,
    conflicts: [],
    remoteChanges: entries,
    localChanges: [],
    isUpToDate: false,
  }
  const remoteUfos = await readRemoteUfoFolders({
    worktree,
    remoteHeadSha: fetched.remoteHeadSha,
    projectId: input.target.projectId,
    paths: [...remoteOids.keys()],
  })

  // The OPFS tree is derived and is materialized again before the next commit.
  // Point HEAD at the selected branch without checking out files: the canonical
  // snapshot below is the source of truth, and noCheckout also avoids walking a
  // whole CJK font just to switch views.
  await git.writeRef({
    fs: worktree.fs,
    dir: worktree.dir,
    ref: `refs/heads/${input.target.branch}`,
    value: fetched.remoteHeadSha,
    force: true,
  })
  await checkoutWorktreeBranch({
    worktree,
    branch: input.target.branch,
    startAt: fetched.remoteHeadSha,
  })
  // HEAD moved without a checkout, so the index still describes the branch we
  // left. Clearing it makes the next sync a full rebuild against the new HEAD
  // instead of a partial one against a tree that is no longer there.
  await resetWorktreeIndex(worktree)

  const result = await applyKumikoRemoteSnapshot({
    projectId: input.target.projectId,
    report,
    remoteUfos,
  })
  const switchedProject = await loadKumikoProjectRecord(input.target.projectId)
  if (switchedProject?.sourceData?.ufo) {
    const base = baseTargetForProject(switchedProject)
    const targetRef = {
      owner: report.target.owner,
      repo: report.target.repo,
      ref: report.target.ref,
      commitSha: fetched.remoteHeadSha,
      syncedAt: Date.now(),
    }
    const collaboration =
      base && !sameGitTarget(base, targetRef)
        ? withUpdatedChangeDraft({ project: switchedProject, draft: targetRef })
        : {
            base,
            changeDrafts:
              switchedProject.sourceData.ufo.gitCollaboration?.changeDrafts ??
              [],
          }
    await saveKumikoProjectRecord({
      ...switchedProject,
      sourceData: {
        ...switchedProject.sourceData,
        ufo: {
          ...switchedProject.sourceData.ufo,
          gitCollaboration: collaboration.base
            ? {
                base: collaboration.base,
                changeDrafts: collaboration.changeDrafts,
              }
            : null,
        },
      },
      updatedAt: Date.now(),
    })
  }
  return result
}

export interface GitCommitSyncedInput {
  projectId: string
  pushedRepo: string
  pushedBranch: string
  commitSha: string
  // The paths the commit actually wrote, from commitAndPushProject.
  writtenPaths?: readonly string[]
  // Paths struck out of this commit: they stay dirty for a later send.
  excludedPaths?: readonly string[]
}

// Canonical bookkeeping after a git commit. No blob baselines are written: with
// git the merge base commit is the baseline, so the per-glyph SHA fields the
// REST transport maintains have nothing to record here.
export const markGitCommitSynced = async (input: GitCommitSyncedInput) => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    return
  }

  const dirtyGlyphIds = await listSyncDirtyKumikoGlyphIds(input.projectId)
  const adapters = await buildProjectAdapters(input.projectId)
  // A struck-out path was materialized but never staged, so its glyph is still
  // ahead of the branch: clearing its dirty flag would lose the change from
  // every later report.
  const excludedGlyphIds = new Set(
    (input.excludedPaths ?? []).flatMap((path) => {
      const entity = adapters
        .map((adapter) => adapter.entityOwning(path))
        .find((owned) => owned?.kind === 'glyph')
      return entity?.name ? [entity.name] : []
    })
  )
  const committedGlyphIds = dirtyGlyphIds.filter(
    (glyphId) => !excludedGlyphIds.has(glyphId)
  )
  const keys = committedGlyphIds.map((glyphId) =>
    makeKumikoGlyphKey(input.projectId, glyphId)
  )
  await updateKumikoGlyphSyncDirtyState(keys, 0)
  await updateKumikoGlyphExportDirtyState(keys, 0)
  const hasPendingChanges = dirtyGlyphIds.length > committedGlyphIds.length

  const glyphs = await listKumikoGlyphSyncMetadataForProject(input.projectId)
  const timestamp = Date.now()
  const syncedTarget = {
    owner: input.pushedRepo.split('/')[0] ?? '',
    repo: input.pushedRepo.split('/')[1] ?? '',
    ref: input.pushedBranch,
    commitSha: input.commitSha,
    syncedAt: timestamp,
  }
  const collaboration = withUpdatedChangeDraft({
    project,
    draft: syncedTarget,
  })
  const liveGlyphIds = new Set(glyphs.map((glyph) => glyph.glyphId))

  // Recover glyphName → file name per UFO from the committed paths. The adapter
  // owns the path-to-entity mapping, so no naming rule is duplicated here.
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
    syncDirty: hasPendingChanges ? 1 : 0,
    exportDirty: hasPendingChanges ? 1 : 0,
    sourceData: {
      ...project.sourceData,
      ufo: project.sourceData?.ufo
        ? {
            ...project.sourceData.ufo,
            ufos: project.sourceData.ufo.ufos?.map((ufo) => {
              // Glyphs outside this commit still need a name, and it has to be
              // the one the next materialization will pick. Deriving it any
              // other way makes contents.plist disagree with the file that gets
              // written, and the difference then reads as a rename — the old
              // path deleted, an identical one added beside it.
              const derived = makeContents(project, glyphs, ufo.ufoId, ufo)
              return {
                ...ufo,
                contents: Object.fromEntries(
                  glyphs.map((glyph) => [
                    glyph.glyphId,
                    committedNames.get(ufo.ufoId)?.[glyph.glyphId] ??
                      derived[glyph.glyphId] ??
                      `${glyph.glyphId}.glif`,
                  ])
                ),
                glyphOrder: project.glyphOrder,
              }
            }),
            lastSync: syncedTarget,
            gitCollaboration: collaboration.base
              ? {
                  base: collaboration.base,
                  changeDrafts: collaboration.changeDrafts,
                }
              : project.sourceData.ufo.gitCollaboration,
          }
        : project.sourceData?.ufo,
    },
    updatedAt: timestamp,
  })
}
