import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyRemoteSnapshot,
  buildProjectSyncReport,
  type SyncConflictResolution,
} from 'src/lib/githubSync'
import { loadUfoProjectIntoFontData } from 'src/lib/fontAdapters/ufo'
import { listDirtyUfoGlyphs, loadUfoUiValue } from 'src/lib/ufoPersistence'
import { UFO_LOCAL_DELETED_GLYPHS_KEY } from 'src/lib/draftSave'
import {
  sanitizeGlyphEditTimes,
  UFO_GLYPH_EDIT_TIMES_KEY,
} from 'src/lib/glyphEditTimes'
import { useStore } from 'src/store'
import { getActiveUfoIdFromArchive } from 'src/features/common/glyphInspector/githubCommitFlowUtils'

const syncReportQueryKey = (projectId: string | null) => [
  'githubSyncReport',
  projectId,
]

export const useGitHubSyncStatus = (input: {
  projectId: string | null
  enabled: boolean
}) => {
  const queryClient = useQueryClient()
  const loadProjectState = useStore((state) => state.loadProjectState)
  const hydratePersistedLocalChanges = useStore(
    (state) => state.hydratePersistedLocalChanges
  )
  const [resolutions, setResolutions] = useState<
    Record<string, SyncConflictResolution>
  >({})

  const reportQuery = useQuery({
    queryKey: syncReportQueryKey(input.projectId),
    enabled: input.enabled && Boolean(input.projectId),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const activeUfoId = getActiveUfoIdFromArchive()
      if (!input.projectId || !activeUfoId) {
        return null
      }
      return buildProjectSyncReport({
        projectId: input.projectId,
        activeUfoId,
      })
    },
  })

  const reloadProjectFromPersistence = async (projectId: string) => {
    const loadedProject = await loadUfoProjectIntoFontData(projectId)
    if (!loadedProject) {
      return
    }
    loadProjectState(
      loadedProject.project.projectId,
      loadedProject.project.title,
      loadedProject.fontData,
      loadedProject.projectMetadata,
      'ufo',
      'ufo'
    )
    const dirtyGlyphs = await listDirtyUfoGlyphs(projectId)
    const deletedGlyphIds =
      (await loadUfoUiValue<string[]>(
        projectId,
        UFO_LOCAL_DELETED_GLYPHS_KEY
      )) ?? []
    const glyphEditTimes = sanitizeGlyphEditTimes(
      await loadUfoUiValue(projectId, UFO_GLYPH_EDIT_TIMES_KEY)
    )
    hydratePersistedLocalChanges(
      dirtyGlyphs.map((glyph) => glyph.glyphName),
      deletedGlyphIds,
      glyphEditTimes
    )
  }

  const applyMutation = useMutation({
    mutationFn: async () => {
      const activeUfoId = getActiveUfoIdFromArchive()
      const report = reportQuery.data
      if (!input.projectId || !activeUfoId || !report) {
        throw new Error('目前沒有可套用的遠端更新')
      }
      const result = await applyRemoteSnapshot({
        projectId: input.projectId,
        activeUfoId,
        report,
        resolutions,
      })
      await reloadProjectFromPersistence(input.projectId)
      return result
    },
    onSuccess: () => {
      setResolutions({})
      void queryClient.invalidateQueries({
        queryKey: syncReportQueryKey(input.projectId),
      })
    },
  })

  const setResolution = (path: string, resolution: SyncConflictResolution) =>
    setResolutions((current) => ({ ...current, [path]: resolution }))

  const report = reportQuery.data ?? null
  const unresolvedConflictCount = report
    ? report.conflicts.filter((entry) => !resolutions[entry.path]).length
    : 0

  return {
    report,
    isLoading: reportQuery.isFetching,
    errorMessage:
      reportQuery.error instanceof Error ? reportQuery.error.message : null,
    refetch: reportQuery.refetch,
    resolutions,
    setResolution,
    applyRemote: applyMutation.mutateAsync,
    isApplying: applyMutation.isPending,
    unresolvedConflictCount,
  }
}

export type GitHubSyncStatusModel = ReturnType<typeof useGitHubSyncStatus>
