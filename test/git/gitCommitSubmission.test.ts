import { beforeEach, describe, expect, it, vi } from 'vitest'

const commitAndPushProject = vi.fn()
const fetchGitHubCompareStatus = vi.fn()

// The commit and its bookkeeping both run in the worker (see gitSyncWorker);
// what this file covers is which repo and branch the UI asks for, and how the
// result is presented back.
vi.mock('src/lib/git/gitSyncWorkerClient', () => ({
  commitAndPushProjectInWorker: (input: unknown) => commitAndPushProject(input),
}))
vi.mock('src/lib/github/githubAuth', () => ({
  fetchGitHubCompareStatus: (input: unknown) => fetchGitHubCompareStatus(input),
}))

const { commitThroughGit } =
  await import('src/features/common/glyphInspector/utils/gitCommitSubmission')

const forkStatus = {
  viewerLogin: 'contributor',
  sourceRepo: {
    owner: 'upstream',
    repo: 'font',
    fullName: 'upstream/font',
    defaultBranch: 'main',
    htmlUrl: '',
    canPush: false,
  },
  targetRepo: {
    owner: 'contributor',
    repo: 'font',
    fullName: 'contributor/font',
    defaultBranch: 'main',
    htmlUrl: '',
    canPush: true,
  },
  forked: true,
  canDirectCommit: false,
  branches: ['main'],
  selectedBranch: null,
  compare: null,
} as never

beforeEach(() => {
  commitAndPushProject.mockReset()
  fetchGitHubCompareStatus.mockReset()
  commitAndPushProject.mockResolvedValue({
    commitSha: 'a'.repeat(40),
    pushedRepo: 'contributor/font',
    pushedBranch: 'kumiko/patch-1',
    writtenPaths: ['Kumiko.ufo/glyphs/A_.glif'],
  })
  fetchGitHubCompareStatus.mockResolvedValue({ compare: { aheadBy: 1 } })
})

describe('committing through git', () => {
  it('pushes to the fork, not upstream', async () => {
    await commitThroughGit({
      projectId: 'p1',
      projectTitle: 'Kumiko',
      branchName: 'kumiko/patch-1',
      commitMessage: 'Update A',
      forkStatus,
    })

    expect(commitAndPushProject).toHaveBeenCalledWith(
      expect.objectContaining({
        pushRepo: 'contributor/font',
        pushBranch: 'kumiko/patch-1',
        message: 'Update A',
      })
    )
  })

  it('starts the patch branch from the upstream base branch', async () => {
    await commitThroughGit({
      projectId: 'p1',
      projectTitle: 'Kumiko',
      branchName: 'kumiko/patch-1',
      commitMessage: 'Update A',
      forkStatus,
    })

    expect(commitAndPushProject).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRepo: 'upstream/font',
        baseBranch: 'main',
      })
    )
  })

  it('reports the same shape the REST commit endpoint returns', async () => {
    const result = await commitThroughGit({
      projectId: 'p1',
      projectTitle: 'Kumiko',
      branchName: 'kumiko/patch-1',
      commitMessage: 'Update A',
      forkStatus,
    })

    expect(result).toEqual({
      headOwner: 'contributor',
      branchName: 'kumiko/patch-1',
      commitSha: 'a'.repeat(40),
      compare: { aheadBy: 1 },
    })
  })

  it('falls back to a project-titled message when none is given', async () => {
    await commitThroughGit({
      projectId: 'p1',
      projectTitle: 'Kumiko',
      branchName: 'kumiko/patch-1',
      commitMessage: '',
      forkStatus,
    })

    expect(commitAndPushProject).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Update Kumiko' })
    )
  })

  it('refuses to commit without a fork', async () => {
    await expect(
      commitThroughGit({
        projectId: 'p1',
        projectTitle: 'Kumiko',
        branchName: 'kumiko/patch-1',
        commitMessage: 'x',
        forkStatus: { ...(forkStatus as object), targetRepo: null } as never,
      })
    ).rejects.toThrow('fork')
    expect(commitAndPushProject).not.toHaveBeenCalled()
  })

  it('refuses to commit without a branch name', async () => {
    await expect(
      commitThroughGit({
        projectId: 'p1',
        projectTitle: 'Kumiko',
        branchName: '',
        commitMessage: 'x',
        forkStatus,
      })
    ).rejects.toThrow('branch')
    expect(commitAndPushProject).not.toHaveBeenCalled()
  })

  it('still reports the commit when compare status is unavailable', async () => {
    fetchGitHubCompareStatus.mockRejectedValue(new Error('offline'))

    const result = await commitThroughGit({
      projectId: 'p1',
      projectTitle: 'Kumiko',
      branchName: 'kumiko/patch-1',
      commitMessage: 'Update A',
      forkStatus,
    })

    expect(result.compare).toBeNull()
    expect(result.commitSha).toBe('a'.repeat(40))
  })
})
