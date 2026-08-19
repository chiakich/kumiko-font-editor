import {
  applyKumikoRemoteSnapshot,
  buildKumikoProjectSyncReport,
} from 'src/lib/github/sync/kumikoUfoSync'
import type {
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'

export { resolveKumikoSyncTarget as resolveSyncTarget } from 'src/lib/github/sync/kumikoUfoSync'

export const buildProjectSyncReport = async (input: {
  projectId: string
}): Promise<ProjectSyncReport | null> => buildKumikoProjectSyncReport(input)

export interface ApplyRemoteResult {
  appliedCount: number
  remainingConflicts: number
}

export const applyRemoteSnapshot = async (input: {
  projectId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
}): Promise<ApplyRemoteResult> => applyKumikoRemoteSnapshot(input)
