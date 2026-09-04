import type { GitHubSyncTarget } from '@/lib/github/sync/types'
import type { KumikoProjectRecord } from '@/lib/project/kumikoProjectTypes'

export const sameGitTarget = (
  left: Pick<GitHubSyncTarget, 'owner' | 'repo' | 'ref'>,
  right: Pick<GitHubSyncTarget, 'owner' | 'repo' | 'ref'>
) =>
  left.owner === right.owner &&
  left.repo === right.repo &&
  left.ref === right.ref

export const baseTargetForProject = (
  project: KumikoProjectRecord
): GitHubSyncTarget | null => {
  const saved = project.sourceData?.ufo?.gitCollaboration?.base
  if (saved) {
    return saved
  }
  const source = project.githubSource
  if (!source) {
    return null
  }
  return {
    owner: source.owner,
    repo: source.repo,
    ref: source.ref,
    commitSha: source.commitSha ?? null,
    syncedAt: project.createdAt,
  }
}

export const changeDraftsForProject = (project: KumikoProjectRecord) =>
  project.sourceData?.ufo?.gitCollaboration?.changeDrafts ?? []

export const withUpdatedChangeDraft = (input: {
  project: KumikoProjectRecord
  draft: GitHubSyncTarget
}) => {
  const base = baseTargetForProject(input.project)
  const existing = changeDraftsForProject(input.project)
  const changeDrafts = [
    ...existing.filter((candidate) => !sameGitTarget(candidate, input.draft)),
    ...(base && sameGitTarget(base, input.draft) ? [] : [input.draft]),
  ]
  return {
    base,
    changeDrafts,
  }
}
