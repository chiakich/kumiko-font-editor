import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import git from 'isomorphic-git'
import {
  openGitWorktree,
  syncWorktreeFromProject,
  stageWorktreePaths,
  commitWorktree,
} from 'src/lib/git/worktree'
import { saveProjectDraft } from 'src/lib/project/projectRepository'
import {
  loadKumikoGlyphRecord,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecord,
  saveKumikoProjectRecord,
} from 'src/lib/project/kumikoProjectPersistence'
import { createMemoryFileStore } from './memoryFileStore'
import type { FileStore } from 'src/lib/git/fileStore'
import type { FontData } from 'src/store'

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)
vi.stubGlobal('Node', window.Node)
vi.stubGlobal('self', { location: { origin: 'https://kumiko.test' } })

const fetchRemoteBranch = vi.fn()

vi.mock('src/lib/git/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('src/lib/git/remote')>()
  return {
    ...actual,
    fetchRemoteBranch: (input: unknown) => fetchRemoteBranch(input),
    pushBranch: vi.fn(async () => ({ ok: true })),
  }
})

const {
  applyGitRemoteChanges,
  buildGitSyncReport,
  commitAndPushProject,
  markGitCommitSynced,
  readRemoteUfoFolders,
  switchGitProjectBranch,
} = await import('src/lib/git/gitSync')

const makeFontData = (width: number): FontData => ({
  glyphOrder: ['A'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicodes: ['0041'],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
      layers: {
        'public.default': {
          id: 'public.default',
          name: 'public.default',
          type: 'master',
          associatedMasterId: 'public.default',
          paths: [],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics: { width, lsb: 0, rsb: width },
        },
      },
    },
  },
})

const saveProject = async (
  projectId: string,
  width = 500,
  githubSource: { commitSha: string | null } | null = null
) =>
  saveProjectDraft({
    id: projectId,
    title: 'Kumiko',
    lastModified: 2,
    createdAt: 1,
    updatedAt: 2,
    sourceName: 'Kumiko.ufo',
    sourceType: 'github',
    githubSource: githubSource
      ? {
          owner: 'owner',
          repo: 'repo',
          ref: 'main',
          defaultBranch: 'main',
          repoUrl: 'https://github.com/owner/repo',
          zipballUrl: 'https://codeload.github.com/owner/repo/zip/main',
          archiveRoot: 'repo-main',
          commitSha: githubSource.commitSha,
        }
      : null,
    fontData: makeFontData(width),
    projectMetadata: null,
    projectSourceData: {
      ufo: {
        designspace: null,
        designspacePath: null,
        lastSync: null,
        ufos: [
          {
            ufoId: 'Kumiko.ufo',
            relativePath: 'Kumiko.ufo',
            defaultLayerId: 'public.default',
            layers: [{ layerId: 'public.default', glyphDir: 'glyphs' }],
            contents: { A: 'A.glif' },
            glyphOrder: ['A'],
            metainfo: {},
            fontinfoExtra: {},
            libExtra: {},
            groupsExtra: {},
            kerningExtra: {},
          },
        ],
      },
    },
    projectSourceFormat: 'ufo',
    projectRoundTripFormat: 'ufo',
    projectGlyphsPackage: null,
  })

// Commits the current canonical tree, then plants a diverged "remote" commit and
// rewinds local HEAD, so the report sees a real merge base.
const seedRepo = async (projectId: string, store: FileStore) => {
  const worktree = await openGitWorktree({ projectId, store })
  const synced = await syncWorktreeFromProject({ projectId, worktree })
  await stageWorktreePaths({ worktree, ...synced })
  const base = await commitWorktree({ worktree, message: 'base' })
  return { worktree, base }
}

const plantRemoteCommit = async (
  worktree: Awaited<ReturnType<typeof openGitWorktree>>,
  base: string,
  edits: Record<string, string>
) => {
  for (const [path, text] of Object.entries(edits)) {
    await worktree.fs.promises.writeFile(`${worktree.dir}/${path}`, text)
    await git.add({ fs: worktree.fs, dir: worktree.dir, filepath: path })
  }
  const remote = await git.commit({
    fs: worktree.fs,
    dir: worktree.dir,
    message: 'remote work',
    author: { name: 'Other', email: 'other@example.test' },
  })
  await git.writeRef({
    fs: worktree.fs,
    dir: worktree.dir,
    ref: 'refs/remotes/origin/main',
    value: remote,
    force: true,
  })
  await git.writeRef({
    fs: worktree.fs,
    dir: worktree.dir,
    ref: 'refs/heads/main',
    value: base,
    force: true,
  })
  return remote
}

const target = (projectId: string) => ({
  projectId,
  repo: 'owner/repo',
  branch: 'main',
})

beforeEach(() => {
  fetchRemoteBranch.mockReset()
})

describe('git sync report', () => {
  it('reports a clean tree when local matches the remote head', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-clean')
    const { worktree, base } = await seedRepo('gs-clean', store)
    await git.writeRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'refs/remotes/origin/main',
      value: base,
      force: true,
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: base,
      mergeBaseSha: base,
      localHeadSha: base,
    })

    const report = await buildGitSyncReport({
      target: target('gs-clean'),
      store,
    })

    expect(report.conflicts).toHaveLength(0)
    expect(report.remoteChanges).toHaveLength(0)
    expect(report.localChanges).toHaveLength(0)
    expect(report.isUpToDate).toBe(true)
  })

  // A project imported from GitHub has never committed locally, so there is no
  // merge base to compare against.
  it('uses the imported commit as the base when there is no local history', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-imported')
    const { worktree, base } = await seedRepo('gs-imported', store)
    // re-save with the commit the import came from, now that it exists
    await saveProject('gs-imported', 500, { commitSha: base })
    await git.writeRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'refs/remotes/origin/main',
      value: base,
      force: true,
    })
    await git.deleteRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'refs/heads/main',
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: base,
      mergeBaseSha: null,
      localHeadSha: null,
    })

    const report = await buildGitSyncReport({
      target: target('gs-imported'),
      store,
    })

    expect(report.mergeBaseSha).toBe(base)
    expect(report.conflicts).toHaveLength(0)
    expect(report.isUpToDate).toBe(true)
  })

  // Without a base, a locally edited glyph reads as "changed on both sides" —
  // the false-conflict avalanche that made a whole imported font unusable.
  it('reads a local edit as a local change, not a conflict, once the base is known', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-imported-edit')
    const { worktree, base } = await seedRepo('gs-imported-edit', store)
    await saveProject('gs-imported-edit', 500, { commitSha: base })
    await git.writeRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'refs/remotes/origin/main',
      value: base,
      force: true,
    })
    await git.deleteRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'refs/heads/main',
    })
    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-imported-edit', 'A')
    )
    await saveKumikoGlyphRecord({
      ...glyph!,
      syncDirty: 1,
      layers: {
        ...glyph!.layers,
        'public.default': {
          ...glyph!.layers['public.default']!,
          metrics: { width: 812, lsb: 0, rsb: 812 },
        },
      },
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: base,
      mergeBaseSha: null,
      localHeadSha: null,
    })

    const report = await buildGitSyncReport({
      target: target('gs-imported-edit'),
      store,
    })

    expect(report.conflicts).toHaveLength(0)
    expect(report.localChanges.map((entry) => entry.path)).toContain(
      'Kumiko.ufo/glyphs/A.glif'
    )
  })

  it('detects a remote-only change as a pullable update', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-remote')
    const { worktree, base } = await seedRepo('gs-remote', store)
    const remote = await plantRemoteCommit(worktree, base, {
      'Kumiko.ufo/fontinfo.plist': '<plist>remote</plist>',
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: remote,
      mergeBaseSha: base,
      localHeadSha: base,
    })

    const report = await buildGitSyncReport({
      target: target('gs-remote'),
      store,
    })

    expect(report.remoteChanges.map((entry) => entry.path)).toContain(
      'Kumiko.ufo/fontinfo.plist'
    )
    expect(report.conflicts).toHaveLength(0)
    expect(report.isUpToDate).toBe(false)
  })

  it('detects a local-only edit without calling it a conflict', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-local')
    const { worktree, base } = await seedRepo('gs-local', store)
    await git.writeRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'refs/remotes/origin/main',
      value: base,
      force: true,
    })

    // Move the canonical glyph so the materializer now differs from the base.
    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-local', 'A')
    )
    await saveKumikoGlyphRecord({
      ...glyph!,
      syncDirty: 1,
      layers: {
        ...glyph!.layers,
        'public.default': {
          ...glyph!.layers['public.default']!,
          metrics: { width: 812, lsb: 0, rsb: 812 },
        },
      },
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: base,
      mergeBaseSha: base,
      localHeadSha: base,
    })

    const report = await buildGitSyncReport({
      target: target('gs-local'),
      store,
    })

    expect(report.localChanges.map((entry) => entry.path)).toContain(
      'Kumiko.ufo/glyphs/A.glif'
    )
    expect(report.conflicts).toHaveLength(0)
    // Local-only work still counts as up to date: there is nothing to pull.
    expect(report.isUpToDate).toBe(true)
  })

  it('detects a font-level edit without requiring a dirty glyph', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-local-font')
    const { worktree, base } = await seedRepo('gs-local-font', store)
    await git.writeRef({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'refs/remotes/origin/main',
      value: base,
      force: true,
    })

    const project = await loadKumikoProjectRecord('gs-local-font')
    await saveKumikoProjectRecord({
      ...project!,
      fontInfo: {
        ...project!.fontInfo,
        familyName: 'Renamed Kumiko',
      },
      syncDirty: 1,
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: base,
      mergeBaseSha: base,
      localHeadSha: base,
    })

    const report = await buildGitSyncReport({
      target: target('gs-local-font'),
      store,
    })

    expect(report.localChanges.map((entry) => entry.path)).toContain(
      'Kumiko.ufo/fontinfo.plist'
    )
    expect(report.conflicts).toHaveLength(0)
  })

  it('conflicts when the same path moved on both sides', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-conflict')
    const { worktree, base } = await seedRepo('gs-conflict', store)
    const remote = await plantRemoteCommit(worktree, base, {
      'Kumiko.ufo/glyphs/A.glif': '<glyph name="A">remote</glyph>',
    })

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-conflict', 'A')
    )
    await saveKumikoGlyphRecord({
      ...glyph!,
      syncDirty: 1,
      layers: {
        ...glyph!.layers,
        'public.default': {
          ...glyph!.layers['public.default']!,
          metrics: { width: 999, lsb: 0, rsb: 999 },
        },
      },
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: remote,
      mergeBaseSha: base,
      localHeadSha: base,
    })

    const report = await buildGitSyncReport({
      target: target('gs-conflict'),
      store,
    })

    expect(report.conflicts.map((entry) => entry.path)).toEqual([
      'Kumiko.ufo/glyphs/A.glif',
    ])
    expect(report.conflicts[0]?.entity).toEqual({ kind: 'glyph', name: 'A' })
  })

  it('reports a remote addition the project does not have', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-added')
    const { worktree, base } = await seedRepo('gs-added', store)
    const remote = await plantRemoteCommit(worktree, base, {
      'Kumiko.ufo/glyphs/B_.glif': '<glyph name="B"/>',
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: remote,
      mergeBaseSha: base,
      localHeadSha: base,
    })

    const report = await buildGitSyncReport({
      target: target('gs-added'),
      store,
    })

    const added = report.entries.find(
      (entry) => entry.path === 'Kumiko.ufo/glyphs/B_.glif'
    )
    expect(added?.status).toBe('remoteAdded')
    expect(added?.entity).toEqual({ kind: 'glyph', name: 'B_' })
  })
})

describe('commit and push', () => {
  it('commits the materialized tree onto the requested branch', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-push')

    const result = await commitAndPushProject({
      projectId: 'gs-push',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-1',
      message: 'Update A',
      store,
    })

    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(result.pushedRepo).toBe('contributor/repo')
    expect(result.pushedBranch).toBe('kumiko/patch-1')

    const worktree = await openGitWorktree({ projectId: 'gs-push', store })
    const blob = await git.readBlob({
      fs: worktree.fs,
      dir: worktree.dir,
      oid: result.commitSha,
      filepath: 'Kumiko.ufo/glyphs/A.glif',
    })
    expect(new TextDecoder().decode(blob.blob)).toContain('<glyph')
  })

  // A commit is built from the index, which on a fresh worktree holds only what
  // Kumiko staged. This wiped a real repository's README, licence and tooling.
  it('keeps files the project does not manage', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-push-unmanaged')
    const worktree = await openGitWorktree({
      projectId: 'gs-push-unmanaged',
      store,
    })
    // an upstream commit carrying both font sources and ordinary repo files
    for (const [path, text] of Object.entries({
      'README.md': '# JYRounded\n',
      LICENSE: 'OFL\n',
      'docs/CONTRIBUTING.md': 'contribute\n',
      'Kumiko.ufo/glyphs/A.glif': '<glyph name="A"/>',
    })) {
      await worktree.fs.promises.writeFile(`${worktree.dir}/${path}`, text)
      await git.add({ fs: worktree.fs, dir: worktree.dir, filepath: path })
    }
    const upstream = await git.commit({
      fs: worktree.fs,
      dir: worktree.dir,
      message: 'upstream',
      author: { name: 'Other', email: 'other@example.test' },
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: upstream,
      mergeBaseSha: null,
      localHeadSha: null,
    })

    const result = await commitAndPushProject({
      projectId: 'gs-push-unmanaged',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-unmanaged',
      baseRepo: 'upstream/repo',
      baseBranch: 'main',
      message: "Add '珢'",
      store,
    })

    const committed = new Set<string>()
    await git.walk({
      fs: worktree.fs,
      dir: worktree.dir,
      trees: [git.TREE({ ref: result.commitSha })],
      map: async (path, [entry]) => {
        if (path !== '.' && (await entry?.type()) === 'blob') {
          committed.add(path)
        }
      },
    })

    expect([...committed]).toEqual(
      expect.arrayContaining([
        'README.md',
        'LICENSE',
        'docs/CONTRIBUTING.md',
        'Kumiko.ufo/glyphs/A.glif',
      ])
    )
  })

  it('lands the commit on the named branch, not on main', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-push-branch')

    const result = await commitAndPushProject({
      projectId: 'gs-push-branch',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-2',
      message: 'Update A',
      store,
    })

    const worktree = await openGitWorktree({
      projectId: 'gs-push-branch',
      store,
    })
    expect(
      await git.resolveRef({
        fs: worktree.fs,
        dir: worktree.dir,
        ref: 'kumiko/patch-2',
      })
    ).toBe(result.commitSha)
    expect(
      await git.currentBranch({ fs: worktree.fs, dir: worktree.dir })
    ).toBe('kumiko/patch-2')
  })

  it('reuses an existing branch on a second commit', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-push-reuse')

    const first = await commitAndPushProject({
      projectId: 'gs-push-reuse',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-3',
      message: 'first',
      store,
    })

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-push-reuse', 'A')
    )
    await saveKumikoGlyphRecord({
      ...glyph!,
      layers: {
        ...glyph!.layers,
        'public.default': {
          ...glyph!.layers['public.default']!,
          metrics: { width: 640, lsb: 0, rsb: 640 },
        },
      },
    })

    const second = await commitAndPushProject({
      projectId: 'gs-push-reuse',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-3',
      message: 'second',
      store,
    })

    expect(second.commitSha).not.toBe(first.commitSha)
    const worktree = await openGitWorktree({
      projectId: 'gs-push-reuse',
      store,
    })
    const log = await git.log({
      fs: worktree.fs,
      dir: worktree.dir,
      ref: 'kumiko/patch-3',
    })
    expect(log.map((entry) => entry.commit.message.trim())).toEqual([
      'second',
      'first',
    ])
  })

  it('does not refetch upstream when updating an existing change draft', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-push-no-refetch')
    await commitAndPushProject({
      projectId: 'gs-push-no-refetch',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-4',
      message: 'first',
      store,
    })
    fetchRemoteBranch.mockClear()

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-push-no-refetch', 'A')
    )
    await saveKumikoGlyphRecord({
      ...glyph!,
      syncDirty: 1,
      layers: {
        ...glyph!.layers,
        'public.default': {
          ...glyph!.layers['public.default']!,
          metrics: { width: 720, lsb: 0, rsb: 720 },
        },
      },
    })

    await commitAndPushProject({
      projectId: 'gs-push-no-refetch',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-4',
      baseRepo: 'upstream/repo',
      baseBranch: 'main',
      message: 'second',
      store,
    })

    expect(fetchRemoteBranch).not.toHaveBeenCalled()
  })
})

describe('applying remote changes from git', () => {
  it('writes remote glyph content back into canonical records', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-apply')
    const { worktree, base } = await seedRepo('gs-apply', store)
    const remoteGlif = `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="A" format="2">
  <advance width="1234"/>
  <unicode hex="0041"/>
  <outline></outline>
</glyph>`
    const remote = await plantRemoteCommit(worktree, base, {
      'Kumiko.ufo/glyphs/A.glif': remoteGlif,
    })

    const result = await applyGitRemoteChanges({
      projectId: 'gs-apply',
      remoteHeadSha: remote,
      store,
      report: {
        target: { owner: 'owner', repo: 'repo', ref: 'main' },
        remoteHeadSha: remote,
        remoteTreeTruncated: false,
        entries: [
          {
            kind: 'glyph',
            glyphName: 'A',
            fileName: 'A.glif',
            path: 'Kumiko.ufo/glyphs/A.glif',
            status: 'remoteModified',
            baselineSha: base,
            remoteSha: remote,
          },
        ],
        conflicts: [],
        remoteChanges: [],
        localChanges: [],
        isUpToDate: false,
      },
    })

    expect(result.appliedCount).toBe(1)
    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-apply', 'A')
    )
    expect(glyph?.layers['public.default']?.metrics.width).toBe(1234)
    expect(glyph?.syncDirty).toBe(0)
  })

  it('leaves an unresolved conflict for the user to decide', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-apply-conflict')
    const { worktree, base } = await seedRepo('gs-apply-conflict', store)
    const remote = await plantRemoteCommit(worktree, base, {
      'Kumiko.ufo/glyphs/A.glif': '<glyph name="A"/>',
    })

    const result = await applyGitRemoteChanges({
      projectId: 'gs-apply-conflict',
      remoteHeadSha: remote,
      store,
      report: {
        target: { owner: 'owner', repo: 'repo', ref: 'main' },
        remoteHeadSha: remote,
        remoteTreeTruncated: false,
        entries: [
          {
            kind: 'glyph',
            glyphName: 'A',
            fileName: 'A.glif',
            path: 'Kumiko.ufo/glyphs/A.glif',
            status: 'conflict',
            baselineSha: base,
            remoteSha: remote,
          },
        ],
        conflicts: [],
        remoteChanges: [],
        localChanges: [],
        isUpToDate: false,
      },
    })

    expect(result.remainingConflicts).toBe(1)
    expect(result.appliedCount).toBe(0)
  })
})

describe('reading the remote side of a pull', () => {
  it('includes font-level files even when only a glyph changed', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-read-remote')
    const { worktree, base } = await seedRepo('gs-read-remote', store)
    const remote = await plantRemoteCommit(worktree, base, {
      'Kumiko.ufo/glyphs/A.glif': '<glyph name="A"/>',
    })

    const folders = await readRemoteUfoFolders({
      worktree,
      remoteHeadSha: remote,
      projectId: 'gs-read-remote',
      paths: ['Kumiko.ufo/glyphs/A.glif'],
    })

    expect(folders).toHaveLength(1)
    expect(folders[0]?.relativePath).toBe('Kumiko.ufo')
    expect(folders[0]?.files['glyphs/A.glif']).toBe('<glyph name="A"/>')
    expect(folders[0]?.files['fontinfo.plist']).toContain('plist')
  })

  it('omits paths the remote commit does not have', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-read-missing')
    const { worktree, base } = await seedRepo('gs-read-missing', store)

    const folders = await readRemoteUfoFolders({
      worktree,
      remoteHeadSha: base,
      projectId: 'gs-read-missing',
      paths: ['Kumiko.ufo/glyphs/Nope.glif'],
    })

    expect(folders[0]?.files).not.toHaveProperty('glyphs/Nope.glif')
  })
})

describe('bookkeeping after a git commit', () => {
  it('records the file names the commit actually wrote', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-mark')
    await saveProject('gs-mark', 500, { commitSha: null })

    const pushed = await commitAndPushProject({
      projectId: 'gs-mark',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch',
      message: 'Update A',
      store,
    })
    await markGitCommitSynced({
      projectId: 'gs-mark',
      pushedRepo: pushed.pushedRepo,
      pushedBranch: pushed.pushedBranch,
      commitSha: pushed.commitSha,
      writtenPaths: pushed.writtenPaths,
    })

    const project = await loadKumikoProjectRecord('gs-mark')
    expect(project?.sourceData?.ufo?.ufos?.[0]?.contents).toEqual({
      A: 'A.glif',
    })
    expect(project?.syncDirty).toBe(0)
    expect(project?.sourceData?.ufo?.lastSync).toMatchObject({
      owner: 'contributor',
      repo: 'repo',
      ref: 'kumiko/patch',
      commitSha: pushed.commitSha,
    })
    expect(project?.sourceData?.ufo?.gitCollaboration).toMatchObject({
      base: { owner: 'owner', repo: 'repo', ref: 'main' },
      changeDrafts: [
        {
          owner: 'contributor',
          repo: 'repo',
          ref: 'kumiko/patch',
          commitSha: pushed.commitSha,
        },
      ],
    })
  })

  it('clears the dirty flag on the committed glyphs', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-mark-clean')
    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-mark-clean', 'A')
    )
    await saveKumikoGlyphRecord({ ...glyph!, syncDirty: 1 })

    const pushed = await commitAndPushProject({
      projectId: 'gs-mark-clean',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch',
      message: 'Update A',
      store,
    })
    await markGitCommitSynced({
      projectId: 'gs-mark-clean',
      pushedRepo: pushed.pushedRepo,
      pushedBranch: pushed.pushedBranch,
      commitSha: pushed.commitSha,
      writtenPaths: pushed.writtenPaths,
    })

    const updated = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-mark-clean', 'A')
    )
    expect(updated?.syncDirty).toBe(0)
    // git tracks the baseline in the commit, so no per-glyph blob sha is written.
    expect(updated?.sourceData?.ufo?.remoteBlobShaByUfoId ?? null).toBeNull()
  })
})

describe('switching git collaboration branches', () => {
  it('hydrates the selected branch and keeps a submitted draft after returning to the base', async () => {
    const store = createMemoryFileStore()
    await saveProject('gs-switch')
    const { base } = await seedRepo('gs-switch', store)
    await saveProject('gs-switch', 500, { commitSha: base })

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-switch', 'A')
    )
    await saveKumikoGlyphRecord({
      ...glyph!,
      syncDirty: 1,
      layers: {
        ...glyph!.layers,
        'public.default': {
          ...glyph!.layers['public.default']!,
          metrics: { width: 812, lsb: 0, rsb: 812 },
        },
      },
    })
    const pushed = await commitAndPushProject({
      projectId: 'gs-switch',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-switch',
      message: 'Update A',
      store,
    })
    await markGitCommitSynced({
      projectId: 'gs-switch',
      pushedRepo: pushed.pushedRepo,
      pushedBranch: pushed.pushedBranch,
      commitSha: pushed.commitSha,
      writtenPaths: pushed.writtenPaths,
    })
    fetchRemoteBranch.mockResolvedValue({
      remoteHeadSha: base,
      mergeBaseSha: base,
      localHeadSha: pushed.commitSha,
    })

    await switchGitProjectBranch({
      target: target('gs-switch'),
      store,
    })

    const switchedGlyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gs-switch', 'A')
    )
    const project = await loadKumikoProjectRecord('gs-switch')
    expect(switchedGlyph?.layers['public.default']?.metrics.width).toBe(500)
    expect(project?.sourceData?.ufo?.lastSync).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      commitSha: base,
    })
    expect(project?.sourceData?.ufo?.gitCollaboration).toMatchObject({
      base: { owner: 'owner', repo: 'repo', ref: 'main' },
      changeDrafts: [
        {
          owner: 'contributor',
          repo: 'repo',
          ref: 'kumiko/patch-switch',
          commitSha: pushed.commitSha,
        },
      ],
    })
  })
})
