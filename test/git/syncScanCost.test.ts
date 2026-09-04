import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import {
  openGitWorktree,
  syncWorktreeFromProject,
  stageWorktreePaths,
  commitWorktree,
} from '@/lib/git/worktree'
import { saveProjectDraft } from '@/lib/project/projectRepository'
import {
  loadKumikoProjectRecord,
  saveKumikoProjectRecord,
} from '@/lib/project/kumikoProjectPersistence'
import { createMemoryFileStore } from './memoryFileStore'
import type { FontData } from '@/domain'

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)
vi.stubGlobal('Node', window.Node)

const names = ['A', 'B', 'C']

const makeFontData = (): FontData => ({
  glyphOrder: names,
  glyphs: Object.fromEntries(
    names.map((name) => [
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

// Counts cursor walks over the glyph store. Each walk deserializes every glyph
// record in the project, geometry included, so the count — not the work done per
// record — is what a CJK-scale font pays for.
const countGlyphStoreScans = async <T>(run: () => Promise<T>) => {
  const original = IDBIndex.prototype.openCursor
  let scans = 0
  IDBIndex.prototype.openCursor = function (this: IDBIndex, ...args) {
    if (this.objectStore.name === 'kumiko_glyphs') {
      scans += 1
    }
    return original.apply(this, args)
  }
  try {
    await run()
  } finally {
    IDBIndex.prototype.openCursor = original
  }
  return scans
}

describe('sync scan cost', () => {
  // Renaming the family writes a handful of plists. It used to walk the whole
  // glyph store four times to work that out — twice for the manifest's own
  // projections, and twice again because the path listing and the file stream
  // each built their own manifest.
  it('walks the glyph store once for a font-level-only sync', async () => {
    const store = createMemoryFileStore()
    await saveProjectDraft({
      id: 'scan-cost',
      title: 'Kumiko',
      lastModified: 2,
      createdAt: 1,
      updatedAt: 2,
      sourceName: 'Kumiko.ufo',
      sourceType: 'local',
      fontData: makeFontData(),
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
              contents: Object.fromEntries(names.map((n) => [n, `${n}.glif`])),
              glyphOrder: names,
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

    const worktree = await openGitWorktree({ projectId: 'scan-cost', store })
    const first = await syncWorktreeFromProject({
      projectId: 'scan-cost',
      worktree,
    })
    await stageWorktreePaths({ worktree, ...first })
    await commitWorktree({ worktree, message: 'base' })

    const project = await loadKumikoProjectRecord('scan-cost')
    await saveKumikoProjectRecord({
      ...project!,
      title: 'Kumiko Renamed',
      syncDirty: 1,
    })

    let written: string[] = []
    const scans = await countGlyphStoreScans(async () => {
      const second = await syncWorktreeFromProject({
        projectId: 'scan-cost',
        worktree,
      })
      written = second.writtenPaths
    })

    // One walk, for the manifest. It was six: the path listing and the file
    // stream each built their own manifest, and each manifest asked the store
    // three separate questions about the same records.
    expect(scans).toBe(1)
    expect(written.every((path) => !path.endsWith('.glif'))).toBe(true)
  })
})
