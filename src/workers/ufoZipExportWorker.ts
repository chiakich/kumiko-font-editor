/// <reference lib="webworker" />
import { Zip, ZipDeflate } from 'fflate'
import {
  markKumikoUfoExportClean,
  type KumikoUfoExportStateUpdate,
} from '@/lib/github/sync/kumikoUfoSync'
import {
  materializeUfoTree,
  type MaterializedFile,
} from '@/lib/fontFormats/ufoMaterialize'

interface ZipExportRequest {
  type: 'zip-export'
  payload: {
    projectId: string
    markClean?: boolean
    fixedConcurrency?: number
  }
}

interface ZipExportProgressMessage {
  type: 'zip-progress'
  payload: { completed: number; total: number; phase: 'write' | 'zip' }
}

interface ZipExportSuccessMessage {
  type: 'zip-success'
  payload: { totalGlyphs: number }
}

interface ZipExportErrorMessage {
  type: 'zip-error'
  payload: { message: string }
}

type ZipExportResponse =
  | ZipExportProgressMessage
  | ZipExportSuccessMessage
  | ZipExportErrorMessage

const OPFS_STAGING_DIR = '__kumiko_zip_staging'

const encoder = new TextEncoder()

/** Get or create a directory inside OPFS. */
const ensureOpfsDir = async (
  parent: FileSystemDirectoryHandle,
  ...paths: string[]
) => {
  let handle = parent
  for (const path of paths) {
    const segments = path.split('/').filter(Boolean)
    for (const seg of segments) {
      handle = await handle.getDirectoryHandle(seg, { create: true })
    }
  }
  return handle
}

/** Write text content to a file inside OPFS using sync access handle for speed. */
const writeOpfsFile = async (
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string
) => {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const accessHandle = await fileHandle.createSyncAccessHandle()
  const data = encoder.encode(content)
  accessHandle.truncate(0)
  accessHandle.write(data, { at: 0 })
  accessHandle.flush()
  accessHandle.close()
}

/** Remove an OPFS directory recursively. */
const removeOpfsDir = async (
  parent: FileSystemDirectoryHandle,
  name: string
) => {
  try {
    await parent.removeEntry(name, { recursive: true })
  } catch {
    // ignore if not exists
  }
}

/** Collect all file entries recursively from an OPFS directory.
 *  Returns an array of { relativePath, fileHandle }. */
const collectOpfsFiles = async (
  dir: FileSystemDirectoryHandle,
  prefix = ''
): Promise<
  Array<{ relativePath: string; fileHandle: FileSystemFileHandle }>
> => {
  const results: Array<{
    relativePath: string
    fileHandle: FileSystemFileHandle
  }> = []
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      results.push(...(await collectOpfsFiles(handle, path)))
    } else {
      results.push({ relativePath: path, fileHandle: handle })
    }
  }
  return results
}

self.onmessage = async (event: MessageEvent<ZipExportRequest>) => {
  if (event.data?.type !== 'zip-export') {
    return
  }

  const opfsRoot = await navigator.storage.getDirectory()
  // Always clean up from previous runs first
  await removeOpfsDir(opfsRoot, OPFS_STAGING_DIR)

  try {
    const {
      projectId,
      markClean = true,
      fixedConcurrency = 8,
    } = event.data.payload

    const stagingRoot = await ensureOpfsDir(opfsRoot, OPFS_STAGING_DIR)

    // --- Phase 1: materialize the UFO tree into OPFS staging ---
    let totalGlyphs = 0
    let completedGlyphs = 0
    const concurrency = Math.max(1, fixedConcurrency)
    const exportStateUpdates: KumikoUfoExportStateUpdate[] = []

    const progressWrite = () => {
      const msg: ZipExportResponse = {
        type: 'zip-progress',
        payload: {
          completed: completedGlyphs,
          total: totalGlyphs,
          phase: 'write',
        },
      }
      self.postMessage(msg)
    }

    progressWrite()

    // Resolve each directory once: a batch can span directories, and repeating
    // getDirectoryHandle(create) concurrently for the same path is wasteful.
    const dirHandles = new Map<string, Promise<FileSystemDirectoryHandle>>()
    const dirHandleFor = (dirPath: string) => {
      const cached = dirHandles.get(dirPath)
      if (cached) {
        return cached
      }
      const handle = dirPath
        ? ensureOpfsDir(stagingRoot, dirPath)
        : Promise.resolve(stagingRoot)
      dirHandles.set(dirPath, handle)
      return handle
    }

    const writeMaterializedFile = async (file: MaterializedFile) => {
      const segments = file.path.split('/').filter(Boolean)
      const fileName = segments.pop()
      if (!fileName) {
        return
      }
      const dir = await dirHandleFor(segments.join('/'))
      await writeOpfsFile(dir, fileName, file.text)
    }

    let pending: MaterializedFile[] = []
    const flushPending = async () => {
      if (pending.length === 0) {
        return
      }
      const batch = pending
      pending = []
      await Promise.all(batch.map(writeMaterializedFile))
      const glyphCount = batch.filter((file) => file.countsTowardTotal).length
      if (glyphCount > 0) {
        completedGlyphs += glyphCount
        progressWrite()
      }
    }

    for await (const file of materializeUfoTree({
      projectId,
      onTotal: (total) => {
        totalGlyphs = total
        progressWrite()
      },
      onExportState: (update) => {
        if (markClean) {
          exportStateUpdates.push(update)
        }
      },
    })) {
      pending.push(file)
      if (pending.length >= concurrency) {
        await flushPending()
      }
    }
    await flushPending()

    // --- Phase 2: stream OPFS files into a zip and transfer the blob ---
    const allFiles = await collectOpfsFiles(stagingRoot)
    const totalZipFiles = allFiles.length
    let completedZipFiles = 0

    const zipChunks: Uint8Array[] = []
    let zipResolve: (() => void) | null = null
    let zipReject: ((error: Error) => void) | null = null
    const zipDone = new Promise<void>((resolve, reject) => {
      zipResolve = resolve
      zipReject = reject
    })

    const zip = new Zip((err, chunk, final) => {
      if (err) {
        zipReject?.(err)
        return
      }
      zipChunks.push(chunk)
      if (final) {
        zipResolve?.()
      }
    })

    for (const entry of allFiles) {
      const file = await entry.fileHandle.getFile()
      const data = new Uint8Array(await file.arrayBuffer())

      const deflate = new ZipDeflate(entry.relativePath, { level: 0 })
      zip.add(deflate)
      deflate.push(data, true)

      completedZipFiles += 1
      const msg: ZipExportResponse = {
        type: 'zip-progress',
        payload: {
          completed: completedZipFiles,
          total: totalZipFiles,
          phase: 'zip',
        },
      }
      self.postMessage(msg)
    }

    zip.end()
    await zipDone

    // Combine chunks into a single blob and transfer
    const totalSize = zipChunks.reduce((sum, c) => sum + c.byteLength, 0)
    const combined = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of zipChunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }

    // Mark clean in IndexedDB
    if (markClean && exportStateUpdates.length > 0) {
      await markKumikoUfoExportClean(projectId, exportStateUpdates)
    }

    // Transfer the zip data to the main thread via transferable
    const msg: ZipExportResponse = {
      type: 'zip-success',
      payload: { totalGlyphs },
    }
    self.postMessage(msg)
    // Send the zip binary separately so we can use transferable
    self.postMessage(
      { type: 'zip-blob', payload: { buffer: combined.buffer } },
      [combined.buffer]
    )
  } catch (error) {
    const msg: ZipExportResponse = {
      type: 'zip-error',
      payload: {
        message:
          error instanceof Error
            ? error.message
            : 'UFO zip export worker failed',
      },
    }
    self.postMessage(msg)
  } finally {
    // Clean up staging directory
    await removeOpfsDir(opfsRoot, OPFS_STAGING_DIR).catch(() => {})
  }
}

export {}
