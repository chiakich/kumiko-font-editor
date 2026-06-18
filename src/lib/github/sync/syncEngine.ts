import { buildKumikoProjectSyncReport } from 'src/lib/github/sync/kumikoUfoSync'
import type {
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'

export { resolveKumikoSyncTarget as resolveSyncTarget } from 'src/lib/github/sync/kumikoUfoSync'

export const buildProjectSyncReport = async (input: {
  projectId: string
  activeUfoId: string
}): Promise<ProjectSyncReport | null> => buildKumikoProjectSyncReport(input)

export interface ApplyRemoteResult {
  appliedCount: number
  remainingConflicts: number
}

export const applyRemoteSnapshot = async (input: {
  projectId: string
  activeUfoId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
}): Promise<ApplyRemoteResult> => {
  void input
  throw new Error('套用遠端更新尚未接上 Kumiko canonical storage')
}
