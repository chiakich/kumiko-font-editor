import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { buildProjectSyncReport } from '@/lib/github/sync'
import { fetchCachedGitHubForkStatus } from '@/lib/github/githubQueries'
import { githubSyncReportQueryKey } from '@/features/common/glyphInspector/hooks/useGitHubSyncStatus'

// One warm-up per project per session. The send panel triggers the same
// queries again when it needs fresh data; what this buys is the one-time
// costs — loading the git chunk, spawning the worker, cloning the packfile
// into OPFS — which otherwise all land on the first panel open.
const prewarmedProjects = new Set<string>()

// Starts the git sync stack in the background as soon as a GitHub-backed
// project is open and the user is signed in, so the first send-panel open
// finds a cloned repository, a warm worker and cached fork status instead of
// paying for all of them at once.
export const useGitSyncPrewarm = (input: {
  projectId: string | null
  repoFullName: string | null
  // Sign-in gates the warm-up: the git proxy and the fork-status endpoint both
  // reject anonymous calls, so firing earlier only produces failed requests.
  enabled: boolean
}) => {
  const queryClient = useQueryClient()
  const { projectId, repoFullName, enabled } = input

  useEffect(() => {
    if (!enabled || !projectId || !repoFullName) {
      return
    }
    const key = `${projectId}::${repoFullName}`
    if (prewarmedProjects.has(key)) {
      return
    }
    prewarmedProjects.add(key)

    // Same query keys the send panel reads, so its first render is a cache
    // hit. prefetchQuery never throws; the fork-status fetch can.
    void queryClient.prefetchQuery({
      queryKey: githubSyncReportQueryKey(projectId),
      queryFn: () => buildProjectSyncReport({ projectId }),
      staleTime: 30_000,
      retry: false,
    })
    fetchCachedGitHubForkStatus(queryClient, { repo: repoFullName }).catch(
      () => undefined
    )
  }, [enabled, projectId, repoFullName, queryClient])
}
