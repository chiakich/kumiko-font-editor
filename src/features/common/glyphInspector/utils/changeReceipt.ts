import type { ProjectSyncReport } from 'src/lib/github/sync'
import type { FontData, GlyphData } from 'src/store'

export type ChangeReceiptStatus = 'modified' | 'added' | 'deleted' | 'conflict'

// Font-level files a UFO / glyphspackage tree can carry. The receipt shows
// these as what they mean, not as bare plist file names.
export type FontFileKind =
  | 'metainfo'
  | 'fontinfo'
  | 'lib'
  | 'features'
  | 'groups'
  | 'kerning'
  | 'contents'
  | 'layercontents'
  | 'layerinfo'
  | 'order'
  | 'designspace'

const FONT_FILE_KIND_BY_NAME: Record<string, FontFileKind> = {
  'metainfo.plist': 'metainfo',
  'fontinfo.plist': 'fontinfo',
  'lib.plist': 'lib',
  'features.fea': 'features',
  'groups.plist': 'groups',
  'kerning.plist': 'kerning',
  'contents.plist': 'contents',
  'layercontents.plist': 'layercontents',
  'layerinfo.plist': 'layerinfo',
  'order.plist': 'order',
}

export const fontFileKindFor = (fileName: string): FontFileKind | null => {
  if (fileName.toLowerCase().endsWith('.designspace')) {
    return 'designspace'
  }
  return FONT_FILE_KIND_BY_NAME[fileName.toLowerCase()] ?? null
}

// A glyph line's key is the glyph itself, not one of its files: it survives the
// sync report arriving (which swaps ids for paths) and covers every master.
const GLYPH_KEY_PREFIX = 'glyph:'
export const glyphLineKey = (glyphId: string) => `${GLYPH_KEY_PREFIX}${glyphId}`

export interface ChangeReceiptLine {
  // Stable identity the void set is addressed by: glyph lines use the glyph id
  // (report or not), font lines use their git path.
  key: string
  // Git path for font lines. Glyph lines carry none: a glyph can own several
  // paths (one per master), so exclusion goes through the glyph id instead.
  path: string | null
  glyphId: string | null
  kind: 'glyph' | 'font'
  char: string | null
  label: string
  // What a font-level file means, for lines whose file name alone says nothing.
  fontFileKind: FontFileKind | null
  // Secondary line under the label — the git path for font files.
  detail: string | null
  status: ChangeReceiptStatus
}

export interface ChangeReceipt {
  glyphLines: ChangeReceiptLine[]
  fontLines: ChangeReceiptLine[]
  conflictCount: number
  totalCount: number
}

const charForGlyph = (glyph: GlyphData | undefined) => {
  const codePoint = Number.parseInt(glyph?.unicodes?.[0] ?? '', 16)
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : null
}

type ReportEntry = ProjectSyncReport['entries'][number]

const isSendableStatus = (status: ReportEntry['status']) =>
  status === 'localModified' ||
  status === 'localDeleted' ||
  status === 'conflict'

// One status for a glyph across all its masters. Any conflicting master makes
// the whole glyph a conflict; it reads as deleted only when every master
// deletes it; and it is an addition only when no master exists upstream.
const statusForGlyphEntries = (
  entries: readonly ReportEntry[]
): ChangeReceiptStatus => {
  if (entries.some((entry) => entry.status === 'conflict')) {
    return 'conflict'
  }
  if (entries.every((entry) => entry.status === 'localDeleted')) {
    return 'deleted'
  }
  if (entries.every((entry) => entry.remoteSha === null)) {
    return 'added'
  }
  return 'modified'
}

const statusForFontEntry = (entry: ReportEntry): ChangeReceiptStatus => {
  switch (entry.status) {
    case 'localDeleted':
      return 'deleted'
    case 'conflict':
      return 'conflict'
    default:
      return entry.remoteSha === null ? 'added' : 'modified'
  }
}

// The receipt lists what this send would carry. The sync report is the better
// source — it knows git paths and the remote side — but it needs the network, so
// the local dirty ids stand in until it lands.
export const buildChangeReceipt = (input: {
  report: ProjectSyncReport | null
  fontData: FontData | null
  dirtyGlyphIds: readonly string[]
  deletedGlyphIds: readonly string[]
}): ChangeReceipt => {
  const glyphs = input.fontData?.glyphs ?? {}
  const glyphByName = new Map(
    Object.values(glyphs).map((glyph) => [glyph.name, glyph])
  )

  const glyphLines: ChangeReceiptLine[] = []
  const fontLines: ChangeReceiptLine[] = []

  if (input.report) {
    const seenPaths = new Set<string>()
    // One line per glyph, however many masters its change spans.
    const entriesByGlyph = new Map<string, ReportEntry[]>()
    for (const entry of [
      ...input.report.conflicts,
      ...input.report.localChanges,
    ]) {
      if (seenPaths.has(entry.path) || !isSendableStatus(entry.status)) {
        continue
      }
      seenPaths.add(entry.path)
      if (entry.kind === 'glyph' && entry.glyphName) {
        const group = entriesByGlyph.get(entry.glyphName)
        if (group) {
          group.push(entry)
        } else {
          entriesByGlyph.set(entry.glyphName, [entry])
        }
        continue
      }
      fontLines.push({
        key: entry.path,
        path: entry.path,
        glyphId: null,
        kind: 'font',
        char: null,
        label: entry.fileName,
        fontFileKind: fontFileKindFor(entry.fileName),
        detail: entry.path,
        status: statusForFontEntry(entry),
      })
    }
    for (const [glyphName, entries] of entriesByGlyph) {
      glyphLines.push({
        key: glyphLineKey(glyphName),
        path: null,
        glyphId: glyphName,
        kind: 'glyph',
        char: charForGlyph(glyphByName.get(glyphName)),
        label: glyphName,
        fontFileKind: null,
        detail: null,
        status: statusForGlyphEntries(entries),
      })
    }
  } else {
    const localLine = (
      glyphId: string,
      status: ChangeReceiptStatus
    ): ChangeReceiptLine => {
      const glyph = glyphs[glyphId]
      return {
        key: glyphLineKey(glyphId),
        path: null,
        glyphId,
        kind: 'glyph',
        char: charForGlyph(glyph),
        label: glyph?.name ?? glyphId,
        fontFileKind: null,
        detail: null,
        status,
      }
    }
    // A glyph edited and then deleted sits in both lists; deletion is what the
    // send will carry, so that is the one line it gets.
    const deleted = new Set(input.deletedGlyphIds)
    for (const glyphId of input.dirtyGlyphIds) {
      if (!deleted.has(glyphId)) {
        glyphLines.push(localLine(glyphId, 'modified'))
      }
    }
    for (const glyphId of input.deletedGlyphIds) {
      glyphLines.push(localLine(glyphId, 'deleted'))
    }
  }

  const all = [...glyphLines, ...fontLines]
  return {
    glyphLines,
    fontLines,
    conflictCount: all.filter((line) => line.status === 'conflict').length,
    totalCount: all.length,
  }
}

export interface ReceiptBar {
  width: number
  ink: boolean
}

// One bar per bit of the hash, wide for 1 and narrow for 0, guard bars at both
// ends: the same hash always draws the same barcode, so it reads as the object
// id it is rather than as decoration.
export const barcodeForHash = (hash: string): ReceiptBar[] => {
  const bars: ReceiptBar[] = []
  const push = (width: number, ink: boolean) => bars.push({ width, ink })
  const guard = () => {
    push(1, true)
    push(1, false)
    push(1, true)
    push(2, false)
  }

  guard()
  for (const digit of hash.toLowerCase()) {
    const value = Number.parseInt(digit, 16)
    if (Number.isNaN(value)) {
      continue
    }
    for (let bit = 3; bit >= 0; bit -= 1) {
      push((value >> bit) & 1 ? 3 : 1, true)
      push(2, false)
    }
  }
  guard()

  return bars
}

export interface SentGlyphChanges {
  added: { glyphName: string; unicodes?: readonly string[] }[]
  updated: { glyphName: string; unicodes?: readonly string[] }[]
  deleted: { glyphName: string; unicodes?: readonly string[] }[]
}

// What the commit will really carry: struck-out glyphs are dropped, so the
// suggested message never claims more than the send does. Voided keys are line
// keys, matching what the receipt hands the void set.
export const collectSentGlyphChanges = (input: {
  report: ProjectSyncReport | null
  fontData: FontData | null
  voidedKeys: readonly string[]
}): SentGlyphChanges => {
  const voided = new Set(input.voidedKeys)
  const glyphOf = (glyphName: string) => ({
    glyphName,
    unicodes: input.fontData?.glyphs[glyphName]?.unicodes,
  })
  // Grouped like the receipt: a glyph changed in several masters is still one
  // claim in the message.
  const entriesByGlyph = new Map<string, ReportEntry[]>()
  for (const entry of input.report?.localChanges ?? []) {
    if (
      entry.kind !== 'glyph' ||
      !entry.glyphName ||
      voided.has(glyphLineKey(entry.glyphName))
    ) {
      continue
    }
    const group = entriesByGlyph.get(entry.glyphName)
    if (group) {
      group.push(entry)
    } else {
      entriesByGlyph.set(entry.glyphName, [entry])
    }
  }

  const sent: SentGlyphChanges = { added: [], updated: [], deleted: [] }
  for (const [glyphName, entries] of entriesByGlyph) {
    const status = statusForGlyphEntries(entries)
    if (status === 'deleted') {
      sent.deleted.push(glyphOf(glyphName))
    } else if (status === 'added') {
      sent.added.push(glyphOf(glyphName))
    } else {
      sent.updated.push(glyphOf(glyphName))
    }
  }
  return sent
}

export interface ReceiptExclusions {
  excludePaths: string[]
  excludeGlyphIds: string[]
}

// Struck-out lines, split by how the commit can address them. Glyph lines go by
// glyph id — the adapter resolves every master's path at commit time, so this
// works with no sync report loaded and never misses a sibling master. Font
// lines go by their git path.
export const resolveReceiptExclusions = (input: {
  receipt: ChangeReceipt
  voidedKeys: readonly string[]
}): ReceiptExclusions => {
  const voided = new Set(input.voidedKeys)
  const lines = [
    ...input.receipt.glyphLines,
    ...input.receipt.fontLines,
  ].filter((line) => voided.has(line.key))

  return {
    excludePaths: lines.flatMap((line) => (line.path ? [line.path] : [])),
    excludeGlyphIds: lines.flatMap((line) =>
      line.glyphId ? [line.glyphId] : []
    ),
  }
}
