import { useCallback, useMemo } from 'react'
import {
  sanitizeGlyphEditTimes,
  UFO_GLYPH_EDIT_TIMES_KEY,
} from 'src/lib/glyph/glyphEditTimes'
import {
  listExportDirtyKumikoGlyphRecords,
  loadKumikoUiValue,
} from 'src/lib/project/kumikoProjectPersistence'
import { useStore } from 'src/store'
import { useGitHubImport } from 'src/features/home/hooks/useGitHubImport'
import { useLocalImport } from 'src/features/home/hooks/useLocalImport'
import {
  type LoadedKumikoProject,
  useProjectList,
} from 'src/features/home/hooks/useProjectList'

export function useHomeProjects() {
  const loadProjectState = useStore((state) => state.loadProjectState)
  const hydratePersistedLocalChanges = useStore(
    (state) => state.hydratePersistedLocalChanges
  )
  const {
    projects,
    upsertProjectSummary,
    openProject,
    renameProject,
    deleteProject,
  } = useProjectList()

  const restorePersistedUfoChanges = useCallback(
    async (projectId: string) => {
      const dirtyGlyphs = await listExportDirtyKumikoGlyphRecords(projectId)
      const glyphEditTimes = sanitizeGlyphEditTimes(
        await loadKumikoUiValue(projectId, UFO_GLYPH_EDIT_TIMES_KEY)
      )
      hydratePersistedLocalChanges(
        dirtyGlyphs.map((glyph) => glyph.glyphId),
        [],
        glyphEditTimes
      )
    },
    [hydratePersistedLocalChanges]
  )

  const loadImportedProject = useCallback(
    async (project: LoadedKumikoProject) => {
      loadProjectState(
        project.id,
        project.title,
        project.fontData,
        project.projectMetadata,
        project.projectSourceFormat,
        project.projectRoundTripFormat,
        project.projectUiState
      )

      await restorePersistedUfoChanges(project.id)
    },
    [loadProjectState, restorePersistedUfoChanges]
  )

  const importHandlers = useMemo(
    () => ({
      onProjectImported: loadImportedProject,
      onProjectSummarySaved: upsertProjectSummary,
    }),
    [loadImportedProject, upsertProjectSummary]
  )

  const localImport = useLocalImport(importHandlers)
  const githubImport = useGitHubImport(importHandlers)

  const handleOpenProject = async (project: (typeof projects)[number]) => {
    try {
      const loadedProject = await openProject(project)
      if (!loadedProject) {
        return
      }

      await loadImportedProject(loadedProject)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '開啟專案失敗')
    }
  }

  const handleRenameProject = async (id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) {
      return
    }
    try {
      await renameProject(id, trimmed)
    } catch (err) {
      console.error(err)
      alert('重新命名失敗')
    }
  }

  const handleDeleteProject = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (window.confirm('確定要永久刪除此字體專案草稿嗎？此動作無法復原。')) {
      try {
        await deleteProject(id)
      } catch (err) {
        console.error(err)
        alert('刪除失敗')
      }
    }
  }

  return {
    ...githubImport,
    ...localImport,
    projects,
    handleRenameProject,
    handleDeleteProject,
    handleOpenProject,
  }
}
