import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import git from 'isomorphic-git'
import {
  commitWorktree,
  discardGitWorktree,
  openGitWorktree,
  stageWorktreePaths,
  syncWorktreeFromProject,
  worktreeDirFor,
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
import type { FontData } from 'src/store'

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)
vi.stubGlobal('Node', window.Node)

const makeFontData = (glyphNames: string[]): FontData => ({
  glyphOrder: glyphNames,
  glyphs: Object.fromEntries(
    glyphNames.map((name) => [
      name,
      {
        id: name,
        name,
        unicodes: [],
        activeLayerId: 'public.default',
        layerOrder: ['public.default'],
        layers: {
          'public.default': {
            id: 'public.default',
            name: 'public.default',
            type: 'master' as const,
            associatedMasterId: 'public.default',
            paths: [],
            componentRefs: [],
            anchors: [],
            guidelines: [],
            metrics: { width: 500, lsb: 0, rsb: 500 },
          },
        },
      },
    ])
  ),
})

const saveProject = async (projectId: string, glyphNames: string[]) =>
  saveProjectDraft({
    id: projectId,
    title: 'Kumiko',
    lastModified: 2,
    createdAt: 1,
    updatedAt: 2,
    sourceName: 'Kumiko.ufo',
    sourceType: 'local',
    fontData: makeFontData(glyphNames),
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
            contents: Object.fromEntries(
              glyphNames.map((name) => [name, `${name}.glif`])
            ),
            glyphOrder: glyphNames,
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

describe('git worktree', () => {
  it('initializes a per-project repository', async () => {
    const store = createMemoryFileStore()
    const worktree = await openGitWorktree({ projectId: 'wt-init', store })

    expect(worktree.dir).toBe(worktreeDirFor('wt-init'))
    expect(
      await git.listBranches({ fs: worktree.fs, dir: worktree.dir })
    ).toEqual([])
    expect(
      await worktree.fs.promises.readFile(`${worktree.dir}/.git/HEAD`, 'utf8')
    ).toContain('refs/heads/main')
  })

  it('is safe to open twice without losing history', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-reopen', ['A'])
    const first = await openGitWorktree({ projectId: 'wt-reopen', store })
    const synced = await syncWorktreeFromProject({
      projectId: 'wt-reopen',
      worktree: first,
    })
    await stageWorktreePaths({ worktree: first, ...synced })
    const oid = await commitWorktree({ worktree: first, message: 'first' })

    const second = await openGitWorktree({ projectId: 'wt-reopen', store })
    const log = await git.log({ fs: second.fs, dir: second.dir })

    expect(log[0]?.oid).toBe(oid)
  })

  it('materializes the project tree into the worktree', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-sync', ['A'])
    const worktree = await openGitWorktree({ projectId: 'wt-sync', store })

    const result = await syncWorktreeFromProject({
      projectId: 'wt-sync',
      worktree,
    })

    expect(result.writtenPaths).toContain('Kumiko.ufo/glyphs/A.glif')
    expect(result.writtenPaths).toContain('Kumiko.ufo/fontinfo.plist')
    expect(
      await worktree.fs.promises.readFile(
        `${worktree.dir}/Kumiko.ufo/glyphs/A.glif`,
        'utf8'
      )
    ).toContain('<glyph')
  })

  it('commits staged paths so git can read them back', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-commit', ['A'])
    const worktree = await openGitWorktree({ projectId: 'wt-commit', store })
    const synced = await syncWorktreeFromProject({
      projectId: 'wt-commit',
      worktree,
    })
    await stageWorktreePaths({ worktree, ...synced })
    const oid = await commitWorktree({ worktree, message: 'add A' })

    const blob = await git.readBlob({
      fs: worktree.fs,
      dir: worktree.dir,
      oid,
      filepath: 'Kumiko.ufo/glyphs/A.glif',
    })
    expect(new TextDecoder().decode(blob.blob)).toContain('<glyph')
  })

  it('removes files the project no longer materializes', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-prune', ['A', 'B'])
    const worktree = await openGitWorktree({ projectId: 'wt-prune', store })
    const first = await syncWorktreeFromProject({
      projectId: 'wt-prune',
      worktree,
    })
    await stageWorktreePaths({ worktree, ...first })
    await commitWorktree({ worktree, message: 'add A and B' })

    // Drop B from the project, then re-materialize.
    const project = await loadKumikoProjectRecord('wt-prune')
    await saveKumikoProjectRecord({
      ...project!,
      glyphOrder: ['A'],
      sourceData: {
        ...project!.sourceData,
        ufo: {
          ...project!.sourceData!.ufo,
          ufos: project!.sourceData!.ufo!.ufos!.map((ufo) => ({
            ...ufo,
            contents: { A: 'A.glif' },
            glyphOrder: ['A'],
          })),
        },
      },
    })

    const second = await syncWorktreeFromProject({
      projectId: 'wt-prune',
      worktree,
    })

    expect(second.removedPaths).toContain('Kumiko.ufo/glyphs/B.glif')
    await expect(
      worktree.fs.promises.readFile(
        `${worktree.dir}/Kumiko.ufo/glyphs/B.glif`,
        'utf8'
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('discards the repository so it can be rebuilt from scratch', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-discard', ['A'])
    const worktree = await openGitWorktree({ projectId: 'wt-discard', store })
    await syncWorktreeFromProject({ projectId: 'wt-discard', worktree })

    await discardGitWorktree({ projectId: 'wt-discard', store })

    expect(await store.statPath(`kumiko/projects/wt-discard`)).toBeNull()
  })
})

describe('partial worktree rebuilds', () => {
  it('writes only the dirty glyph on a second sync', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-scope', ['A', 'B'])
    const worktree = await openGitWorktree({ projectId: 'wt-scope', store })

    const first = await syncWorktreeFromProject({
      projectId: 'wt-scope',
      worktree,
    })
    await stageWorktreePaths({ worktree, ...first })
    await commitWorktree({ worktree, message: 'base' })
    expect(first.writtenPaths).toContain('Kumiko.ufo/glyphs/A.glif')
    expect(first.writtenPaths).toContain('Kumiko.ufo/glyphs/B.glif')

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('wt-scope', 'A')
    )
    await saveKumikoGlyphRecord({ ...glyph!, syncDirty: 1 })

    const second = await syncWorktreeFromProject({
      projectId: 'wt-scope',
      worktree,
    })

    expect(second.writtenPaths).toContain('Kumiko.ufo/glyphs/A.glif')
    expect(second.writtenPaths).not.toContain('Kumiko.ufo/glyphs/B.glif')
    expect(second.removedPaths).toEqual([])
  })

  it('keeps the untouched glyph readable in the worktree', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-scope-keep', ['A', 'B'])
    const worktree = await openGitWorktree({
      projectId: 'wt-scope-keep',
      store,
    })
    const first = await syncWorktreeFromProject({
      projectId: 'wt-scope-keep',
      worktree,
    })
    await stageWorktreePaths({ worktree, ...first })
    await commitWorktree({ worktree, message: 'base' })

    await syncWorktreeFromProject({ projectId: 'wt-scope-keep', worktree })

    expect(
      await worktree.fs.promises.readFile(
        `${worktree.dir}/Kumiko.ufo/glyphs/B.glif`,
        'utf8'
      )
    ).toContain('<glyph')
  })

  it('still lists every glyph in contents.plist after a partial rebuild', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-scope-contents', ['A', 'B'])
    const worktree = await openGitWorktree({
      projectId: 'wt-scope-contents',
      store,
    })
    const first = await syncWorktreeFromProject({
      projectId: 'wt-scope-contents',
      worktree,
    })
    await stageWorktreePaths({ worktree, ...first })
    await commitWorktree({ worktree, message: 'base' })

    await syncWorktreeFromProject({
      projectId: 'wt-scope-contents',
      worktree,
      scope: 'dirty',
    })

    const contents = await worktree.fs.promises.readFile(
      `${worktree.dir}/Kumiko.ufo/glyphs/contents.plist`,
      'utf8'
    )
    expect(contents).toContain('A.glif')
    expect(contents).toContain('B.glif')
  })

  it('still deletes files the project dropped, without a full rebuild', async () => {
    const store = createMemoryFileStore()
    await saveProject('wt-scope-delete', ['A', 'B'])
    const worktree = await openGitWorktree({
      projectId: 'wt-scope-delete',
      store,
    })
    const first = await syncWorktreeFromProject({
      projectId: 'wt-scope-delete',
      worktree,
    })
    await stageWorktreePaths({ worktree, ...first })
    await commitWorktree({ worktree, message: 'base' })

    const project = await loadKumikoProjectRecord('wt-scope-delete')
    await saveKumikoProjectRecord({
      ...project!,
      glyphOrder: ['A'],
      sourceData: {
        ...project!.sourceData,
        ufo: {
          ...project!.sourceData!.ufo,
          ufos: project!.sourceData!.ufo!.ufos!.map((ufo) => ({
            ...ufo,
            contents: { A: 'A.glif' },
            glyphOrder: ['A'],
          })),
        },
      },
    })

    const second = await syncWorktreeFromProject({
      projectId: 'wt-scope-delete',
      worktree,
      scope: 'dirty',
    })

    expect(second.removedPaths).toContain('Kumiko.ufo/glyphs/B.glif')
  })
})
