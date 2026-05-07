import type { UfoLocalSaveManifest } from 'src/lib/ufoTypes'

interface UfoExportProgressMessage {
  type: 'export-progress'
  payload: {
    completed: number
    total: number
  }
}

interface UfoExportSuccessMessage {
  type: 'export-success'
  payload: {
    writtenGlyphs: number
    skippedGlyphs: number
    totalGlyphs: number
    didFullRebuild: boolean
    manifest: UfoLocalSaveManifest
  }
}

interface UfoExportErrorMessage {
  type: 'export-error'
  payload: {
    message: string
  }
}

type UfoExportResponseMessage =
  | UfoExportProgressMessage
  | UfoExportSuccessMessage
  | UfoExportErrorMessage

const pickExportDirectory = async () => {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker

  if (!picker) {
    throw new Error('目前瀏覽器不支援資料夾輸出，請使用 Chrome 或 Edge')
  }

  return picker({ mode: 'readwrite' })
}

export const exportUfoWithWorker = async (input: {
  projectId: string
  exportAll?: boolean
  markClean?: boolean
  fixedConcurrency?: number
  directoryMode?: 'direct' | 'save-as'
  saveAsName?: string
  rootHandle?: FileSystemDirectoryHandle
  localManifest?: UfoLocalSaveManifest | null
  deletedFilePaths?: string[]
  onProgress?: (progress: { completed: number; total: number }) => void
}) => {
  const baseHandle = input.rootHandle ?? (await pickExportDirectory())
  const rootHandle =
    input.directoryMode === 'save-as'
      ? await baseHandle.getDirectoryHandle(
          input.saveAsName ?? 'Untitled Export',
          { create: true }
        )
      : baseHandle

  return new Promise<{
    writtenGlyphs: number
    skippedGlyphs: number
    totalGlyphs: number
    didFullRebuild: boolean
    manifest: UfoLocalSaveManifest
  }>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/ufoExportWorker.ts', import.meta.url),
      {
        type: 'module',
      }
    )

    worker.onmessage = (event: MessageEvent<UfoExportResponseMessage>) => {
      if (event.data.type === 'export-progress') {
        input.onProgress?.(event.data.payload)
        return
      }

      worker.terminate()
      if (event.data.type === 'export-success') {
        resolve(event.data.payload)
        return
      }

      reject(new Error(event.data.payload.message))
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'UFO export worker failed'))
    }

    worker.postMessage({
      type: 'export-ufo',
      payload: {
        projectId: input.projectId,
        rootHandle,
        exportAll: input.exportAll,
        markClean: input.markClean,
        fixedConcurrency: input.fixedConcurrency,
        localManifest: input.localManifest,
        deletedFilePaths: input.deletedFilePaths,
      },
    })
  })
}
