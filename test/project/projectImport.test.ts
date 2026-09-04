import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import { saveImportedUfoWorkspaceAsProject } from '@/features/home/utils/projectImport'
import { loadProjectGlyphGeometry } from '@/lib/project/projectRepository'
import type { ImportedUfoWorkspace } from '@/lib/fontFormats/ufoFormat'

const importedWorkspace = (): ImportedUfoWorkspace => ({
  project: {
    projectId: 'imported-ufo',
    title: 'Imported UFO',
    sourceFolderName: 'Imported.ufo',
    ufoIds: ['Imported.ufo'],
    selectedUfoId: 'Imported.ufo',
    createdAt: 10,
    updatedAt: 20,
    sourceType: 'local',
    githubSource: null,
  },
  metadataRecords: [],
  glyphRecords: [],
  fontData: {
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
            paths: [
              {
                id: 'path-1',
                closed: true,
                nodes: [
                  {
                    id: 'node-1',
                    kind: 'oncurve',
                    segmentType: 'line',
                    x: 10,
                    y: 20,
                  },
                ],
              },
            ],
            componentRefs: [],
            anchors: [],
            guidelines: [],
            metrics: { width: 500, lsb: 10, rsb: 490 },
          },
        },
      },
    },
  },
  projectMetadata: {},
  projectSourceData: {
    ufo: {
      designspace: null,
      designspacePath: null,
      ufos: [
        {
          ufoId: 'Imported.ufo',
          relativePath: 'Imported.ufo',
          defaultLayerId: 'public.default',
          layers: [{ layerId: 'public.default', glyphDir: 'glyphs' }],
          contents: { A: 'A.glif' },
          glyphOrder: ['A'],
        },
      ],
    },
  },
  projectSourceFormat: 'ufo',
})

describe('project import persistence', () => {
  it('returns metadata-only font data after saving imported UFO geometry', async () => {
    const imported =
      await saveImportedUfoWorkspaceAsProject(importedWorkspace())

    expect(imported.fontData.glyphs.A.layers).toBeUndefined()
    expect(imported.fontData.glyphs.A.componentGlyphIds).toEqual([])
    expect(imported.fontData.glyphs.A.unicodes).toEqual(['0041'])

    const fullGlyph = await loadProjectGlyphGeometry(imported.id, 'A')
    expect(fullGlyph?.layers?.['public.default']?.metrics.width).toBe(500)
    expect(fullGlyph?.layers?.['public.default']?.paths[0].nodes[0].x).toBe(10)
  })
})
