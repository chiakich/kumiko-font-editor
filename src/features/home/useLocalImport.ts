import { useEffect, useRef, useState } from 'react'
import { importLocalProjectFiles } from 'src/features/home/projectImport'
import type { LoadedKumikoProject } from 'src/features/home/useProjectList'
import type { KumikoProjectSummary } from 'src/lib/projectTypes'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '未知錯誤'

export const useLocalImport = (input: {
  onProjectImported: (project: LoadedKumikoProject) => Promise<void> | void
  onProjectSummarySaved: (summary: KumikoProjectSummary) => void
}) => {
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const localDragDepthRef = useRef(0)
  const [isDraggingLocal, setIsDraggingLocal] = useState(false)
  const [isLoadingLocal, setIsLoadingLocal] = useState(false)

  useEffect(() => {
    if (!folderInputRef.current) {
      return
    }
    folderInputRef.current.setAttribute('webkitdirectory', '')
    folderInputRef.current.setAttribute('directory', '')
  }, [])

  const importFiles = async (selectedFiles: File[]) => {
    const importedProject = await importLocalProjectFiles(selectedFiles)
    if (!importedProject) {
      return
    }

    input.onProjectSummarySaved(importedProject.summary)
    await input.onProjectImported(importedProject)
  }

  const handleFolderUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = event.target.files
      ? Array.from(event.target.files)
      : []
    if (selectedFiles.length === 0) {
      return
    }

    setIsLoadingLocal(true)
    setTimeout(async () => {
      try {
        await importFiles(selectedFiles)
      } catch (error: unknown) {
        console.error(error)
        alert(`讀取本地專案失敗: ${getErrorMessage(error)}`)
      } finally {
        setIsLoadingLocal(false)
        event.target.value = ''
      }
    }, 100)
  }

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    await handleFolderUpload(event)
  }

  const handleDropUpload = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    localDragDepthRef.current = 0
    setIsDraggingLocal(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length === 0) {
      return
    }
    setIsLoadingLocal(true)
    try {
      await importFiles(files)
    } catch (error: unknown) {
      console.error(error)
      alert(`拖曳匯入失敗: ${getErrorMessage(error)}`)
    } finally {
      setIsLoadingLocal(false)
    }
  }

  const handleLocalDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    localDragDepthRef.current += 1
    setIsDraggingLocal(true)
  }

  const handleLocalDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDraggingLocal(true)
  }

  const handleLocalDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    localDragDepthRef.current = Math.max(0, localDragDepthRef.current - 1)
    if (localDragDepthRef.current === 0) {
      setIsDraggingLocal(false)
    }
  }

  return {
    folderInputRef,
    fileInputRef,
    isDraggingLocal,
    isLoadingLocal,
    handleFolderUpload,
    handleFileUpload,
    handleDropUpload,
    handleLocalDragEnter,
    handleLocalDragLeave,
    handleLocalDragOver,
  }
}
