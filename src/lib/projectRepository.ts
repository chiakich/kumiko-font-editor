import {
  deleteProject,
  getAllProjects,
  loadProject,
  saveProject,
  type ProjectDraft,
} from 'src/lib/persistence'
import { toProjectSummary } from 'src/lib/projectTypes'
import { deleteUfoProjectData } from 'src/lib/ufoPersistence'

export const listProjectSummaries = async () => {
  const projects = await getAllProjects()
  return projects.sort((a, b) => b.updatedAt - a.updatedAt)
}

export const loadProjectDraft = loadProject

export const saveProjectDraft = async (draft: ProjectDraft) => {
  await saveProject(draft)
  return toProjectSummary(draft)
}

export const deleteKumikoProject = async (projectId: string) => {
  await deleteProject(projectId)
  await deleteUfoProjectData(projectId)
}

export type {
  KumikoProjectDraft,
  KumikoProjectSummary,
} from 'src/lib/projectTypes'
