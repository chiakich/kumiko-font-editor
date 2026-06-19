import { useToast } from '@chakra-ui/react'
import { zipSync } from 'fflate'
import { useState } from 'react'
import { exportFontAsBinary } from 'src/lib/fontFormats/adapters/binary'
import {
  exportFontDataAsUfoZip,
  exportMultiMasterUfoZip,
} from 'src/lib/fontFormats/fontUfoZipExport'
import {
  createCompilerRuntimeStatus,
  deriveOpenTypeExportWarnings,
  hasBlockingExportWarnings,
  hasManagedFeatureEdits,
  needsOpenTypeFeatureCompilationForBinaryExport,
  validateFeatures,
} from 'src/lib/openTypeFeatures'
import {
  getProjectArchiveMetadata,
  getProjectArchiveSourceFormat,
} from 'src/lib/project/projectArchive'
import { serializeGlyphsFileToBlob } from 'src/lib/fontFormats/glyphsExport'
import { createGlyphsPackageDataFromFontData } from 'src/lib/fontFormats/glyphsPackage'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { loadProjectDraft } from 'src/lib/project/projectRepository'
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
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const overviewSectionId = useStore((state) => state.overviewSectionId)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const overviewGridState = useStore((state) => state.overviewGridState)
  const dirtyGlyphIds = useStore((state) => state.dirtyGlyphIds)
  const deletedGlyphIds = useStore((state) => state.deletedGlyphIds)
  const persistenceQueue = useStore((state) => state.persistenceQueue)
  const glyphEditTimes = useStore((state) => state.glyphEditTimes)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const markLocalSaved = useStore((state) => state.markLocalSaved)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const compilerRuntimeStatus = createCompilerRuntimeStatus()
  const openTypeExportWarnings = fontData?.openTypeFeatures
    ? deriveOpenTypeExportWarnings(fontData.openTypeFeatures, {
        compilerRuntimeStatus,
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
      await flushPendingDraft({
        projectId,
        projectTitle: projectTitle || projectId,
        fontData,
        projectQueued: persistenceQueue.projectQueued,
        uiStateQueued: persistenceQueue.uiStateQueued,
        projectUiState: createProjectUiStateSnapshot({
          selectedGlyphId,
          selectedLayerId,
          activeMasterId,
          overviewSectionId,
          overviewTopGlyphId,
          overviewGridState,
        }),
        dirtyGlyphIds,
        deletedGlyphIds,
        persistenceRevision: persistenceQueue.revision,
        glyphEditTimes,
        selectedLayerId,
        setPersistenceStatus,
        markDraftSaved,
      })

      const fullDraft = await loadProjectDraft(projectId)
      const exportFontData = fullDraft?.fontData ?? fontData
      const exportProjectMetadata =
        fullDraft?.projectMetadata ?? getProjectArchiveMetadata()
      const selectedBinaryFormats = selectedFormats.filter(
        (format) =>
          format !== 'zip' &&
          format !== 'glyphs2' &&
          format !== 'glyphs3' &&
          format !== 'glyphspackage'
      )
      if (
        exportFontData.openTypeFeatures &&
        selectedBinaryFormats.length > 0 &&
        needsOpenTypeFeatureCompilationForBinaryExport(
          exportFontData.openTypeFeatures,
          {
            hasGeneratedFeatureEdits: hasManagedFeatureEdits(
              exportFontData.openTypeFeatures
            ),
          }
        ) &&
        !compilerRuntimeStatus.canCompile
      ) {
        throw new Error(compilerRuntimeStatus.message)
      }

      const baseFileName = projectTitle || projectId
      const buildExportAsset = async (
        format: FontExportFormat
      ): Promise<ExportAsset> => {
        // Glyphs export always emits from Kumiko's canonical in-memory model.
        if (format === 'glyphs2' || format === 'glyphs3') {
          const blob = serializeGlyphsFileToBlob(
            exportFontData,
            exportProjectMetadata,
            null,
            format === 'glyphs3' ? 3 : 2
          )
          return {
            blob,
            fileName: `${baseFileName}-glyphs${format === 'glyphs3' ? '3' : '2'}.glyphs`,
            label: format === 'glyphs3' ? 'Glyphs 3' : 'Glyphs 2',
            totalGlyphs: Object.keys(exportFontData.glyphs).length,
          }
        }

        if (format === 'glyphspackage') {
          const packageData = createGlyphsPackageDataFromFontData({
            fontData: exportFontData,
            projectMetadata: exportProjectMetadata,
            packageName:
              fullDraft?.projectGlyphsPackage?.packageName ??
              `${baseFileName}.glyphspackage`,
          })
          const files: Record<string, Uint8Array> = {}
          const encoder = new TextEncoder()
          for (const [innerPath, text] of Object.entries(packageData.files)) {
            files[`${packageData.packageName}/${innerPath}`] =
              encoder.encode(text)
          }
          return {
            blob: makeZipBlob(files),
            fileName: `${baseFileName}.glyphspackage.zip`,
            label: 'Glyphs Package',
            totalGlyphs: Object.keys(exportFontData.glyphs).length,
          }
        }

        if (format !== 'zip') {
          return {
            blob: await exportFontAsBinary(exportFontData, format),
            fileName: `${baseFileName}.${format}`,
            label: format.toUpperCase(),
            totalGlyphs: null,
          }
        }

        // Multi-master: export a .designspace + one .ufo per source, straight
        // from fontData (which holds every master layer).
        if (Object.keys(exportFontData.sources ?? {}).length > 1) {
          return {
            blob: exportMultiMasterUfoZip({
              fontData: exportFontData,
              projectId,
              projectTitle: baseFileName,
            }),
            fileName: `${baseFileName}.designspace.zip`,
            label: 'Designspace + UFO',
            totalGlyphs: Object.keys(exportFontData.glyphs).length,
          }
        }

        const blob = exportFontDataAsUfoZip({
          fontData: exportFontData,
          projectId,
          projectTitle: baseFileName,
          selectedLayerId,
        })
        markLocalSaved()
        return {
          blob,
          fileName: `${baseFileName}.ufo.zip`,
          label: 'UFO ZIP',
          totalGlyphs: Object.keys(exportFontData.glyphs).length,
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
    sourceFormat: getProjectArchiveSourceFormat(),
  }
}
