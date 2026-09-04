import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import {
  listGlyphsPackagePaths,
  materializeGlyphsPackage,
} from '@/lib/fontFormats/glyphsPackageMaterialize'
import { saveProjectDraft } from '@/lib/project/projectRepository'
import {
  loadKumikoGlyphRecord,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecord,
} from '@/lib/project/kumikoProjectPersistence'
import type { FontData } from '@/domain'

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)
vi.stubGlobal('Node', window.Node)

const makeFontData = (names: string[]): FontData => ({
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

const saveProject = async (projectId: string, names: string[]) =>
  saveProjectDraft({
    id: projectId,
    title: 'Family',
    lastModified: 2,
    createdAt: 1,
    updatedAt: 2,
    sourceName: 'Family.glyphspackage',
    sourceType: 'local',
    fontData: makeFontData(names),
    projectMetadata: null,
    projectSourceData: null,
    projectSourceFormat: 'glyphspackage',
    projectRoundTripFormat: 'glyphspackage',
    projectGlyphsPackage: null,
  })

const collect = async (projectId: string, scope?: 'all' | 'dirty') => {
  const files = []
  for await (const file of materializeGlyphsPackage({ projectId, scope })) {
    files.push(file)
  }
  return files
}

describe('glyphspackage materialization', () => {
  it('projects the package layout', async () => {
    await saveProject('gp-basic', ['A', 'B'])
    const files = await collect('gp-basic')

    expect(files.map((file) => file.path).sort()).toEqual([
      'Family.glyphspackage/fontinfo.plist',
      'Family.glyphspackage/glyphs/A.glyph',
      'Family.glyphspackage/glyphs/B.glyph',
      'Family.glyphspackage/order.plist',
    ])
  })

  it('tags files with the entity that owns them', async () => {
    await saveProject('gp-entities', ['A'])
    const files = await collect('gp-entities')
    const entityOf = (path: string) =>
      files.find((file) => file.path === path)?.entity

    expect(entityOf('Family.glyphspackage/glyphs/A.glyph')).toEqual({
      kind: 'glyph',
      name: 'A',
    })
    expect(entityOf('Family.glyphspackage/order.plist')).toEqual({
      kind: 'font',
      part: 'order',
    })
  })

  it('writes one file per glyph carrying its masters', async () => {
    await saveProject('gp-content', ['A'])
    const files = await collect('gp-content')
    const glyphFile = files.find((file) => file.path.endsWith('A.glyph'))

    expect(glyphFile?.text).toContain('glyphname')
    expect(glyphFile?.countsTowardTotal).toBe(true)
  })

  it('lists the same paths it would write, without loading geometry', async () => {
    await saveProject('gp-paths', ['A', 'B'])
    const [written, listed] = await Promise.all([
      collect('gp-paths').then((files) =>
        files.map((file) => file.path).sort()
      ),
      listGlyphsPackagePaths('gp-paths').then((paths) => [...paths].sort()),
    ])

    expect(listed).toEqual(written)
  })

  it('emits only dirty glyphs under a partial rebuild', async () => {
    await saveProject('gp-dirty', ['A', 'B'])
    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gp-dirty', 'A')
    )
    await saveKumikoGlyphRecord({ ...glyph!, syncDirty: 1 })

    const files = await collect('gp-dirty', 'dirty')
    const glyphPaths = files
      .map((file) => file.path)
      .filter((path) => path.includes('/glyphs/'))

    expect(glyphPaths).toEqual(['Family.glyphspackage/glyphs/A.glyph'])
  })

  it('still lists every glyph in order.plist after a partial rebuild', async () => {
    await saveProject('gp-dirty-order', ['A', 'B'])
    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('gp-dirty-order', 'A')
    )
    await saveKumikoGlyphRecord({ ...glyph!, syncDirty: 1 })

    const files = await collect('gp-dirty-order', 'dirty')
    const order = files.find((file) => file.path.endsWith('order.plist'))

    expect(order?.text).toContain('A')
    expect(order?.text).toContain('B')
  })
})
