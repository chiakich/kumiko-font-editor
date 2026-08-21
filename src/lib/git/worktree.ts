import 'src/lib/git/nodeGlobals'
import git from 'isomorphic-git'
import { createGitFs, type GitFs } from 'src/lib/git/gitFileSystem'
import { createOpfsFileStore } from 'src/lib/git/opfsFileStore'
import type { FileStore } from 'src/lib/git/fileStore'
import {
  listUfoTreePaths,
  materializeUfoTree,
} from 'src/lib/fontFormats/ufoMaterialize'
import { buildRemovalPolicy } from 'src/lib/git/projectAdapters'

export const KUMIKO_GIT_ROOT = 'kumiko/projects'

export const worktreeDirFor = (projectId: string) =>
  `/${KUMIKO_GIT_ROOT}/${projectId}/worktree`

export interface GitWorktree {
  fs: GitFs
  dir: string
}

const DEFAULT_COMMIT_AUTHOR = {
  name: 'Kumiko',
  email: 'noreply@kumiko.font',
}

export interface GitCommitAuthor {
  name: string
  email: string
}

export const openGitWorktree = async (input: {
  projectId: string
  store?: FileStore
}): Promise<GitWorktree> => {
  const store =
    input.store ?? createOpfsFileStore(await navigator.storage.getDirectory())
  const fs = createGitFs(store)
  const dir = worktreeDirFor(input.projectId)

  // init is idempotent: on an existing repo it leaves refs and objects alone.
  await git.init({ fs, dir, defaultBranch: 'main' })
  return { fs, dir }
}

export interface WorktreeSyncResult {
  writtenPaths: string[]
  removedPaths: string[]
}

const listTrackedPaths = async (worktree: GitWorktree) => {
  try {
    return new Set(await git.listFiles({ fs: worktree.fs, dir: worktree.dir }))
  } catch {
    return new Set<string>()
  }
}

// Rewrites the worktree from canonical records. The worktree is a derived
// cache, so a file the project used to produce and no longer does is removed
// rather than left behind to be committed by accident.
//
// Scope 'auto' rebuilds everything the first time (an empty repository has
// nothing to reuse) and afterwards writes only what changed. Deletions are
// still detected in full, because the expected path list comes from project
// metadata and never loads glyph geometry.
//
// "Not in the expected list" on its own never means deleted. The expected list
// is built from this project's records, and a repository holds more than this
// project knows about — another contributor's glyph, a README, build tooling.
// Removal therefore needs positive evidence that the path was ours, which is
// what canRemovePath supplies.
export const syncWorktreeFromProject = async (input: {
  projectId: string
  worktree: GitWorktree
  scope?: 'auto' | 'all' | 'dirty'
  // Whether the project may delete a path at all. Defaults to the project's own
  // removal policy, so a caller cannot cause a silent deletion by forgetting to
  // pass one.
  canRemovePath?: (path: string) => boolean
}): Promise<WorktreeSyncResult> => {
  const { worktree } = input
  const tracked = await listTrackedPaths(worktree)
  const requested = input.scope ?? 'auto'
  const scope =
    requested === 'auto' ? (tracked.size === 0 ? 'all' : 'dirty') : requested

  const writtenPaths: string[] = []
  for await (const file of materializeUfoTree({
    projectId: input.projectId,
    scope,
  })) {
    await worktree.fs.promises.writeFile(
      `${worktree.dir}/${file.path}`,
      file.text
    )
    writtenPaths.push(file.path)
  }

  const expected =
    scope === 'all'
      ? new Set(writtenPaths)
      : new Set(await listUfoTreePaths(input.projectId))
  const canRemovePath =
    input.canRemovePath ?? (await buildRemovalPolicy(input.projectId))
  const removedPaths = [...tracked].filter(
    (path) => !expected.has(path) && canRemovePath(path)
  )
  for (const path of removedPaths) {
    await worktree.fs.promises
      .unlink(`${worktree.dir}/${path}`)
      .catch(() => undefined)
  }

  return { writtenPaths, removedPaths }
}

// isomorphic-git collects failures from its parallel walk into MultipleGitError,
// whose own message says only "refer to the errors property" — useless in a
// toast. Name the actual causes so a failure is diagnosable from the UI.
const describeGitFailure = (error: unknown) => {
  if (
    error instanceof git.Errors.MultipleGitError &&
    Array.isArray(error.errors)
  ) {
    const causes = error.errors
      .slice(0, 3)
      .map((cause) => (cause instanceof Error ? cause.message : String(cause)))
    const rest = error.errors.length - causes.length
    return new Error(
      `${error.errors.length} 個檔案操作失敗：${causes.join('；')}${
        rest > 0 ? `（另有 ${rest} 個）` : ''
      }`
    )
  }
  return error
}

// git.add fans out over every path it is given at once, so a whole CJK font in
// one call means tens of thousands of concurrent OPFS operations. Each call also
// rewrites the entire index, which is why one path per call is quadratic
// (measured: ~7.9ms/file one at a time against ~1.3ms/file batched). Chunking
// bounds the concurrency while keeping the index rewrites to a few dozen.
const STAGE_CHUNK_SIZE = 256

// Stages exactly the paths the caller names, so a CJK-scale worktree never gets
// hashed wholesale by a status scan.
export const stageWorktreePaths = async (input: {
  worktree: GitWorktree
  writtenPaths: readonly string[]
  removedPaths?: readonly string[]
}) => {
  for (
    let index = 0;
    index < input.writtenPaths.length;
    index += STAGE_CHUNK_SIZE
  ) {
    try {
      await git.add({
        fs: input.worktree.fs,
        dir: input.worktree.dir,
        filepath: input.writtenPaths.slice(index, index + STAGE_CHUNK_SIZE),
      })
    } catch (error) {
      throw describeGitFailure(error)
    }
  }
  for (const path of input.removedPaths ?? []) {
    await git
      .remove({
        fs: input.worktree.fs,
        dir: input.worktree.dir,
        filepath: path,
      })
      .catch(() => undefined)
  }
}

// Points HEAD at the branch a commit should land on. Creating the branch only
// moves HEAD: the worktree is rewritten from canonical records right after, so
// there is no reason to make git check out tens of thousands of files.
export const checkoutWorktreeBranch = async (input: {
  worktree: GitWorktree
  branch: string
  startAt?: string | null
}) => {
  const { worktree } = input
  const existing = await git
    .listBranches({ fs: worktree.fs, dir: worktree.dir })
    .catch(() => [] as string[])

  if (existing.includes(input.branch)) {
    await git.checkout({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: input.branch,
      noCheckout: true,
    })
    return
  }

  await git.branch({
    fs: worktree.fs,
    dir: worktree.dir,
    ref: input.branch,
    checkout: true,
    ...(input.startAt ? { object: input.startAt } : {}),
  })
}

// Empties the index. Moving HEAD with noCheckout leaves the index describing
// the branch we came from, and a commit takes its tree from the index — so
// without this the next commit would carry the old branch's files onto the new
// one. Clearing is enough because the index is rebuilt from canonical records
// plus the base commit before anything is committed; the alternative, checking
// the tree out, would write a whole CJK font to disk just to fix bookkeeping.
export const resetWorktreeIndex = async (worktree: GitWorktree) => {
  await worktree.fs.promises
    .unlink(`${worktree.dir}/.git/index`)
    .catch(() => undefined)
}

export const commitWorktree = async (input: {
  worktree: GitWorktree
  message: string
  author?: GitCommitAuthor
}) =>
  git.commit({
    fs: input.worktree.fs,
    dir: input.worktree.dir,
    message: input.message,
    author: input.author ?? DEFAULT_COMMIT_AUTHOR,
  })

// Deletes the whole repository. The worktree is rebuildable from IndexedDB, so
// discarding it is always a valid recovery step.
export const discardGitWorktree = async (input: {
  projectId: string
  store?: FileStore
}) => {
  const store =
    input.store ?? createOpfsFileStore(await navigator.storage.getDirectory())
  await store.removeDir(`${KUMIKO_GIT_ROOT}/${input.projectId}`, {
    recursive: true,
  })
}
