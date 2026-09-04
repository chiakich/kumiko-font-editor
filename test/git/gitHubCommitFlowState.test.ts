import { describe, expect, it } from 'vitest'
import type { GitHubForkStatus } from '@/lib/github/githubAuth'
import type { GitHubSyncTarget } from '@/lib/github/sync/types'
import {
  buildForkStatusPatchAfterCommit,
  createEmptyCommitDraft,
  isActiveSubmittedDraft,
  mergeCommitDraft,
  resolveActiveCommitDraft,
  resolveForkStatusOverride,
  resolveOpenModalDraftUpdate,
  resolveVoidedLineKeys,
  toGitHubSubmitResult,
  toggleVoidedLineKey,
} from '@/features/common/glyphInspector/utils/gitHubCommitFlowState'

const repo = (owner: string, name: string) => ({
  owner,
  repo: name,
  fullName: `${owner}/${name}`,
  defaultBranch: 'main',
  htmlUrl: '',
  canPush: owner === 'contributor',
})

const forkStatus: GitHubForkStatus = {
  viewerLogin: 'contributor',
  sourceRepo: repo('upstream', 'font'),
  targetRepo: repo('contributor', 'font'),
  forked: true,
  canDirectCommit: false,
  branches: ['main', 'kumiko/a-b'],
  selectedBranch: null,
  compare: null,
}

const target = (
  owner: string,
  ref: string,
  overrides: Partial<GitHubSyncTarget> = {}
): GitHubSyncTarget => ({
  owner,
  repo: 'font',
  ref,
  commitSha: null,
  syncedAt: 0,
  ...overrides,
})

describe('scoped commit draft', () => {
  const draft = {
    repoFullName: 'upstream/font',
    commitMessage: 'Update A',
    branchName: 'kumiko/a',
    isCreatingNewBranch: true,
  }

  it('keeps the draft only for the repo it was typed against', () => {
    expect(resolveActiveCommitDraft(draft, 'upstream/font')).toBe(draft)
    expect(resolveActiveCommitDraft(draft, 'other/font')).toEqual(
      createEmptyCommitDraft('other/font')
    )
  })

  it('merges into an empty draft when the repo changed', () => {
    expect(
      mergeCommitDraft(draft, 'upstream/font', { branchName: 'x' })
    ).toEqual({ ...draft, branchName: 'x' })
    expect(
      mergeCommitDraft(draft, 'other/font', { commitMessage: 'New' })
    ).toEqual({ ...createEmptyCommitDraft('other/font'), commitMessage: 'New' })
  })
})

describe('scoped fork status override and voided lines', () => {
  it('drops the override without a GitHub source or for another repo', () => {
    const state = { repoFullName: 'upstream/font', forkStatus }
    expect(resolveForkStatusOverride(state, 'upstream/font', true)).toBe(
      forkStatus
    )
    expect(resolveForkStatusOverride(state, 'upstream/font', false)).toBeNull()
    expect(resolveForkStatusOverride(state, 'other/font', true)).toBeNull()
  })

  it('scopes voided keys by repo and toggles a key', () => {
    const lines = { repoFullName: 'upstream/font', keys: ['glyph:A'] }
    expect(resolveVoidedLineKeys(lines, 'upstream/font')).toEqual(['glyph:A'])
    expect(resolveVoidedLineKeys(lines, 'other/font')).toEqual([])
    expect(toggleVoidedLineKey(['glyph:A'], 'glyph:B')).toEqual([
      'glyph:A',
      'glyph:B',
    ])
    expect(toggleVoidedLineKey(['glyph:A', 'glyph:B'], 'glyph:A')).toEqual([
      'glyph:B',
    ])
  })
})

describe('restoring the branch selection when the modal opens', () => {
  const activeTarget = target('contributor', 'kumiko/a-b')

  it('leaves an explicit selection alone', () => {
    expect(
      resolveOpenModalDraftUpdate({
        selectedBranch: 'kumiko/mine',
        collaboration: { activeTarget, changeDrafts: [activeTarget] },
        forkStatus,
        localDirtyGlyphIds: ['A'],
      })
    ).toEqual({})
  })

  it('resumes the active draft when it was submitted from the fork', () => {
    expect(
      isActiveSubmittedDraft(
        { activeTarget, changeDrafts: [activeTarget] },
        forkStatus
      )
    ).toBe(true)
    expect(
      resolveOpenModalDraftUpdate({
        selectedBranch: '',
        collaboration: { activeTarget, changeDrafts: [activeTarget] },
        forkStatus,
        localDirtyGlyphIds: ['A'],
      })
    ).toEqual({ branchName: 'kumiko/a-b', isCreatingNewBranch: false })
  })

  it('suggests a new branch when the active target is upstream or unknown', () => {
    const upstream = target('upstream', 'main')
    expect(
      isActiveSubmittedDraft(
        { activeTarget: upstream, changeDrafts: [upstream] },
        forkStatus
      )
    ).toBe(false)
    expect(
      isActiveSubmittedDraft({ activeTarget, changeDrafts: [] }, forkStatus)
    ).toBe(false)
    expect(
      resolveOpenModalDraftUpdate({
        selectedBranch: '',
        collaboration: { activeTarget: upstream, changeDrafts: [upstream] },
        forkStatus,
        localDirtyGlyphIds: ['A', 'B', 'C'],
      })
    ).toEqual({ branchName: 'kumiko/a-b', isCreatingNewBranch: true })
  })
})

describe('after a commit lands', () => {
  const compare = {
    status: 'ahead',
    aheadBy: 1,
    behindBy: 0,
    compareUrl: 'https://github.com/upstream/font/compare/main...x',
  }

  it('adds a new branch to the front of the fork status list only once', () => {
    const result = {
      headOwner: 'contributor',
      branchName: 'kumiko/new',
      commitSha: 'a'.repeat(40),
      compare,
    }
    expect(buildForkStatusPatchAfterCommit(forkStatus, result)).toEqual({
      selectedBranch: 'kumiko/new',
      compare,
      branches: ['kumiko/new', 'main', 'kumiko/a-b'],
    })
    expect(
      buildForkStatusPatchAfterCommit(forkStatus, {
        ...result,
        branchName: 'main',
      }).branches
    ).toBe(forkStatus.branches)
  })

  it('maps the submission into the modal result shape', () => {
    expect(
      toGitHubSubmitResult({
        headOwner: 'contributor',
        branchName: 'kumiko/new',
        commitSha: 'abc',
        compare,
      })
    ).toEqual({
      branch: 'kumiko/new',
      commitSha: 'abc',
      compareUrl: compare.compareUrl,
    })
    expect(
      toGitHubSubmitResult({
        headOwner: 'contributor',
        branchName: 'kumiko/new',
        commitSha: 'abc',
        compare: null,
      }).compareUrl
    ).toBeNull()
  })
})
