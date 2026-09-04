import '@/lib/git/nodeGlobals'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import type { GitWorktree } from '@/lib/git/worktree'

// Everything git-over-HTTP goes through our own origin: the credential stays in
// the httpOnly session cookie and is injected server side.
export const gitProxyUrlFor = (repo: string) => {
  const [owner, name] = repo.split('/')
  if (!owner || !name) {
    throw new Error(`repo 必須是 owner/repo：${repo}`)
  }
  // self.location works on both the window and a worker; the proxy is always
  // same-origin so the session cookie rides along.
  return `${self.location.origin}/api/github/git/${owner}/${name}`
}

const REMOTE_NAME = 'origin'

export const trackingRefFor = (branch: string) =>
  `refs/remotes/${REMOTE_NAME}/${branch}`

export interface FetchRemoteResult {
  // The commit the remote branch points at.
  remoteHeadSha: string
  // Null when the two histories share no commit, or nothing local exists yet.
  mergeBaseSha: string | null
  localHeadSha: string | null
}

// isomorphic-git surfaces only `HTTP Error: 401`, hiding both the proxy's own
// "not logged in" JSON and GitHub's reason for refusing the token.
const withRemoteErrorContext = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run()
  } catch (error) {
    if (
      error instanceof git.Errors.HttpError &&
      (error.data.statusCode === 401 || error.data.statusCode === 403)
    ) {
      const detail = error.data.response?.trim()
      throw new Error(
        `GitHub 拒絕這次 git 連線（HTTP ${error.data.statusCode}）：${
          detail || '請重新登入 GitHub 後再試。'
        }`
      )
    }
    throw error
  }
}

const resolveOrNull = async (worktree: GitWorktree, ref: string) => {
  try {
    return await git.resolveRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref,
    })
  } catch {
    return null
  }
}

// Fetches one branch and reports the merge base against local HEAD. The merge
// base replaces per-file baselines: one commit describes the last shared state.
export const fetchRemoteBranch = async (input: {
  worktree: GitWorktree
  repo: string
  branch: string
  depth?: number
}): Promise<FetchRemoteResult> => {
  const { worktree } = input

  // git.fetch resolves the tracking refs through `remote.origin.fetch`, so the
  // refspec has to exist in the config before fetching. The url is rewritten
  // every time because fetch and push can target different repositories.
  await git.addRemote({
    fs: worktree.fs,
    dir: worktree.dir,
    remote: REMOTE_NAME,
    url: gitProxyUrlFor(input.repo),
    force: true,
  })

  await withRemoteErrorContext(() =>
    git.fetch({
      fs: worktree.fs,
      http,
      dir: worktree.dir,
      url: gitProxyUrlFor(input.repo),
      remote: REMOTE_NAME,
      ref: input.branch,
      singleBranch: true,
      tags: false,
      // Credentials ride on the proxy's session cookie.
      headers: {},
      ...(input.depth ? { depth: input.depth } : {}),
    })
  )

  const remoteHeadSha = await resolveOrNull(
    worktree,
    trackingRefFor(input.branch)
  )
  if (!remoteHeadSha) {
    throw new Error(`抓取後找不到遠端分支：${input.branch}`)
  }

  const localHeadSha = await resolveOrNull(worktree, 'HEAD')
  if (!localHeadSha) {
    return { remoteHeadSha, mergeBaseSha: null, localHeadSha: null }
  }

  const bases = await git.findMergeBase({
    fs: worktree.fs,
    dir: worktree.dir,
    oids: [localHeadSha, remoteHeadSha],
  })

  return {
    remoteHeadSha,
    localHeadSha,
    mergeBaseSha: bases[0] ?? null,
  }
}

// Pushes a local ref to a possibly different repository — contributors fetch
// from upstream and push to their own fork, so the two repos differ.
export const pushBranch = async (input: {
  worktree: GitWorktree
  repo: string
  localRef: string
  remoteRef?: string
  force?: boolean
}) => {
  const result = await withRemoteErrorContext(() =>
    git.push({
      fs: input.worktree.fs,
      http,
      dir: input.worktree.dir,
      url: gitProxyUrlFor(input.repo),
      ref: input.localRef,
      remoteRef: input.remoteRef ?? input.localRef,
      force: input.force ?? false,
      headers: {},
    })
  )

  if (result.ok === false || result.error) {
    throw new Error(result.error ?? 'git push 被遠端拒絕')
  }
  return result
}

// Reads one path out of a commit, returning null when the commit lacks it.
// isomorphic-git funnels a missing path, a missing object and a failed object
// read all into NotFoundError, so those cannot be told apart here; the catch is
// still narrowed so any other error class surfaces instead of reading as absent.
export const readBlobAtCommit = async (input: {
  worktree: GitWorktree
  oid: string
  filepath: string
}): Promise<string | null> => {
  try {
    const blob = await git.readBlob({
      fs: input.worktree.fs,
      dir: input.worktree.dir,
      oid: input.oid,
      filepath: input.filepath,
    })
    return new TextDecoder().decode(blob.blob)
  } catch (error) {
    if (
      error instanceof git.Errors.NotFoundError ||
      error instanceof git.Errors.ObjectTypeError
    ) {
      return null
    }
    throw error
  }
}
