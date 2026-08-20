import { describe, expect, it, vi } from 'vitest'
import git from 'isomorphic-git'
import { createGitFs } from 'src/lib/git/gitFileSystem'
import {
  fetchRemoteBranch,
  gitProxyUrlFor,
  readBlobAtCommit,
  trackingRefFor,
} from 'src/lib/git/remote'
import { createMemoryFileStore } from './memoryFileStore'

vi.stubGlobal('window', { location: { origin: 'https://kumiko.test' } })

const makeWorktree = async () => {
  const fs = createGitFs(createMemoryFileStore())
  const dir = '/repo'
  await git.init({ fs, dir, defaultBranch: 'main' })
  return { fs, dir }
}

const author = { name: 'Kumiko', email: 'kumiko@example.test' }

describe('git proxy url', () => {
  it('points at our own origin so the token stays server side', () => {
    expect(gitProxyUrlFor('owner/repo')).toBe(
      'https://kumiko.test/api/github/git/owner/repo'
    )
  })

  it('refuses a malformed repo', () => {
    expect(() => gitProxyUrlFor('owner')).toThrow('owner/repo')
  })
})

describe('tracking refs', () => {
  it('names the remote tracking ref for a branch', () => {
    expect(trackingRefFor('main')).toBe('refs/remotes/origin/main')
  })
})

describe('reading blobs at a commit', () => {
  it('returns the file content stored in that commit', async () => {
    const worktree = await makeWorktree()
    await worktree.fs.promises.writeFile('/repo/a.glif', '<glyph name="A"/>')
    await git.add({ fs: worktree.fs, dir: worktree.dir, filepath: 'a.glif' })
    const oid = await git.commit({
      fs: worktree.fs,
      dir: worktree.dir,
      message: 'add',
      author,
    })

    expect(await readBlobAtCommit({ worktree, oid, filepath: 'a.glif' })).toBe(
      '<glyph name="A"/>'
    )
  })

  it('returns null when the commit does not carry the path', async () => {
    const worktree = await makeWorktree()
    await worktree.fs.promises.writeFile('/repo/a.glif', 'a')
    await git.add({ fs: worktree.fs, dir: worktree.dir, filepath: 'a.glif' })
    const oid = await git.commit({
      fs: worktree.fs,
      dir: worktree.dir,
      message: 'add',
      author,
    })

    expect(
      await readBlobAtCommit({ worktree, oid, filepath: 'missing.glif' })
    ).toBeNull()
  })

  it('reads the older content from an earlier commit', async () => {
    const worktree = await makeWorktree()
    await worktree.fs.promises.writeFile('/repo/a.glif', 'first')
    await git.add({ fs: worktree.fs, dir: worktree.dir, filepath: 'a.glif' })
    const base = await git.commit({
      fs: worktree.fs,
      dir: worktree.dir,
      message: 'first',
      author,
    })
    await worktree.fs.promises.writeFile('/repo/a.glif', 'second')
    await git.add({ fs: worktree.fs, dir: worktree.dir, filepath: 'a.glif' })
    const head = await git.commit({
      fs: worktree.fs,
      dir: worktree.dir,
      message: 'second',
      author,
    })

    expect(
      await readBlobAtCommit({ worktree, oid: base, filepath: 'a.glif' })
    ).toBe('first')
    expect(
      await readBlobAtCommit({ worktree, oid: head, filepath: 'a.glif' })
    ).toBe('second')
  })
})

describe('remote auth failures', () => {
  it('reports what the remote said instead of a bare status code', async () => {
    const worktree = await makeWorktree()
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(
      async () => new Response('invalid credentials', { status: 401 })
    ) as typeof globalThis.fetch

    try {
      await expect(
        fetchRemoteBranch({ worktree, repo: 'owner/repo', branch: 'main' })
      ).rejects.toThrow(/401.*invalid credentials/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
