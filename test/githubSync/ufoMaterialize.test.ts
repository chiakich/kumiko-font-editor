import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { materializeUfoTree } from '@/lib/fontFormats/ufoMaterialize'
import { saveProjectDraft } from '@/lib/project/projectRepository'
import type { FontData } from '@/store'

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)
vi.stubGlobal('Node', window.Node)

const makeFontData = (): FontData => ({
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
          metrics: { width: 500, lsb: 0, rsb: 500 },
          sourceData: {
            ufo: {
              ufoId: 'Kumiko.ufo',
              layerId: 'public.default',
              glyphDir: 'glyphs',
              fileName: 'A_.glif',
            },
          },
        },
      },
    },
  },
})

const collect = async (projectId: string) => {
  const files = []
  for await (const file of materializeUfoTree({ projectId })) {
    files.push(file)
  }
  return files
}

const saveProject = async (id: string) =>
  saveProjectDraft({
    id,
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
            contents: { A: 'A_.glif' },
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

describe('materializeUfoTree', () => {
  it('projects a complete, spec-shaped UFO tree', async () => {
    await saveProject('materialize-basic')
    const files = await collect('materialize-basic')

    expect(files.map((file) => file.path).sort()).toEqual([
      'Kumiko.ufo/fontinfo.plist',
      'Kumiko.ufo/glyphs/A_.glif',
      'Kumiko.ufo/glyphs/contents.plist',
      'Kumiko.ufo/groups.plist',
      'Kumiko.ufo/kerning.plist',
      'Kumiko.ufo/layercontents.plist',
      'Kumiko.ufo/lib.plist',
      'Kumiko.ufo/metainfo.plist',
    ])
  })

  it('tags every file with the entity that owns it', async () => {
    await saveProject('materialize-entities')
    const files = await collect('materialize-entities')
    const entityOf = (path: string) =>
      files.find((file) => file.path === path)?.entity

    expect(entityOf('Kumiko.ufo/glyphs/A_.glif')).toEqual({
      kind: 'glyph',
      name: 'A',
    })
    expect(entityOf('Kumiko.ufo/fontinfo.plist')).toEqual({
      kind: 'font',
      part: 'info',
    })
    expect(entityOf('Kumiko.ufo/kerning.plist')).toEqual({
      kind: 'font',
      part: 'kerning',
    })
    expect(entityOf('Kumiko.ufo/glyphs/contents.plist')).toEqual({
      kind: 'font',
      part: 'order',
    })
  })

  it('counts only default-layer glyphs toward progress', async () => {
    await saveProject('materialize-progress')
    const files = await collect('materialize-progress')

    expect(files.filter((file) => file.countsTowardTotal)).toHaveLength(1)
  })

  it('writes contents.plist listing every glyph it emitted', async () => {
    await saveProject('materialize-contents')
    const files = await collect('materialize-contents')
    const contents = files.find(
      (file) => file.path === 'Kumiko.ufo/glyphs/contents.plist'
    )

    expect(contents?.text).toContain('A_.glif')
  })

  it('reports export state for the glyphs it materialized', async () => {
    await saveProject('materialize-state')
    const updates: Array<{ glyphId: string }> = []
    for await (const _file of materializeUfoTree({
      projectId: 'materialize-state',
      onExportState: (update) => updates.push(update),
    })) {
      void _file
    }

    expect(updates.map((update) => update.glyphId)).toEqual(['A'])
  })
})

describe('materializeUfoTree progress reporting', () => {
  it('reports the glyph total before yielding any file', async () => {
    await saveProject('materialize-total')
    const events: string[] = []
    for await (const file of materializeUfoTree({
      projectId: 'materialize-total',
      onTotal: (total) => events.push(`total:${total}`),
    })) {
      events.push(`file:${file.path}`)
    }

    expect(events[0]).toBe('total:1')
    expect(
      events.filter((event) => event.startsWith('file:'))
    ).not.toHaveLength(0)
  })
})
