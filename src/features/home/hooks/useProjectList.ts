import { useCallback, useEffect, useState } from 'react'
import {
  deleteKumikoProject,
  listProjectSummaries,
  loadProjectDraft,
  renameKumikoProject,
} from 'src/lib/project/projectRepository'
import type { KumikoProjectSummary } from 'src/lib/project/projectTypes'
import { loadUfoProjectIntoFontData } from 'src/lib/fontFormats/adapters/ufo'
import type { FontData } from 'src/store'

export interface LoadedKumikoProject {
  id: string
  title: string
  fontData: FontData
  projectMetadata: Record<string, unknown> | null
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
      if (project.projectRoundTripFormat === 'ufo') {
        const loadedProject = await loadUfoProjectIntoFontData(project.id)
        if (loadedProject) {
          return {
            id: loadedProject.project.projectId,
            title: loadedProject.project.title,
            fontData: loadedProject.fontData,
            projectMetadata: loadedProject.projectMetadata,
            projectSourceFormat: 'ufo',
            projectRoundTripFormat: 'ufo',
          }
        }
      }

      const draft = await loadProjectDraft(project.id)
      if (!draft?.fontData) {
        return null
      }

      return {
        id: draft.id,
        title: draft.title,
        fontData: draft.fontData,
        projectMetadata: draft.projectMetadata ?? null,
        projectSourceFormat: draft.projectSourceFormat ?? null,
        projectRoundTripFormat: draft.projectRoundTripFormat ?? null,
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
