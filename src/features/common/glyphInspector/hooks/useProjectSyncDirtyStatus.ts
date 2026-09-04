import { useQuery } from '@tanstack/react-query'
import { getKumikoProjectDirtyState } from '@/lib/project/kumikoProjectPersistence'

export const projectSyncDirtyStatusQueryKey = (projectId: string | null) => [
  'projectSyncDirtyStatus',
  projectId,
]

export const useProjectSyncDirtyStatus = (input: {
  projectId: string | null
  enabled: boolean
}) =>
  useQuery({
    queryKey: projectSyncDirtyStatusQueryKey(input.projectId),
    enabled: input.enabled && Boolean(input.projectId),
    staleTime: 5_000,
    queryFn: async () => {
      if (!input.projectId) {
        return false
      }
      return (await getKumikoProjectDirtyState(input.projectId)).syncDirty
    },
  })
