import { useCallback, useEffect, useRef, useState } from 'react'
import { UFO_LOCAL_DELETED_GLYPHS_KEY } from '../../lib/draftSave'
import { importGitHubRepo } from '../../lib/githubImport'
import {
  importUfoWorkspace,
  loadUfoProjectIntoFontData,
} from '../../lib/ufoFormat'
import { importBinaryFontFile } from '../../lib/fontBinaryFormat'
import {
  deleteUfoProjectData,
  listDirtyUfoGlyphs,
  listUfoProjects,
  loadUfoUiValue,
} from '../../lib/ufoPersistence'
import type { UfoProjectRecord } from '../../lib/ufoTypes'
import { useStore } from '../../store'
import { clearGitHubUrlParams, getGitHubRepoUrl } from './githubRepoUrl'
import type { PendingGitHubImport } from './types'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '未知錯誤'

export function useHomeProjects() {
  const loadProjectState = useStore((state) => state.loadProjectState)
  const hydratePersistedLocalChanges = useStore(
    (state) => state.hydratePersistedLocalChanges
  )
  const [projects, setProjects] = useState<UfoProjectRecord[]>([])
  const [isLoadingLocal, setIsLoadingLocal] = useState(false)
  const [isLoadingGitHub, setIsLoadingGitHub] = useState(false)
  const [githubRepoInput, setGitHubRepoInput] = useState('')
  const [githubRefInput, setGitHubRefInput] = useState('')
  const [showGitHubRefInput, setShowGitHubRefInput] = useState(false)
  const [pendingGitHubImport, setPendingGitHubImport] =
    useState<PendingGitHubImport | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const hasAutoImportedFromUrlRef = useRef(false)

  useEffect(() => {
    listUfoProjects().then(setProjects).catch(console.error)
  }, [])

  useEffect(() => {
    if (!folderInputRef.current) {
      return
    }
    folderInputRef.current.setAttribute('webkitdirectory', '')
    folderInputRef.current.setAttribute('directory', '')
  }, [])

  const importFromFiles = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) {
      return
    }

    const hasFolderEntries = selectedFiles.some((file) =>
      file.webkitRelativePath.includes('/')
    )
    if (!hasFolderEntries && selectedFiles.length === 1) {
      const extension = selectedFiles[0].name.split('.').pop()?.toLowerCase()
      if (extension && ['ttf', 'otf', 'woff', 'woff2', 'oft'].includes(extension)) {
        const importedBinary = await importBinaryFontFile(selectedFiles[0])
        if (!importedBinary) {
          throw new Error('字型檔解析失敗')
        }
        loadProjectState(
          importedBinary.projectId,
          importedBinary.projectTitle,
          importedBinary.fontData,
          { importedFrom: extension },
          importedBinary.sourceFormat
        )
        return
      }
    }

    const importedProject = await importUfoWorkspace(selectedFiles)
    setProjects((current) => [
      importedProject.project,
      ...current.filter(
        (project) => project.projectId !== importedProject.project.projectId
      ),
    ])
    loadProjectState(
      importedProject.project.projectId,
      importedProject.project.title,
      importedProject.fontData,
      importedProject.projectMetadata,
      importedProject.projectSourceFormat
    )
  }

  const restorePersistedUfoChanges = useCallback(
    async (projectId: string) => {
      const dirtyGlyphs = await listDirtyUfoGlyphs(projectId)
      const deletedGlyphIds =
        (await loadUfoUiValue<string[]>(
          projectId,
          UFO_LOCAL_DELETED_GLYPHS_KEY
        )) ?? []
      hydratePersistedLocalChanges(
        dirtyGlyphs.map((glyph) => glyph.glyphName),
        deletedGlyphIds
      )
    },
    [hydratePersistedLocalChanges]
  )

  const handleFolderUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : []
    if (selectedFiles.length === 0) {
      return
    }

    setIsLoadingLocal(true)

    setTimeout(async () => {
      try {
        await importFromFiles(selectedFiles)
      } catch (error: unknown) {
        console.error(error)
        alert(`讀取 UFO 資料夾失敗: ${getErrorMessage(error)}`)
      } finally {
        setIsLoadingLocal(false)
        event.target.value = ''
      }
    }, 100)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await handleFolderUpload(event)
  }

  const handleDropUpload = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length === 0) {
      return
    }
    setIsLoadingLocal(true)
    try {
      await importFromFiles(files)
    } catch (error: unknown) {
      console.error(error)
      alert(`拖曳匯入失敗: ${getErrorMessage(error)}`)
    } finally {
      setIsLoadingLocal(false)
    }
  }

  const importGitHubProject = useCallback(
    async (input: { repo: string; ref: string; errorLabel: string }) => {
      if (!input.repo.trim() || isLoadingGitHub) {
        return
      }

      setIsLoadingGitHub(true)
      try {
        const importedProject = await importGitHubRepo({
          repo: input.repo,
          ref: input.ref,
        })
        setProjects((current) => [
          importedProject.project,
          ...current.filter(
            (project) => project.projectId !== importedProject.project.projectId
          ),
        ])
        loadProjectState(
          importedProject.project.projectId,
          importedProject.project.title,
          importedProject.fontData,
          importedProject.projectMetadata,
          importedProject.projectSourceFormat
        )
        await restorePersistedUfoChanges(importedProject.project.projectId)
        clearGitHubUrlParams()
      } catch (error: unknown) {
        console.error(error)
        alert(`${input.errorLabel}: ${getErrorMessage(error)}`)
      } finally {
        setIsLoadingGitHub(false)
      }
    },
    [isLoadingGitHub, loadProjectState, restorePersistedUfoChanges]
  )

  const handleGitHubImport = async () => {
    if (!githubRepoInput.trim()) {
      return
    }

    await importGitHubProject({
      repo: githubRepoInput,
      ref: githubRefInput,
      errorLabel: '讀取 GitHub 專案失敗',
    })
  }

  const handleCancelPendingGitHubImport = () => {
    setPendingGitHubImport(null)
    clearGitHubUrlParams()
  }

  const handleConfirmPendingGitHubImport = async () => {
    if (!pendingGitHubImport) {
      return
    }

    const { repo, ref } = pendingGitHubImport
    setPendingGitHubImport(null)
    await importGitHubProject({
      repo,
      ref,
      errorLabel: '載入 GitHub 專案失敗',
    })
  }

  useEffect(() => {
    if (hasAutoImportedFromUrlRef.current) {
      return
    }

    const url = new URL(window.location.href)
    const repo = url.searchParams.get('repo')?.trim()
    const ref = url.searchParams.get('ref')?.trim() ?? ''

    if (!repo) {
      return
    }

    hasAutoImportedFromUrlRef.current = true
    setGitHubRepoInput(repo)
    setGitHubRefInput(ref)
    setShowGitHubRefInput(Boolean(ref))
    setPendingGitHubImport({
      repo,
      ref,
      repoUrl: getGitHubRepoUrl(repo),
    })
  }, [])

  const handleOpenProject = async (project: UfoProjectRecord) => {
    const loadedProject = await loadUfoProjectIntoFontData(project.projectId)
    if (!loadedProject) {
      return
    }
    loadProjectState(
      loadedProject.project.projectId,
      loadedProject.project.title,
      loadedProject.fontData,
      loadedProject.projectMetadata,
      'ufo'
    )
    await restorePersistedUfoChanges(loadedProject.project.projectId)
  }

  const handleDeleteProject = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (window.confirm('確定要永久刪除此字體專案草稿嗎？此動作無法復原。')) {
      try {
        await deleteUfoProjectData(id)
        setProjects((prev) => prev.filter((p) => p.projectId !== id))
      } catch (err) {
        console.error(err)
        alert('刪除失敗')
      }
    }
  }

  return {
    githubRefInput,
    githubRepoInput,
    isLoadingGitHub,
    isLoadingLocal,
    folderInputRef,
    fileInputRef,
    pendingGitHubImport,
    projects,
    setGithubRefInput: setGitHubRefInput,
    setGithubRepoInput: setGitHubRepoInput,
    setShowGitHubRefInput,
    showGitHubRefInput,
    handleCancelPendingGitHubImport,
    handleConfirmPendingGitHubImport,
    handleDeleteProject,
    handleGitHubImport,
    handleOpenProject,
    handleFolderUpload,
    handleFileUpload,
    handleDropUpload,
  }
}
