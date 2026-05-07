/// <reference lib="webworker" />
import { Zip, ZipDeflate } from 'fflate'
import { hashString } from 'src/lib/hash'
import {
  serializeGlifRecord,
  serializeXmlPlist,
  pickDefaultLayer,
} from 'src/lib/fontAdapters/ufo'
import {
  listUfoGlyphsInLayer,
  listUfoMetadataForProject,
  loadUfoProject,
  updateUfoGlyphExportState,
} from 'src/lib/ufoPersistence'
import type { UfoGlyphPrimaryKey } from 'src/lib/ufoTypes'

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

    const project = await loadUfoProject(projectId)
    if (!project) {
      throw new Error('找不到 UFO 專案')
    }

    const metadataRecords = await listUfoMetadataForProject(projectId)
    const stagingRoot = await ensureOpfsDir(opfsRoot, OPFS_STAGING_DIR)

    // --- Phase 1: write all UFO files into OPFS staging ---
    let totalGlyphs = 0
    let completedGlyphs = 0
    const concurrency = Math.max(1, fixedConcurrency)

    const exportStateUpdates: Array<{
      key: UfoGlyphPrimaryKey
      dirty: boolean
      sourceHash: string | null
    }> = []

    // First pass: count total glyphs
    for (const metadata of metadataRecords) {
      for (const layer of metadata.layers) {
        const layerGlyphs = await listUfoGlyphsInLayer(
          projectId,
          metadata.ufoId,
          layer.layerId
        )
        totalGlyphs += layerGlyphs.length
      }
    }

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

    for (const metadata of metadataRecords) {
      const ufoDir = await ensureOpfsDir(stagingRoot, metadata.relativePath)
      const defaultLayer = pickDefaultLayer(metadata)

      // Write metadata files
      await writeOpfsFile(
        ufoDir,
        'metainfo.plist',
        serializeXmlPlist({
          creator: metadata.metainfo?.creator ?? 'org.kumiko.fonteditor',
          formatVersion: metadata.metainfo?.formatVersion ?? 3,
          formatVersionMinor: metadata.metainfo?.formatVersionMinor ?? 0,
        })
      )
      await writeOpfsFile(
        ufoDir,
        'fontinfo.plist',
        serializeXmlPlist(metadata.fontinfo ?? {})
      )
      await writeOpfsFile(
        ufoDir,
        'lib.plist',
        serializeXmlPlist(metadata.lib ?? {})
      )
      await writeOpfsFile(
        ufoDir,
        'groups.plist',
        serializeXmlPlist(metadata.groups ?? {})
      )
      await writeOpfsFile(
        ufoDir,
        'kerning.plist',
        serializeXmlPlist(metadata.kerning ?? {})
      )
      await writeOpfsFile(
        ufoDir,
        'layercontents.plist',
        serializeXmlPlist(
          metadata.layers.map((layer) => [layer.layerId, layer.glyphDir])
        )
      )
      if (metadata.featuresText !== null) {
        await writeOpfsFile(ufoDir, 'features.fea', metadata.featuresText)
      }

      // Write glyph layers
      for (const layer of metadata.layers) {
        const layerDir = await ensureOpfsDir(ufoDir, layer.glyphDir)
        const layerGlyphs =
          layer.layerId === defaultLayer.layerId
            ? await listUfoGlyphsInLayer(
                projectId,
                metadata.ufoId,
                defaultLayer.layerId
              )
            : await listUfoGlyphsInLayer(
                projectId,
                metadata.ufoId,
                layer.layerId
              )

        // contents.plist
        const contents = Object.fromEntries(
          layerGlyphs.map((g) => [g.glyphName, g.fileName])
        )
        await writeOpfsFile(
          layerDir,
          'contents.plist',
          serializeXmlPlist(contents)
        )

        // Write glyphs in batches
        let startIndex = 0
        while (startIndex < layerGlyphs.length) {
          const batch = layerGlyphs.slice(startIndex, startIndex + concurrency)
          await Promise.all(
            batch.map(async (glyph) => {
              const glifText = serializeGlifRecord(glyph)
              const nextHash = hashString(glifText)
              await writeOpfsFile(layerDir, glyph.fileName, glifText)

              if (markClean) {
                exportStateUpdates.push({
                  key: [
                    glyph.projectId,
                    glyph.ufoId,
                    glyph.layerId,
                    glyph.glyphName,
                  ],
                  dirty: false,
                  sourceHash: nextHash,
                })
              }
            })
          )
          completedGlyphs += batch.length
          progressWrite()
          startIndex += batch.length
        }
      }
    }

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
      await updateUfoGlyphExportState(exportStateUpdates)
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
