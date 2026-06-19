import { useCallback, useEffect, useState } from 'react'
import {
  deleteKumikoProject,
  listProjectSummaries,
  loadProjectDraftMetadata,
  renameKumikoProject,
} from 'src/lib/project/projectRepository'
import {
  acquireProjectWriteLock,
  releaseProjectWriteLock,
} from 'src/lib/project/projectWriteLock'
import type { KumikoProjectSummary } from 'src/lib/project/projectTypes'
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'
import type { FontData } from 'src/store'

export interface LoadedKumikoProject {
  id: string
  title: string
  fontData: FontData
  projectMetadata: Record<string, unknown> | null
  projectUiState?: KumikoProjectUiState | null
  projectSourceFormat: KumikoProjectSummary['projectSourceFormat']
  projectRoundTripFormat: KumikoProjectSummary['projectRoundTripFormat']
}

export const useProjectList = () => {
  const [projects, setProjects] = useState<KumikoProjectSummary[]>([])

  useEffect(() => {
    listProjectSummaries().then(setProjects).catch(console.error)
  }, [])

  const upsertProjectSummary = useCallback((project: KumikoProjectSummary) => {
    setProjects((current) => [
      project,
      ...current.filter((item) => item.id !== project.id),
    ])
  }, [])

  const openProject = useCallback(
    async (
      project: KumikoProjectSummary
    ): Promise<LoadedKumikoProject | null> => {
      const lock = await acquireProjectWriteLock(project.id)
      if (!lock.acquired) {
        throw new Error('這個專案目前已在另一個分頁中開啟。')
      }

      try {
        const draft = await loadProjectDraftMetadata(project.id)
        if (!draft?.fontData) {
          await releaseProjectWriteLock(project.id)
          return null
        }

        return {
          id: draft.id,
          title: draft.title,
          fontData: draft.fontData,
          projectMetadata: draft.projectMetadata ?? null,
          projectUiState: draft.projectUiState ?? null,
          projectSourceFormat: draft.projectSourceFormat ?? null,
          projectRoundTripFormat: draft.projectRoundTripFormat ?? null,
        }
      } catch (error) {
        await releaseProjectWriteLock(project.id)
        throw error
      }
    },
    []
  )

  const renameProject = useCallback(
    async (projectId: string, title: string) => {
      await renameKumikoProject(projectId, title)
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, title } : project
        )
      )
    },
    []
  )

  const deleteProject = useCallback(async (projectId: string) => {
    await deleteKumikoProject(projectId)
    setProjects((current) =>
      current.filter((project) => project.id !== projectId)
    )
  }, [])

  return {
    projects,
    upsertProjectSummary,
    openProject,
    renameProject,
    deleteProject,
  }
}
