import { useToast } from '@chakra-ui/react'
import { zipSync } from 'fflate'
import { useState } from 'react'
import { exportFontAsBinary } from 'src/lib/fontAdapters/binary'
import { exportFontDataAsUfoZip } from 'src/lib/fontUfoZipExport'
import {
  deriveOpenTypeExportWarnings,
  hasBlockingExportWarnings,
  hasManagedFeatureEdits,
  validateFeatures,
} from 'src/lib/openTypeFeatures'
import { getProjectArchiveMetadata } from 'src/lib/projectArchive'
import { syncHotFontDataToUfoRecords } from 'src/lib/fontAdapters/ufo'
import { exportUfoAsZipBlob } from 'src/lib/ufoZipExportClient'
import { useStore } from 'src/store'
import type { FontExportFormat } from 'src/features/common/fontExport/ExportFontModal'

const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(href)
}

const blobToUint8Array = async (blob: Blob) =>
  new Uint8Array(await blob.arrayBuffer())

const makeZipBlob = (files: Record<string, Uint8Array>) => {
  const zipBytes = zipSync(files)
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBuffer).set(zipBytes)
  return new Blob([zipBuffer], { type: 'application/zip' })
}

interface ExportAsset {
  blob: Blob
  fileName: string
  label: string
  totalGlyphs: number | null
}

export function useFontExport() {
  const toast = useToast()
  const [isExporting, setIsExporting] = useState(false)
  const [ufoExportProgress, setUfoExportProgress] = useState<{
    completed: number
    total: number
    phase?: 'write' | 'zip'
  } | null>(null)
  const fontData = useStore((state) => state.fontData)
  const projectId = useStore((state) => state.projectId)
  const projectTitle = useStore((state) => state.projectTitle)
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const localDirtyGlyphIds = useStore((state) => state.localDirtyGlyphIds)
  const localDeletedGlyphIds = useStore((state) => state.localDeletedGlyphIds)
  const markLocalSaved = useStore((state) => state.markLocalSaved)
  const openTypeExportWarnings = fontData?.openTypeFeatures
    ? deriveOpenTypeExportWarnings(fontData.openTypeFeatures, {
        diagnostics: validateFeatures(fontData.openTypeFeatures, fontData),
        hasGeneratedFeatureEdits: hasManagedFeatureEdits(
          fontData.openTypeFeatures
        ),
      })
    : []
  const hasBlockingOpenTypeWarnings = hasBlockingExportWarnings(
    openTypeExportWarnings
  )

  const canExport = Boolean(
    fontData && projectId && !isExporting && !hasBlockingOpenTypeWarnings
  )
  const loadingText = ufoExportProgress
    ? ufoExportProgress.phase === 'zip'
      ? `壓縮中 ${ufoExportProgress.completed}/${ufoExportProgress.total}`
      : `匯出中 ${ufoExportProgress.completed}/${ufoExportProgress.total}`
    : '匯出中...'

  const exportFont = async (formats: FontExportFormat[]) => {
    const selectedFormats = Array.from(new Set(formats))
    if (
      !fontData ||
      !projectId ||
      isExporting ||
      hasBlockingOpenTypeWarnings ||
      selectedFormats.length === 0
    ) {
      return
    }

    try {
      setIsExporting(true)
      const baseFileName = projectTitle || projectId
      const projectMetadata = getProjectArchiveMetadata() as {
        activeUfoId?: string | null
      } | null
      const activeUfoId = projectMetadata?.activeUfoId
      const activeLayerId = selectedLayerId ?? 'public.default'

      const buildExportAsset = async (
        format: FontExportFormat
      ): Promise<ExportAsset> => {
        if (format !== 'zip') {
          return {
            blob: await exportFontAsBinary(fontData, format),
            fileName: `${baseFileName}.${format}`,
            label: format.toUpperCase(),
            totalGlyphs: null,
          }
        }

        if (!activeUfoId) {
          return {
            blob: exportFontDataAsUfoZip({
              fontData,
              projectId,
              projectTitle: baseFileName,
              selectedLayerId,
            }),
            fileName: `${baseFileName}.ufo.zip`,
            label: 'UFO ZIP',
            totalGlyphs: null,
          }
        }

        await syncHotFontDataToUfoRecords({
          projectId,
          activeUfoId,
          activeLayerId,
          fontData,
          dirtyGlyphIds: localDirtyGlyphIds,
          deletedGlyphIds: localDeletedGlyphIds,
        })

        setUfoExportProgress({ completed: 0, total: 0, phase: 'write' })

        const result = await exportUfoAsZipBlob({
          projectId,
          markClean: true,
          fixedConcurrency: 8,
          onProgress: (progress) => setUfoExportProgress(progress),
        })

        markLocalSaved()
        return {
          blob: result.blob,
          fileName: `${baseFileName}.ufo.zip`,
          label: 'UFO ZIP',
          totalGlyphs: result.totalGlyphs,
        }
      }

      const assets: ExportAsset[] = []
      for (const format of selectedFormats) {
        assets.push(await buildExportAsset(format))
      }

      if (assets.length === 1) {
        triggerBlobDownload(assets[0].blob, assets[0].fileName)
      } else {
        const files: Record<string, Uint8Array> = {}
        for (const asset of assets) {
          files[asset.fileName] = await blobToUint8Array(asset.blob)
        }
        triggerBlobDownload(makeZipBlob(files), `${baseFileName}-exports.zip`)
      }

      const totalUfoGlyphs = assets.find(
        (asset) => asset.totalGlyphs !== null
      )?.totalGlyphs
      toast({
        title:
          selectedFormats.length > 1
            ? '已匯出 ZIP'
            : `已匯出 ${assets[0].label}`,
        description:
          totalUfoGlyphs != null
            ? `已匯出 ${selectedFormats.length} 種格式，包含 ${totalUfoGlyphs} 個 glyph。`
            : `已匯出 ${selectedFormats.length} 種格式。`,
        status: 'success',
        duration: 2400,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: '匯出失敗',
        description:
          error instanceof Error ? error.message : '目前無法匯出字型。',
        status: 'error',
        duration: 3200,
        isClosable: true,
      })
      console.warn('Font export failed.', error)
    } finally {
      setIsExporting(false)
      setUfoExportProgress(null)
    }
  }

  return {
    canExport,
    exportFont,
    openTypeExportWarnings,
    isExporting,
    loadingText,
    ufoExportProgress,
  }
}
