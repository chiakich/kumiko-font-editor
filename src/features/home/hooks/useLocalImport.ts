import { useEffect, useRef, useState } from 'react'
import {
  importLocalProjectFiles,
  listLocalUfoDesignspaceCandidates,
} from 'src/features/home/utils/projectImport'
import type { LoadedKumikoProject } from 'src/features/home/hooks/useProjectList'
import type { KumikoProjectSummary } from 'src/lib/project/projectTypes'
import type { DesignspaceCandidate } from 'src/lib/fontFormats/adapters/ufo'

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
  const [pendingLocalDesignspaceImport, setPendingLocalDesignspaceImport] =
    useState<{
      files: File[]
      candidates: DesignspaceCandidate[]
    } | null>(null)

  useEffect(() => {
    if (!folderInputRef.current) {
      return
    }
    folderInputRef.current.setAttribute('webkitdirectory', '')
    folderInputRef.current.setAttribute('directory', '')
  }, [])

  const importFiles = async (
    selectedFiles: File[],
    options: { designspacePath?: string | null } = {}
  ) => {
    if (!options.designspacePath) {
      const candidates = await listLocalUfoDesignspaceCandidates(selectedFiles)
      if (candidates.length > 1) {
        setPendingLocalDesignspaceImport({
          files: selectedFiles,
          candidates,
        })
        return
      }
    }

    const importedProject = await importLocalProjectFiles(selectedFiles, {
      designspacePath: options.designspacePath,
    })
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

  const handleCancelLocalDesignspaceImport = () => {
    setPendingLocalDesignspaceImport(null)
  }

  const handleConfirmLocalDesignspaceImport = async (
    designspacePath: string
  ) => {
    const pending = pendingLocalDesignspaceImport
    if (!pending || isLoadingLocal) {
      return
    }

    setPendingLocalDesignspaceImport(null)
    setIsLoadingLocal(true)
    try {
      await importFiles(pending.files, { designspacePath })
    } catch (error: unknown) {
      console.error(error)
      alert(`讀取本地專案失敗: ${getErrorMessage(error)}`)
    } finally {
      setIsLoadingLocal(false)
    }
  }

  const getFilesFromDataTransfer = async (
    dataTransfer: DataTransfer
  ): Promise<File[]> => {
    const files: File[] = []

    const readEntry = async (entry: FileSystemEntry, path = '') => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          ;(entry as FileSystemFileEntry).file(resolve, reject)
        })
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path ? path + file.name : '',
          writable: false,
        })
        files.push(file)
      } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader()
        const entries = await new Promise<FileSystemEntry[]>(
          (resolve, reject) => {
            const readEntries = (accumulated: FileSystemEntry[]) => {
              dirReader.readEntries((newEntries) => {
                if (newEntries.length > 0) {
                  readEntries(accumulated.concat(newEntries))
                } else {
                  resolve(accumulated)
                }
              }, reject)
            }
            readEntries([])
          }
        )

        for (const child of entries) {
          await readEntry(child, path + entry.name + '/')
        }
      }
    }

    if (dataTransfer.items) {
      const promises: Promise<void>[] = []
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i]
        if (item?.kind === 'file') {
          const entry = item.webkitGetAsEntry()
          if (entry) {
            promises.push(readEntry(entry))
          }
        }
      }
      await Promise.all(promises)
    } else {
      files.push(...Array.from(dataTransfer.files ?? []))
    }

    return files
  }

  const handleDropUpload = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    localDragDepthRef.current = 0
    setIsDraggingLocal(false)
    const files = await getFilesFromDataTransfer(event.dataTransfer)
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
    pendingLocalDesignspaceImport,
    handleCancelLocalDesignspaceImport,
    handleConfirmLocalDesignspaceImport,
    handleFolderUpload,
    handleFileUpload,
    handleDropUpload,
    handleLocalDragEnter,
    handleLocalDragLeave,
    handleLocalDragOver,
  }
}
