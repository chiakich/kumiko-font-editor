import type { UfoGlyphRecord } from 'src/lib/ufoTypes'
import type {
  GlyphSyncEntry,
  GlyphSyncStatus,
  ProjectSyncReport,
  RemoteTreeSnapshot,
} from 'src/lib/githubSync/types'

export const joinRepoPath = (...parts: Array<string | null | undefined>) =>
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')

const resolveStatus = (input: {
  dirty: boolean
  baselineSha: string | null
  remoteSha: string | null
}): GlyphSyncStatus => {
  const { dirty, baselineSha, remoteSha } = input

  if (remoteSha === null) {
    if (baselineSha === null) {
      // Never synced and not on the remote: a purely local glyph.
      return dirty ? 'localModified' : 'unchanged'
    }
    return dirty ? 'conflict' : 'remoteDeleted'
  }

  if (remoteSha === baselineSha) {
    return dirty ? 'localModified' : 'unchanged'
  }

  // Unknown baseline counts as a remote change so a pull re-establishes it.
  return dirty ? 'conflict' : 'remoteModified'
}

export const computeGlyphSyncEntries = (input: {
  glyphs: UfoGlyphRecord[]
  // Glyphs deleted locally but not yet committed, as glyphName → fileName.
  locallyDeletedFiles: Record<string, string>
  glyphDirPath: string
  remote: RemoteTreeSnapshot
}): GlyphSyncEntry[] => {
  const { glyphs, locallyDeletedFiles, glyphDirPath, remote } = input
  const entries: GlyphSyncEntry[] = []
  const seenPaths = new Set<string>()

  for (const glyph of glyphs) {
    const path = joinRepoPath(glyphDirPath, glyph.fileName)
    seenPaths.add(path)
    entries.push({
      glyphName: glyph.glyphName,
      fileName: glyph.fileName,
      path,
      status: resolveStatus({
        dirty: glyph.dirty,
        baselineSha: glyph.remoteBlobSha ?? null,
        remoteSha: remote.blobShaByPath.get(path) ?? null,
      }),
      baselineSha: glyph.remoteBlobSha ?? null,
      remoteSha: remote.blobShaByPath.get(path) ?? null,
    })
  }

  for (const [glyphName, fileName] of Object.entries(locallyDeletedFiles)) {
    const path = joinRepoPath(glyphDirPath, fileName)
    if (seenPaths.has(path)) {
      continue
    }
    seenPaths.add(path)
    const remoteSha = remote.blobShaByPath.get(path) ?? null
    entries.push({
      glyphName,
      fileName,
      path,
      // The local record is gone, so a diverged remote can't be detected;
      // the deletion is surfaced as a local change and wins on commit.
      status: remoteSha === null ? 'unchanged' : 'localDeleted',
      baselineSha: null,
      remoteSha,
    })
  }

  const glyphDirPrefix = `${glyphDirPath}/`
  for (const [path, remoteSha] of remote.blobShaByPath) {
    if (
      seenPaths.has(path) ||
      !path.startsWith(glyphDirPrefix) ||
      !path.toLowerCase().endsWith('.glif') ||
      path.slice(glyphDirPrefix.length).includes('/')
    ) {
      continue
    }
    entries.push({
      glyphName: null,
      fileName: path.slice(glyphDirPrefix.length),
      path,
      status: 'remoteAdded',
      baselineSha: null,
      remoteSha,
    })
  }

  return entries
}

export const buildSyncReport = (input: {
  target: { owner: string; repo: string; ref: string }
  remote: RemoteTreeSnapshot
  entries: GlyphSyncEntry[]
}): ProjectSyncReport => {
  const { target, remote, entries } = input
  const conflicts = entries.filter((entry) => entry.status === 'conflict')
  const remoteChanges = entries.filter(
    (entry) =>
      entry.status === 'remoteModified' ||
      entry.status === 'remoteAdded' ||
      entry.status === 'remoteDeleted'
  )
  const localChanges = entries.filter(
    (entry) =>
      entry.status === 'localModified' || entry.status === 'localDeleted'
  )

  return {
    target,
    remoteHeadSha: remote.commitSha,
    remoteTreeTruncated: remote.truncated,
    entries,
    conflicts,
    remoteChanges,
    localChanges,
    isUpToDate: conflicts.length === 0 && remoteChanges.length === 0,
  }
}
