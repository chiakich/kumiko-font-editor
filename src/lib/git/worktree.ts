import 'src/lib/git/nodeGlobals'
import git from 'isomorphic-git'
import { createGitFs, type GitFs } from 'src/lib/git/gitFileSystem'
import { createOpfsFileStore } from 'src/lib/git/opfsFileStore'
import type { FileStore } from 'src/lib/git/fileStore'
import {
  listUfoTreePaths,
  materializeUfoTree,
} from 'src/lib/fontFormats/ufoMaterialize'

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
// cache, so anything the project no longer produces is removed rather than left
// behind to be committed by accident.
//
// Scope 'auto' rebuilds everything the first time (an empty repository has
// nothing to reuse) and afterwards writes only what changed. Deletions are
// still detected in full, because the expected path list comes from project
// metadata and never loads glyph geometry.
export const syncWorktreeFromProject = async (input: {
  projectId: string
  worktree: GitWorktree
  scope?: 'auto' | 'all' | 'dirty'
  // Files the project does not produce (README, licence, build tooling) are
  // carried through untouched: they are tracked but must never be treated as
  // "the project no longer produces this, so delete it".
  isManaged?: (path: string) => boolean
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
  const isManaged = input.isManaged ?? (() => true)
  const removedPaths = [...tracked].filter(
    (path) => isManaged(path) && !expected.has(path)
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
