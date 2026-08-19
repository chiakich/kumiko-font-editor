export { gitBlobShaFromText } from 'src/lib/github/sync/gitBlobSha'
export {
  buildSyncReport,
  computeFontLevelSyncEntries,
  computeGlyphSyncEntries,
  joinRepoPath,
} from 'src/lib/github/sync/computeSyncReport'
export { fetchRemoteTree } from 'src/lib/github/sync/remoteTree'
export {
  applyRemoteSnapshot,
  buildProjectSyncReport,
  resolveSyncTarget,
  type ApplyRemoteResult,
} from 'src/lib/github/sync/syncEngine'
export type {
  GitHubSyncTarget,
  GlyphSyncEntry,
  GlyphSyncStatus,
  ProjectSyncReport,
  RemoteTreeSnapshot,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'
