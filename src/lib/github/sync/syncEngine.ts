import {
  applyKumikoRemoteSnapshot,
  buildKumikoProjectSyncReport,
  resolveKumikoSyncTarget,
} from 'src/lib/github/sync/kumikoUfoSync'
import type {
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'
import { buildGitSyncReport } from 'src/lib/git/gitSync'
import { loadGitSyncEnabled } from 'src/lib/preferences/appPreferences'
import { loadKumikoProjectRecord } from 'src/lib/project/kumikoProjectPersistence'
import type { EntitySyncStatus } from 'src/lib/git/entitySync'
import type { GlyphSyncStatus } from 'src/lib/github/sync/types'

export { resolveKumikoSyncTarget as resolveSyncTarget } from 'src/lib/github/sync/kumikoUfoSync'

// The entity statuses map one-to-one onto the report shape the UI already
// renders, so switching transports does not change the conflict UI.
const toGlyphSyncStatus = (status: EntitySyncStatus): GlyphSyncStatus => status

// Presents a git-derived report in the existing ProjectSyncReport shape. The
// merge base replaces the stored per-file baselines, so baselineSha carries the
// base content marker rather than a persisted hash.
const asProjectSyncReport = (
  report: Awaited<ReturnType<typeof buildGitSyncReport>>,
  target: { owner: string; repo: string; ref: string }
): ProjectSyncReport => {
  const entries = report.entries.map((entry) => ({
    kind:
      entry.entity.kind === 'glyph' ? ('glyph' as const) : ('font' as const),
    glyphName: entry.entity.kind === 'glyph' ? entry.entity.name : null,
    fileName: entry.path.slice(entry.path.lastIndexOf('/') + 1),
    path: entry.path,
    status: toGlyphSyncStatus(entry.status),
    baselineSha: entry.baseText === null ? null : report.mergeBaseSha,
    remoteSha: entry.remoteText === null ? null : report.remoteHeadSha,
  }))

  return {
    target,
    remoteHeadSha: report.remoteHeadSha,
    remoteTreeTruncated: false,
    entries,
    conflicts: entries.filter((entry) => entry.status === 'conflict'),
    remoteChanges: entries.filter(
      (entry) =>
        entry.status === 'remoteModified' ||
        entry.status === 'remoteAdded' ||
        entry.status === 'remoteDeleted'
    ),
    localChanges: entries.filter(
      (entry) =>
        entry.status === 'localModified' || entry.status === 'localDeleted'
    ),
    isUpToDate: report.isUpToDate,
  }
}

export const buildProjectSyncReport = async (input: {
  projectId: string
}): Promise<ProjectSyncReport | null> => {
  if (!loadGitSyncEnabled()) {
    return buildKumikoProjectSyncReport(input)
  }

  const project = await loadKumikoProjectRecord(input.projectId)
  const target = project ? resolveKumikoSyncTarget(project) : null
  if (!target) {
    return null
  }

  const report = await buildGitSyncReport({
    target: {
      projectId: input.projectId,
      repo: `${target.owner}/${target.repo}`,
      branch: target.ref,
    },
  })
  return asProjectSyncReport(report, {
    owner: target.owner,
    repo: target.repo,
    ref: target.ref,
  })
}

export interface ApplyRemoteResult {
  appliedCount: number
  remainingConflicts: number
}

export const applyRemoteSnapshot = async (input: {
  projectId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
}): Promise<ApplyRemoteResult> => applyKumikoRemoteSnapshot(input)
