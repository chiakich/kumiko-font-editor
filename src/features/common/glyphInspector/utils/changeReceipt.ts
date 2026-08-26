import type { ProjectSyncReport } from 'src/lib/github/sync'
import type { FontData, GlyphData } from 'src/store'

export type ChangeReceiptStatus = 'modified' | 'added' | 'deleted' | 'conflict'

export interface ChangeReceiptLine {
  // Git path when the sync report knows it, otherwise the glyph id — either way
  // the stable key the void set is addressed by.
  key: string
  kind: 'glyph' | 'font'
  char: string | null
  label: string
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

const statusForEntry = (
  status: ProjectSyncReport['entries'][number]['status']
): ChangeReceiptStatus | null => {
  switch (status) {
    case 'localModified':
      return 'modified'
    case 'localDeleted':
      return 'deleted'
    case 'conflict':
      return 'conflict'
    default:
      // Remote-only changes are not ours to send.
      return null
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
    const seen = new Set<string>()
    const entries = [...input.report.conflicts, ...input.report.localChanges]
    for (const entry of entries) {
      if (seen.has(entry.path)) {
        continue
      }
      const status = statusForEntry(entry.status)
      if (!status) {
        continue
      }
      seen.add(entry.path)
      const line: ChangeReceiptLine = {
        key: entry.path,
        kind: entry.kind,
        char:
          entry.kind === 'glyph' && entry.glyphName
            ? charForGlyph(glyphByName.get(entry.glyphName))
            : null,
        label: entry.glyphName ?? entry.fileName,
        status,
      }
      if (entry.kind === 'font') {
        fontLines.push(line)
      } else {
        glyphLines.push(line)
      }
    }
  } else {
    for (const glyphId of input.dirtyGlyphIds) {
      const glyph = glyphs[glyphId]
      glyphLines.push({
        key: glyphId,
        kind: 'glyph',
        char: charForGlyph(glyph),
        label: glyph?.name ?? glyphId,
        status: 'modified',
      })
    }
    for (const glyphId of input.deletedGlyphIds) {
      const glyph = glyphs[glyphId]
      glyphLines.push({
        key: glyphId,
        kind: 'glyph',
        char: charForGlyph(glyph),
        label: glyph?.name ?? glyphId,
        status: 'deleted',
      })
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

// What the commit will really carry: struck-out paths are dropped, so the
// suggested message never claims more than the send does.
export const collectSentGlyphChanges = (input: {
  report: ProjectSyncReport | null
  fontData: FontData | null
  voidedPaths: readonly string[]
}): SentGlyphChanges => {
  const voided = new Set(input.voidedPaths)
  const glyphOf = (glyphName: string) => ({
    glyphName,
    unicodes: input.fontData?.glyphs[glyphName]?.unicodes,
  })
  const localChanges = (input.report?.localChanges ?? []).filter(
    (entry) =>
      entry.kind === 'glyph' && entry.glyphName && !voided.has(entry.path)
  )

  return {
    added: localChanges
      .filter((entry) => entry.status !== 'localDeleted' && !entry.remoteSha)
      .map((entry) => glyphOf(entry.glyphName!)),
    updated: localChanges
      .filter((entry) => entry.status !== 'localDeleted' && entry.remoteSha)
      .map((entry) => glyphOf(entry.glyphName!)),
    deleted: localChanges
      .filter((entry) => entry.status === 'localDeleted')
      .map((entry) => glyphOf(entry.glyphName!)),
  }
}
