export { gitBlobShaFromText } from '@/lib/github/sync/gitBlobSha'
export {
  buildSyncReport,
  computeFontLevelSyncEntries,
  computeGlyphSyncEntries,
  joinRepoPath,
} from '@/lib/github/sync/computeSyncReport'
export { fetchRemoteTree } from '@/lib/github/sync/remoteTree'
export {
  applyRemoteSnapshot,
  buildProjectSyncReport,
  resolveSyncTarget,
  type ApplyRemoteResult,
} from '@/lib/github/sync/syncEngine'
export type {
  GitHubSyncTarget,
  GlyphSyncEntry,
  GlyphSyncStatus,
  ProjectSyncReport,
  RemoteTreeSnapshot,
  SyncConflictResolution,
} from '@/lib/github/sync/types'
