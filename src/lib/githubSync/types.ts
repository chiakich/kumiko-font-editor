export interface GitHubSyncTarget {
  owner: string
  repo: string
  ref: string
  commitSha: string | null
  syncedAt: number
}

export type GlyphSyncStatus =
  | 'unchanged'
  | 'localModified'
  | 'localDeleted'
  | 'remoteModified'
  | 'remoteAdded'
  | 'remoteDeleted'
  | 'conflict'

export interface GlyphSyncEntry {
  // Null when only the remote knows this file (remoteAdded).
  glyphName: string | null
  fileName: string
  path: string
  status: GlyphSyncStatus
  baselineSha: string | null
  remoteSha: string | null
}

export interface ProjectSyncReport {
  target: { owner: string; repo: string; ref: string }
  remoteHeadSha: string
  remoteTreeTruncated: boolean
  entries: GlyphSyncEntry[]
  conflicts: GlyphSyncEntry[]
  remoteChanges: GlyphSyncEntry[]
  localChanges: GlyphSyncEntry[]
  isUpToDate: boolean
}

export type SyncConflictResolution = 'keepLocal' | 'takeRemote'

export interface RemoteTreeSnapshot {
  commitSha: string
  truncated: boolean
  blobShaByPath: Map<string, string>
}
