import { describe, it, expect } from 'vitest'
import {
  createBackupLayer,
  deleteBackupLayer,
  duplicateLayer,
  listGlyphLayers,
  promoteBackupToMaster,
  renameBackupLayer,
} from './glyphLayerOps'
import type { GlyphData } from './types'

const makeGlyph = (): GlyphData => ({
  id: 'g1',
  name: 'a',
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
          id: 'p1',
          closed: true,
          nodes: [
            { id: 'n1', x: 1, y: 2, kind: 'oncurve', segmentType: 'line' },
          ],
        },
      ],
      components: [],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
  },
})

describe('glyphLayerOps', () => {
  it('lists the active master from the layers map', () => {
    const layers = listGlyphLayers(makeGlyph())
    expect(layers).toHaveLength(1)
    expect(layers[0].id).toBe('public.default')
    expect(layers[0].type).toBe('master')
    expect(layers[0].paths[0].nodes[0].x).toBe(1)
  })

  it('creates a backup whose id is its name, snapshotting the master content', () => {
    const glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    const layers = listGlyphLayers(glyph)
    expect(layers.map((l) => l.id)).toEqual(['public.default', 'Backup 1'])
    expect(layers[1].type).toBe('backup')
    expect(layers[1].name).toBe('Backup 1')
    expect(layers[1].paths[0].nodes[0].x).toBe(1)
    // mutating the master afterwards must not mutate the backup snapshot
    glyph.layers!['public.default'].paths = [
      {
        id: 'p1',
        closed: true,
        nodes: [
          { id: 'n1', x: 99, y: 2, kind: 'oncurve', segmentType: 'line' },
        ],
      },
    ]
    expect(glyph.layers!['Backup 1'].paths[0].nodes[0].x).toBe(1)
  })

  it('keeps backup identity when the selected layer is a backup', () => {
    const glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    const selectedBackup = { ...glyph, activeLayerId: 'Backup 1' }
    const layers = listGlyphLayers(selectedBackup)
    expect(layers.map((l) => [l.id, l.type])).toEqual([
      ['public.default', 'master'],
      ['Backup 1', 'backup'],
    ])
  })

  it('disambiguates same-name backups with " (2)"', () => {
    let glyph = createBackupLayer(makeGlyph(), '16 Jun, 25 17:08')
    glyph = createBackupLayer(glyph, '16 Jun, 25 17:08')
    expect(listGlyphLayers(glyph).map((l) => l.id)).toEqual([
      'public.default',
      '16 Jun, 25 17:08',
      '16 Jun, 25 17:08 (2)',
    ])
  })

  it('renames by re-keying so id stays equal to name', () => {
    let glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    glyph = renameBackupLayer(glyph, 'Backup 1', 'Renamed')
    expect(glyph.layers!['Backup 1']).toBeUndefined()
    expect(glyph.layers!.Renamed.name).toBe('Renamed')
    expect(listGlyphLayers(glyph).map((l) => l.id)).toEqual([
      'public.default',
      'Renamed',
    ])
  })

  it('keeps selection on a renamed backup', () => {
    let glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    glyph = { ...glyph, activeLayerId: 'Backup 1' }
    glyph = renameBackupLayer(glyph, 'Backup 1', 'Renamed')
    expect(glyph.activeLayerId).toBe('Renamed')
  })

  it('does not rename master layers', () => {
    const glyph = renameBackupLayer(makeGlyph(), 'public.default', 'Renamed')
    expect(glyph.layers?.['public.default']?.name).toBe('public.default')
    expect(glyph.layers?.Renamed).toBeUndefined()
  })

  it('deletes backups but never the master', () => {
    let glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    glyph = deleteBackupLayer(glyph, 'public.default')
    expect(glyph.layers!['Backup 1']).toBeDefined()
    glyph = deleteBackupLayer(glyph, 'Backup 1')
    expect(listGlyphLayers(glyph)).toHaveLength(1)
  })

  it('returns selection to the master when deleting the selected backup', () => {
    let glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    glyph = { ...glyph, activeLayerId: 'Backup 1' }
    glyph = deleteBackupLayer(glyph, 'Backup 1')
    expect(glyph.activeLayerId).toBe('public.default')
  })

  it('duplicates a layer into a new backup', () => {
    let glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    glyph = duplicateLayer(glyph, 'Backup 1', 'Backup 1 copy')
    expect(listGlyphLayers(glyph).map((l) => l.id)).toEqual([
      'public.default',
      'Backup 1',
      'Backup 1 copy',
    ])
  })

  it('promoteBackupToMaster swaps backup into the master, keeping old master as a backup', () => {
    const glyph = createBackupLayer(makeGlyph(), 'Backup 1')
    glyph.layers!['Backup 1'].paths = [
      {
        id: 'p9',
        closed: true,
        nodes: [
          { id: 'n9', x: 50, y: 60, kind: 'oncurve', segmentType: 'line' },
        ],
      },
    ]
    const result = promoteBackupToMaster(glyph, 'Backup 1', 'Previous')
    expect(result.layers!['public.default'].paths[0].nodes[0].x).toBe(50)
    expect(result.layers!['Backup 1']).toBeUndefined()
    expect(result.layers!.Previous.paths[0].nodes[0].x).toBe(1)
    expect(result.activeLayerId).toBe('public.default')
    expect(listGlyphLayers(result).map((l) => l.id)).toEqual([
      'public.default',
      'Previous',
    ])
  })

  it('does not promote master layers through the backup action', () => {
    const glyph = promoteBackupToMaster(
      makeGlyph(),
      'public.default',
      'Previous'
    )
    expect(glyph.layers?.Previous).toBeUndefined()
    expect(glyph.layers?.['public.default']?.type).toBe('master')
  })
})
