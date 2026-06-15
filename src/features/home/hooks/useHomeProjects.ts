import { useCallback, useMemo } from 'react'
import { UFO_LOCAL_DELETED_GLYPHS_KEY } from 'src/lib/project/draftSave'
import {
  sanitizeGlyphEditTimes,
  UFO_GLYPH_EDIT_TIMES_KEY,
} from 'src/lib/glyph/glyphEditTimes'
import {
  listDirtyUfoGlyphs,
  loadUfoUiValue,
} from 'src/lib/fontFormats/ufoPersistence'
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
        project.projectRoundTripFormat
      )

      if (project.projectRoundTripFormat === 'ufo') {
        await restorePersistedUfoChanges(project.id)
      }
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
    const loadedProject = await openProject(project)
    if (!loadedProject) {
      return
    }

    await loadImportedProject(loadedProject)
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
