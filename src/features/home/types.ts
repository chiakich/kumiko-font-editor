import type { KumikoProjectSummary } from '@/lib/project/projectTypes'

export interface PendingGitHubImport {
  repo: string
  ref: string
  repoUrl: string | null
}

export type ProjectOpenHandler = (
  project: KumikoProjectSummary
) => Promise<void>
