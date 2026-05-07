import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  createGitHubCommit,
  createGitHubFork,
  fetchGitHubCompareStatus,
  fetchGitHubForkStatus,
  fetchGitHubViewer,
  logoutGitHubOAuth,
  mergeGitHubUpstream,
  type GitHubCompareStatusResponse,
  type GitHubForkStatus,
} from 'src/lib/githubAuth'
import { githubQueryKeys } from 'src/lib/githubQueryKeys'

export const fetchCachedGitHubForkStatus = (
  queryClient: QueryClient,
  input: {
    repo: string
    branch?: string | null
  }
) => {
  const branch = input.branch?.trim() || null
  return queryClient.fetchQuery({
    queryKey: githubQueryKeys.forkStatus(input.repo, branch),
    queryFn: () => fetchGitHubForkStatus(input.repo, branch ?? undefined),
    staleTime: 30_000,
  })
}

export const fetchCachedGitHubCompareStatus = (
  queryClient: QueryClient,
  input: {
    repo: string
    headOwner: string
    headBranch: string
  }
) => {
  const headBranch = input.headBranch.trim()
  return queryClient.fetchQuery({
    queryKey: githubQueryKeys.compareStatus(
      input.repo,
      input.headOwner,
      headBranch
    ),
    queryFn: () =>
      fetchGitHubCompareStatus({
        repo: input.repo,
        headOwner: input.headOwner,
        headBranch,
      }),
    staleTime: 30_000,
  })
}

export const useGitHubViewerQuery = (enabled: boolean) =>
  useQuery({
    queryKey: githubQueryKeys.viewer(),
    queryFn: fetchGitHubViewer,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  })

export const useGitHubForkStatusQuery = (input: {
  repo: string | null
  branch: string | null
  enabled: boolean
}) =>
  useQuery({
    queryKey: githubQueryKeys.forkStatus(input.repo, input.branch),
    queryFn: () =>
      fetchGitHubForkStatus(input.repo!, input.branch ?? undefined),
    enabled: input.enabled && Boolean(input.repo),
    retry: false,
    staleTime: 30_000,
  })

export const useGitHubCompareStatusQuery = (input: {
  repo: string | null
  headOwner: string | null
  headBranch: string | null
  enabled: boolean
}) =>
  useQuery({
    queryKey: githubQueryKeys.compareStatus(
      input.repo,
      input.headOwner,
      input.headBranch
    ),
    queryFn: () =>
      fetchGitHubCompareStatus({
        repo: input.repo!,
        headOwner: input.headOwner!,
        headBranch: input.headBranch!,
      }),
    enabled:
      input.enabled &&
      Boolean(input.repo) &&
      Boolean(input.headOwner) &&
      Boolean(input.headBranch),
    retry: false,
    staleTime: 30_000,
  })

export const useLoginGitHubMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (login: () => Promise<void>) => {
      await login()
      return fetchGitHubViewer()
    },
    onSuccess: (viewer) => {
      queryClient.setQueryData(githubQueryKeys.viewer(), viewer)
    },
  })
}

export const useLogoutGitHubMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logoutGitHubOAuth,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: githubQueryKeys.all })
    },
  })
}

export const useCreateGitHubForkMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createGitHubFork,
    onSuccess: (forkStatus) => {
      queryClient.setQueryData(
        githubQueryKeys.forkStatus(
          forkStatus.sourceRepo.fullName,
          forkStatus.selectedBranch
        ),
        forkStatus
      )
    },
  })
}

export const useMergeGitHubUpstreamMutation = () =>
  useMutation({
    mutationFn: mergeGitHubUpstream,
  })

export const useCreateGitHubCommitMutation = () =>
  useMutation({
    mutationFn: createGitHubCommit,
  })

export const setForkStatusQueryData = (
  queryClient: QueryClient,
  current: GitHubForkStatus,
  update: Partial<GitHubForkStatus> = {}
) => {
  const next = {
    ...current,
    ...update,
  }
  queryClient.setQueryData(
    githubQueryKeys.forkStatus(next.sourceRepo.fullName, next.selectedBranch),
    next
  )
  return next
}

export const applyCompareToForkStatus = (
  forkStatus: GitHubForkStatus,
  compareStatus: GitHubCompareStatusResponse,
  selectedBranch: string
): GitHubForkStatus => ({
  ...forkStatus,
  compare: compareStatus.compare,
  selectedBranch,
})
