import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import git from 'isomorphic-git'
import { openGitWorktree } from 'src/lib/git/worktree'
import { saveProjectDraft } from 'src/lib/project/projectRepository'
import {
  listSyncDirtyKumikoGlyphIds,
  loadKumikoGlyphRecord,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecord,
  updateKumikoGlyphExportDirtyState,
  updateKumikoGlyphSyncDirtyState,
} from 'src/lib/project/kumikoProjectPersistence'
import { createMemoryFileStore } from './memoryFileStore'
import type { FontData } from 'src/store'

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)
vi.stubGlobal('Node', window.Node)
vi.stubGlobal('self', { location: { origin: 'https://kumiko.test' } })

vi.mock('src/lib/git/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('src/lib/git/remote')>()
  return {
    ...actual,
    fetchRemoteBranch: vi.fn(),
    pushBranch: vi.fn(async () => ({ ok: true })),
  }
})

const { commitAndPushProject, markGitCommitSynced } =
  await import('src/lib/git/gitSync')

const layer = (width: number) => ({
  id: 'public.default',
  name: 'public.default',
  type: 'master' as const,
  associatedMasterId: 'public.default',
  paths: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { width, lsb: 0, rsb: width },
})

const makeFontData = (widthA: number, widthB: number): FontData => ({
  glyphOrder: ['A', 'B'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicodes: ['0041'],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
      layers: { 'public.default': layer(widthA) },
    },
    B: {
      id: 'B',
      name: 'B',
      unicodes: ['0042'],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
      layers: { 'public.default': layer(widthB) },
    },
  },
})

const saveProject = async (widthA = 500, widthB = 500) =>
  saveProjectDraft({
    id: 'partial',
    title: 'Kumiko',
    lastModified: 2,
    createdAt: 1,
    updatedAt: 2,
    sourceName: 'Kumiko.ufo',
    sourceType: 'github',
    githubSource: null,
    fontData: makeFontData(widthA, widthB),
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
            contents: { A: 'A.glif', B: 'B.glif' },
            glyphOrder: ['A', 'B'],
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

const widthInCommit = async (
  store: ReturnType<typeof createMemoryFileStore>,
  commitSha: string,
  filepath: string
) => {
  const worktree = await openGitWorktree({ projectId: 'partial', store })
  const blob = await git.readBlob({
    fs: worktree.fs,
    dir: worktree.dir,
    oid: commitSha,
    filepath,
  })
  return new TextDecoder().decode(blob.blob)
}

// Glyph records are the canonical layer, so an edit is written there rather
// than by re-saving the project draft.
const setWidth = async (glyphId: string, width: number) => {
  const key = makeKumikoGlyphKey('partial', glyphId)
  const glyph = await loadKumikoGlyphRecord(key)
  await saveKumikoGlyphRecord({
    ...glyph!,
    layers: {
      ...glyph!.layers,
      'public.default': {
        ...glyph!.layers['public.default']!,
        metrics: { width, lsb: 0, rsb: width },
      },
    },
  })
  // A commit materializes the dirty scope once a worktree is tracked, so the
  // edit only reaches the tree if it is flagged like the app flags it.
  await updateKumikoGlyphSyncDirtyState([key], 1)
  await updateKumikoGlyphExportDirtyState([key], 1)
}

const pathA = 'Kumiko.ufo/glyphs/A.glif'
const pathB = 'Kumiko.ufo/glyphs/B.glif'

describe('striking a line out of a send', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase('kumiko')
  })

  it('leaves the excluded path at its base version and keeps the rest', async () => {
    const store = createMemoryFileStore()
    await saveProject(500, 500)
    const first = await commitAndPushProject({
      projectId: 'partial',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-1',
      message: 'Base',
      store,
    })

    await setWidth('A', 700)
    await setWidth('B', 800)
    const second = await commitAndPushProject({
      projectId: 'partial',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-1',
      message: 'Send only B',
      excludePaths: [pathA],
      store,
    })

    expect(second.excludedPaths).toEqual([pathA])
    expect(second.writtenPaths).not.toContain(pathA)

    // A was materialized but never staged, so the commit keeps the old width.
    expect(await widthInCommit(store, second.commitSha, pathA)).toContain(
      'width="500"'
    )
    expect(await widthInCommit(store, second.commitSha, pathB)).toContain(
      'width="800"'
    )
    // The base commit is untouched either way.
    expect(await widthInCommit(store, first.commitSha, pathB)).toContain(
      'width="500"'
    )
  })

  it('excludes by glyph id when the caller has no path for it', async () => {
    const store = createMemoryFileStore()
    await saveProject(500, 500)
    await commitAndPushProject({
      projectId: 'partial',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-id',
      message: 'Base',
      store,
    })

    await setWidth('A', 700)
    await setWidth('B', 800)
    const second = await commitAndPushProject({
      projectId: 'partial',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-id',
      message: 'Send only B',
      excludeGlyphIds: ['A'],
      store,
    })

    expect(second.excludedPaths).toEqual([pathA])
    expect(await widthInCommit(store, second.commitSha, pathA)).toContain(
      'width="500"'
    )
    expect(await widthInCommit(store, second.commitSha, pathB)).toContain(
      'width="800"'
    )
  })

  it('keeps an excluded glyph dirty so a later send still carries it', async () => {
    const store = createMemoryFileStore()
    await saveProject(500, 500)
    await commitAndPushProject({
      projectId: 'partial',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-2',
      message: 'Base',
      store,
    })

    await setWidth('A', 700)
    await setWidth('B', 800)
    await updateKumikoGlyphSyncDirtyState(
      [makeKumikoGlyphKey('partial', 'A'), makeKumikoGlyphKey('partial', 'B')],
      1
    )

    await markGitCommitSynced({
      projectId: 'partial',
      pushedRepo: 'contributor/repo',
      pushedBranch: 'kumiko/patch-2',
      commitSha: 'a'.repeat(40),
      writtenPaths: [pathB],
      excludedPaths: [pathA],
    })

    expect(await listSyncDirtyKumikoGlyphIds('partial')).toEqual(['A'])
    const project = await loadKumikoProjectRecord('partial')
    expect(project?.syncDirty).toBe(1)
  })

  it('clears everything when nothing was struck out', async () => {
    const store = createMemoryFileStore()
    await saveProject(500, 500)
    await commitAndPushProject({
      projectId: 'partial',
      pushRepo: 'contributor/repo',
      pushBranch: 'kumiko/patch-3',
      message: 'Base',
      store,
    })
    await updateKumikoGlyphSyncDirtyState(
      [makeKumikoGlyphKey('partial', 'A'), makeKumikoGlyphKey('partial', 'B')],
      1
    )

    await markGitCommitSynced({
      projectId: 'partial',
      pushedRepo: 'contributor/repo',
      pushedBranch: 'kumiko/patch-3',
      commitSha: 'b'.repeat(40),
      writtenPaths: [pathA, pathB],
    })

    expect(await listSyncDirtyKumikoGlyphIds('partial')).toEqual([])
    const project = await loadKumikoProjectRecord('partial')
    expect(project?.syncDirty).toBe(0)
  })
})
