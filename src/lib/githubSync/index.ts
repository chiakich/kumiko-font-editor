export { gitBlobShaFromText } from 'src/lib/githubSync/gitBlobSha'
export {
  buildSyncReport,
  computeGlyphSyncEntries,
  joinRepoPath,
} from 'src/lib/githubSync/computeSyncReport'
export { fetchRemoteTree } from 'src/lib/githubSync/remoteTree'
export {
  applyRemoteSnapshot,
  buildProjectSyncReport,
  resolveSyncTarget,
  type ApplyRemoteResult,
} from 'src/lib/githubSync/syncEngine'
export type {
  GitHubSyncTarget,
  GlyphSyncEntry,
  GlyphSyncStatus,
  ProjectSyncReport,
  RemoteTreeSnapshot,
  SyncConflictResolution,
} from 'src/lib/githubSync/types'
