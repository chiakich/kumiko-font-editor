import { describe, expect, it } from 'vitest'
import {
  barcodeForHash,
  buildChangeReceipt,
  collectSentGlyphChanges,
  fontFileKindFor,
  glyphLineKey,
  resolveReceiptExclusions,
} from 'src/features/common/glyphInspector/utils/changeReceipt'
import type { GlyphSyncEntry, ProjectSyncReport } from 'src/lib/github/sync'
import type { FontData } from 'src/store'

const fontData = {
  glyphs: {
    A: { id: 'A', name: 'A', unicodes: ['5B89'] },
    B: { id: 'B', name: 'B', unicodes: ['5BE7'] },
  },
} as unknown as FontData

const entry = (
  overrides: Partial<GlyphSyncEntry> & Pick<GlyphSyncEntry, 'path' | 'status'>
): GlyphSyncEntry => ({
  kind: 'glyph',
  glyphName: 'A',
  fileName: 'A.glif',
  baselineSha: null,
  remoteSha: null,
  ...overrides,
})

const report = (entries: GlyphSyncEntry[]): ProjectSyncReport => ({
  target: { owner: 'o', repo: 'r', ref: 'main' },
  remoteHeadSha: 'a'.repeat(40),
  remoteTreeTruncated: false,
  entries,
  conflicts: entries.filter((item) => item.status === 'conflict'),
  remoteChanges: entries.filter((item) => item.status.startsWith('remote')),
  localChanges: entries.filter((item) => item.status.startsWith('local')),
  isUpToDate: false,
})

describe('change receipt', () => {
  it('groups glyphs and font files, and resolves the glyph character', () => {
    const receipt = buildChangeReceipt({
      report: report([
        entry({
          path: 'F.ufo/glyphs/A.glif',
          status: 'localModified',
          remoteSha: 'x',
        }),
        entry({
          path: 'F.ufo/fontinfo.plist',
          status: 'localModified',
          kind: 'font',
          glyphName: null,
          fileName: 'fontinfo.plist',
          remoteSha: 'x',
        }),
      ]),
      fontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
    })

    expect(receipt.glyphLines).toEqual([
      {
        key: glyphLineKey('A'),
        path: null,
        glyphId: 'A',
        kind: 'glyph',
        char: '安',
        label: 'A',
        fontFileKind: null,
        detail: null,
        status: 'modified',
      },
    ])
    expect(receipt.fontLines.map((line) => line.label)).toEqual([
      'fontinfo.plist',
    ])
    expect(receipt.fontLines[0]?.fontFileKind).toBe('fontinfo')
    expect(receipt.fontLines[0]?.detail).toBe('F.ufo/fontinfo.plist')
    expect(receipt.totalCount).toBe(2)
  })

  it('keeps glyph line keys stable whether or not the report has landed', () => {
    const before = buildChangeReceipt({
      report: null,
      fontData,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: [],
    })
    const after = buildChangeReceipt({
      report: report([
        entry({ path: 'F.ufo/glyphs/A.glif', status: 'localModified' }),
      ]),
      fontData,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: [],
    })

    expect(before.glyphLines[0]?.key).toBe(after.glyphLines[0]?.key)
  })

  it('shows one line per glyph across masters and settles a shared status', () => {
    const receipt = buildChangeReceipt({
      report: report([
        entry({
          path: 'Regular.ufo/glyphs/A.glif',
          status: 'localModified',
          remoteSha: 'x',
        }),
        entry({ path: 'Bold.ufo/glyphs/A.glif', status: 'conflict' }),
      ]),
      fontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
    })

    expect(receipt.glyphLines).toHaveLength(1)
    expect(receipt.glyphLines[0]?.status).toBe('conflict')
    expect(receipt.conflictCount).toBe(1)
  })

  it('reads as an addition only when no master exists upstream', () => {
    const added = buildChangeReceipt({
      report: report([
        entry({
          path: 'Regular.ufo/glyphs/B.glif',
          status: 'localModified',
          glyphName: 'B',
          fileName: 'B.glif',
        }),
        entry({
          path: 'Bold.ufo/glyphs/B.glif',
          status: 'localModified',
          glyphName: 'B',
          fileName: 'B.glif',
        }),
      ]),
      fontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
    })
    expect(added.glyphLines[0]?.status).toBe('added')

    const modified = buildChangeReceipt({
      report: report([
        entry({
          path: 'Regular.ufo/glyphs/B.glif',
          status: 'localModified',
          glyphName: 'B',
          fileName: 'B.glif',
          remoteSha: 'x',
        }),
        entry({
          path: 'Bold.ufo/glyphs/B.glif',
          status: 'localModified',
          glyphName: 'B',
          fileName: 'B.glif',
        }),
      ]),
      fontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
    })
    expect(modified.glyphLines[0]?.status).toBe('modified')
  })

  it('leaves remote-only changes off the receipt — they are not ours to send', () => {
    const receipt = buildChangeReceipt({
      report: report([
        entry({ path: 'F.ufo/glyphs/C.glif', status: 'remoteAdded' }),
        entry({ path: 'F.ufo/glyphs/D.glif', status: 'remoteModified' }),
      ]),
      fontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
    })

    expect(receipt.totalCount).toBe(0)
  })

  it('falls back to local dirty ids before the report lands', () => {
    const receipt = buildChangeReceipt({
      report: null,
      fontData,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: ['B'],
    })

    expect(receipt.glyphLines.map((line) => [line.label, line.status])).toEqual(
      [
        ['A', 'modified'],
        ['B', 'deleted'],
      ]
    )
  })
})

describe('font file kinds', () => {
  it('names the well-known font-level files', () => {
    expect(fontFileKindFor('kerning.plist')).toBe('kerning')
    expect(fontFileKindFor('features.fea')).toBe('features')
    expect(fontFileKindFor('MyFont.designspace')).toBe('designspace')
    expect(fontFileKindFor('order.plist')).toBe('order')
  })

  it('returns null for files it cannot explain', () => {
    expect(fontFileKindFor('something.plist')).toBeNull()
  })
})

describe('receipt barcode', () => {
  it('encodes each hex digit as four bars, same hash same bars', () => {
    const bars = barcodeForHash('8f3ac21')
    expect(bars).toEqual(barcodeForHash('8f3ac21'))
    expect(bars).not.toEqual(barcodeForHash('4d9e0b7'))
    // 4 bits per digit, one ink bar and one gap each, plus the two guards.
    expect(bars.filter((bar) => bar.ink)).toHaveLength(7 * 4 + 4)
  })

  it('draws a wide bar for a set bit and a narrow one for a clear bit', () => {
    // 0x8 is 1000, so the first bar is wide and the next three are narrow.
    const bars = barcodeForHash('8')
      .filter((bar) => bar.ink)
      .slice(2, 6)
    expect(bars.map((bar) => bar.width)).toEqual([3, 1, 1, 1])
  })
})

describe('what the commit message may claim', () => {
  const changes = report([
    entry({
      path: 'F.ufo/glyphs/A.glif',
      status: 'localModified',
      remoteSha: 'x',
    }),
    entry({
      path: 'F.ufo/glyphs/B.glif',
      status: 'localModified',
      glyphName: 'B',
      fileName: 'B.glif',
    }),
    entry({
      path: 'F.ufo/glyphs/C.glif',
      status: 'localDeleted',
      glyphName: 'C',
      fileName: 'C.glif',
    }),
  ])

  it('splits added, updated and deleted by the remote baseline', () => {
    const sent = collectSentGlyphChanges({
      report: changes,
      fontData,
      voidedKeys: [],
    })

    expect(sent.updated.map((glyph) => glyph.glyphName)).toEqual(['A'])
    expect(sent.added.map((glyph) => glyph.glyphName)).toEqual(['B'])
    expect(sent.deleted.map((glyph) => glyph.glyphName)).toEqual(['C'])
  })

  it('claims a multi-master glyph once', () => {
    const sent = collectSentGlyphChanges({
      report: report([
        entry({ path: 'Regular.ufo/glyphs/A.glif', status: 'localModified' }),
        entry({ path: 'Bold.ufo/glyphs/A.glif', status: 'localModified' }),
      ]),
      fontData,
      voidedKeys: [],
    })

    expect(sent.added.map((glyph) => glyph.glyphName)).toEqual(['A'])
    expect(sent.updated).toEqual([])
  })

  // Claiming a glyph that was struck out would put a lie in the PR title.
  it('drops struck-out glyphs', () => {
    const sent = collectSentGlyphChanges({
      report: changes,
      fontData,
      voidedKeys: [glyphLineKey('B'), glyphLineKey('C')],
    })

    expect(sent.added).toEqual([])
    expect(sent.deleted).toEqual([])
    expect(sent.updated.map((glyph) => glyph.glyphName)).toEqual(['A'])
  })

  it('claims nothing when everything is struck out', () => {
    const sent = collectSentGlyphChanges({
      report: changes,
      fontData,
      voidedKeys: [glyphLineKey('A'), glyphLineKey('B'), glyphLineKey('C')],
    })

    expect(sent).toEqual({ added: [], updated: [], deleted: [] })
  })
})

describe('striking lines out', () => {
  it('addresses glyphs by id and font files by path', () => {
    const receipt = buildChangeReceipt({
      report: report([
        entry({ path: 'F.ufo/glyphs/A.glif', status: 'localModified' }),
        entry({
          path: 'F.ufo/fontinfo.plist',
          status: 'localModified',
          kind: 'font',
          glyphName: null,
          fileName: 'fontinfo.plist',
        }),
      ]),
      fontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
    })

    expect(
      resolveReceiptExclusions({
        receipt,
        voidedKeys: [glyphLineKey('A'), 'F.ufo/fontinfo.plist'],
      })
    ).toEqual({
      excludePaths: ['F.ufo/fontinfo.plist'],
      excludeGlyphIds: ['A'],
    })
  })

  // Without a report there are no paths yet; the glyph id carries the
  // exclusion either way and the commit resolves it through the format adapter.
  it('uses the same glyph key with no report loaded', () => {
    const receipt = buildChangeReceipt({
      report: null,
      fontData,
      dirtyGlyphIds: ['A', 'B'],
      deletedGlyphIds: [],
    })

    expect(
      resolveReceiptExclusions({ receipt, voidedKeys: [glyphLineKey('B')] })
    ).toEqual({
      excludePaths: [],
      excludeGlyphIds: ['B'],
    })
  })

  it('ignores keys that are not on the receipt', () => {
    const receipt = buildChangeReceipt({
      report: null,
      fontData,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: [],
    })

    expect(resolveReceiptExclusions({ receipt, voidedKeys: ['ZZ'] })).toEqual({
      excludePaths: [],
      excludeGlyphIds: [],
    })
  })
})
