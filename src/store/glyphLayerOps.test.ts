import { describe, it, expect } from 'vitest'
import {
  createBackupLayer,
  deleteBackupLayer,
  duplicateLayer,
  listGlyphLayers,
  renameBackupLayer,
  promoteBackupToMaster,
} from './glyphLayerOps'
import type { GlyphData } from './types'

const makeGlyph = (): GlyphData => ({
  id: 'g1',
  name: 'a',
  activeLayerId: 'public.default',
  paths: [
    {
      id: 'p1',
      closed: true,
      nodes: [{ id: 'n1', x: 1, y: 2, type: 'corner' }],
    },
  ],
  components: [],
  componentRefs: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
})

describe('glyphLayerOps', () => {
  it('lists the active master synthesised from hot content', () => {
    const layers = listGlyphLayers(makeGlyph())
    expect(layers).toHaveLength(1)
    expect(layers[0].id).toBe('public.default')
    expect(layers[0].type).toBe('master')
    expect(layers[0].paths[0].nodes[0].x).toBe(1)
  })

  it('creates a backup snapshot of the hot content', () => {
    const glyph = createBackupLayer(makeGlyph(), 'b1', 'Backup 1')
    const layers = listGlyphLayers(glyph)
    expect(layers.map((l) => l.id)).toEqual(['public.default', 'b1'])
    expect(layers[1].type).toBe('backup')
    expect(layers[1].paths[0].nodes[0].x).toBe(1)
    // editing the master afterwards must not mutate the backup snapshot
    glyph.paths = [
      {
        id: 'p1',
        closed: true,
        nodes: [{ id: 'n1', x: 99, y: 2, type: 'corner' }],
      },
    ]
    expect(glyph.layers!.b1.paths[0].nodes[0].x).toBe(1)
  })

  it('renames and deletes backups but never the master', () => {
    let glyph = createBackupLayer(makeGlyph(), 'b1', 'Backup 1')
    glyph = renameBackupLayer(glyph, 'b1', 'Renamed')
    expect(glyph.layers!.b1.name).toBe('Renamed')
    glyph = deleteBackupLayer(glyph, 'public.default') // master: no-op
    expect(glyph.layers!.b1).toBeDefined()
    glyph = deleteBackupLayer(glyph, 'b1')
    expect(glyph.layers!.b1).toBeUndefined()
    expect(listGlyphLayers(glyph)).toHaveLength(1)
  })

  it('duplicates a layer into a new backup', () => {
    let glyph = createBackupLayer(makeGlyph(), 'b1', 'Backup 1')
    glyph = duplicateLayer(glyph, 'b1', 'b2', 'Backup 2')
    expect(listGlyphLayers(glyph).map((l) => l.id)).toEqual([
      'public.default',
      'b1',
      'b2',
    ])
  })

  it('promoteBackupToMaster swaps backup into hot and keeps old hot as a backup', () => {
    let glyph = makeGlyph()
    // backup holds a distinct outline
    glyph = createBackupLayer(glyph, 'b1', 'Backup 1')
    glyph.layers!.b1.paths = [
      {
        id: 'p9',
        closed: true,
        nodes: [{ id: 'n9', x: 50, y: 60, type: 'corner' }],
      },
    ]
    const result = promoteBackupToMaster(glyph, 'b1', 'b-old', 'Previous')
    // hot now holds the backup's outline
    expect(result.paths[0].nodes[0].x).toBe(50)
    // promoted backup is gone, old hot kept as a new backup
    expect(result.layers!.b1).toBeUndefined()
    expect(result.layers!['b-old'].paths[0].nodes[0].x).toBe(1)
    expect(listGlyphLayers(result).map((l) => l.id)).toEqual([
      'public.default',
      'b-old',
    ])
  })
})
