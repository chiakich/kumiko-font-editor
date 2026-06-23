import { useToast } from '@chakra-ui/react'
import { zipSync } from 'fflate'
import { useMemo, useState } from 'react'
import { exportCanonicalProjectAsBinary } from 'src/lib/fontFormats/canonicalBinaryExport'
import { exportUfoAsZipBlob } from 'src/lib/fontFormats/ufoZipExportClient'
import {
  createCompilerRuntimeStatus,
  deriveOpenTypeExportWarnings,
  hasBlockingExportWarnings,
  hasManagedFeatureEdits,
  mergeFeatureDiagnostics,
  needsOpenTypeFeatureCompilationForBinaryExport,
  validateFeatures,
} from 'src/lib/openTypeFeatures'
import { getProjectArchiveSourceFormat } from 'src/lib/project/projectArchive'
import { getGlyphsExportWarnings } from 'src/lib/fontFormats/glyphsExport'
import {
  createCanonicalGlyphsPackageData,
  serializeCanonicalGlyphsProjectToBlob,
} from 'src/lib/fontFormats/canonicalGlyphsExport'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { markKumikoProjectExportClean } from 'src/lib/project/kumikoProjectPersistence'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { canUseCanonicalUfoZipExport } from 'src/features/common/fontExport/exportDraftPolicy'
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
  warnings?: Array<{ code: string }>
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
  const editLocation = useStore((state) => state.editLocation)
  const overviewSectionId = useStore((state) => state.overviewSectionId)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const overviewGridState = useStore((state) => state.overviewGridState)
  const dirtyGlyphIds = useStore((state) => state.dirtyGlyphIds)
  const deletedGlyphIds = useStore((state) => state.deletedGlyphIds)
  const persistenceQueue = useStore((state) => state.persistenceQueue)
  const persistenceStatus = useStore((state) => state.persistenceStatus)
  const glyphEditTimes = useStore((state) => state.glyphEditTimes)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const compilerRuntimeStatus = useMemo(() => createCompilerRuntimeStatus(), [])
  const openTypeExportWarnings = useMemo(
    () =>
      fontData?.openTypeFeatures
        ? deriveOpenTypeExportWarnings(fontData.openTypeFeatures, {
            compilerRuntimeStatus,
            diagnostics: mergeFeatureDiagnostics(
              fontData.openTypeFeatures.diagnostics,
              validateFeatures(fontData.openTypeFeatures, fontData)
            ),
            hasGeneratedFeatureEdits: hasManagedFeatureEdits(
              fontData.openTypeFeatures
            ),
          })
        : [],
    [compilerRuntimeStatus, fontData]
  )
  const hasBlockingOpenTypeWarnings = hasBlockingExportWarnings(
    openTypeExportWarnings
  )
  const glyphsExportWarnings = useMemo(
    () => (fontData ? getGlyphsExportWarnings(fontData, 3) : []),
    [fontData]
  )

  const canExport = Boolean(
    fontData &&
    projectId &&
    !isExporting &&
    persistenceStatus !== 'error' &&
    !hasBlockingOpenTypeWarnings
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
      persistenceStatus === 'error' ||
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
          editLocation,
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

      const sourceFormat = getProjectArchiveSourceFormat()
      const usesSourceBackedUfoZipExport =
        canUseCanonicalUfoZipExport(sourceFormat)
      const shouldMarkProjectExportClean = selectedFormats.some(
        (format) => format !== 'zip' || !usesSourceBackedUfoZipExport
      )
      const selectedGlyphs3Formats = selectedFormats.filter(
        (format) => format === 'glyphs3' || format === 'glyphspackage'
      )
      const selectedBinaryFormats = selectedFormats.filter(
        (format) =>
          format !== 'zip' &&
          format !== 'glyphs2' &&
          format !== 'glyphs3' &&
          format !== 'glyphspackage'
      )
      if (
        fontData.openTypeFeatures &&
        selectedBinaryFormats.length > 0 &&
        needsOpenTypeFeatureCompilationForBinaryExport(
          fontData.openTypeFeatures,
          {
            hasGeneratedFeatureEdits: hasManagedFeatureEdits(
              fontData.openTypeFeatures
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
        // Glyphs export streams from Kumiko's canonical records.
        if (format === 'glyphs2' || format === 'glyphs3') {
          const result = await serializeCanonicalGlyphsProjectToBlob({
            projectId,
            formatVersion: format === 'glyphs3' ? 3 : 2,
          })
          return {
            blob: result.blob,
            fileName: `${baseFileName}-glyphs${format === 'glyphs3' ? '3' : '2'}.glyphs`,
            label: format === 'glyphs3' ? 'Glyphs 3' : 'Glyphs 2',
            totalGlyphs: result.totalGlyphs,
            warnings: result.warnings,
          }
        }

        if (format === 'glyphspackage') {
          const packageData = await createCanonicalGlyphsPackageData({
            projectId,
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
            totalGlyphs: packageData.totalGlyphs,
            warnings: packageData.warnings,
          }
        }

        if (format !== 'zip') {
          return {
            blob: await exportCanonicalProjectAsBinary({ projectId, format }),
            fileName: `${baseFileName}.${format}`,
            label: format.toUpperCase(),
            totalGlyphs: null,
          }
        }

        if (format === 'zip') {
          const result = await exportUfoAsZipBlob({
            projectId,
            markClean: usesSourceBackedUfoZipExport,
            onProgress: setUfoExportProgress,
          })
          return {
            blob: result.blob,
            fileName:
              sourceFormat === 'designspace'
                ? `${baseFileName}.designspace.zip`
                : `${baseFileName}.ufo.zip`,
            label:
              sourceFormat === 'designspace' ? 'Designspace + UFO' : 'UFO ZIP',
            totalGlyphs: result.totalGlyphs,
          }
        }

        throw new Error(`Unsupported export format: ${format}`)
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

      if (shouldMarkProjectExportClean) {
        await markKumikoProjectExportClean(projectId)
      }

      const glyphs3WarningCount =
        selectedGlyphs3Formats.length > 0
          ? assets.reduce(
              (count, asset) =>
                count +
                (asset.warnings?.filter(
                  (warning) =>
                    warning.code === 'glyphs3-shear-transform-unverified'
                ).length ?? 0),
              0
            )
          : 0
      if (glyphs3WarningCount > 0) {
        toast({
          title: 'Glyphs export warning',
          description: `匯出的 Glyphs 3 資料包含 ${glyphs3WarningCount} 個 sheared component，已用 matrix transform 保留；請在 Glyphs 重新開啟確認。`,
          status: 'warning',
          duration: 5200,
          isClosable: true,
        })
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
    glyphsExportWarnings,
    isExporting,
    loadingText,
    ufoExportProgress,
    sourceFormat: getProjectArchiveSourceFormat(),
  }
}
