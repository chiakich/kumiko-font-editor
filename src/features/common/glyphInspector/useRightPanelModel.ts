import { useToast } from '@chakra-ui/react'
import { useState } from 'react'
import { saveDraftSnapshot } from '../../../lib/draftSave'
import {
  getArchivedGlyphLayerEntries,
  getProjectArchiveMetadata,
  getProjectArchiveSourceFormat,
} from '../../../lib/projectArchive'
import { syncHotFontDataToUfoRecords } from '../../../lib/ufoFormat'
import { exportUfoAsZipDownload } from '../../../lib/ufoZipExportClient'
import { exportFontAsBinary } from '../../../lib/fontBinaryFormat'
import {
  getEffectiveNodeType,
  getGlyphLayer,
  isPathEndpointNode,
  useStore,
  type NodeType,
} from '../../../store'
import { useGitHubCommitFlow } from './useGitHubCommitFlow'
import { parseNumberInput, parseSelectedNode } from './utils'

export function useRightPanelModel() {
  const toast = useToast()
  const [isSavingToLocal, setIsSavingToLocal] = useState(false)
  const [ufoExportProgress, setUfoExportProgress] = useState<{
    completed: number
    total: number
    phase?: 'write' | 'zip'
  } | null>(null)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const workspaceView = useStore((state) => state.workspaceView)
  const selectedNodeIds = useStore((state) => state.selectedNodeIds)
  const selectedSegment = useStore((state) => state.selectedSegment)
  const fontData = useStore((state) => state.fontData)
  const projectId = useStore((state) => state.projectId)
  const projectTitle = useStore((state) => state.projectTitle)
  const isDirty = useStore((state) => state.isDirty)
  const dirtyGlyphIds = useStore((state) => state.dirtyGlyphIds)
  const deletedGlyphIds = useStore((state) => state.deletedGlyphIds)
  const hasLocalChanges = useStore((state) => state.hasLocalChanges)
  const localDirtyGlyphIds = useStore((state) => state.localDirtyGlyphIds)
  const localDeletedGlyphIds = useStore((state) => state.localDeletedGlyphIds)
  const previewGlyphMetrics = useStore((state) => state.previewGlyphMetrics)
  const updateNodePosition = useStore((state) => state.updateNodePosition)
  const updateNodeType = useStore((state) => state.updateNodeType)
  const updateGlyphMetrics = useStore((state) => state.updateGlyphMetrics)
  const convertLineSegmentToCurve = useStore(
    (state) => state.convertLineSegmentToCurve
  )
  const setSelectedLayerId = useStore((state) => state.setSelectedLayerId)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const markLocalSaved = useStore((state) => state.markLocalSaved)
  const deleteGlyph = useStore((state) => state.deleteGlyph)
  const selectedProjectMetadata = getProjectArchiveMetadata() as {
    activeUfoId?: string | null
    githubSource?: {
      owner?: string
      repo?: string
      defaultBranch?: string
    } | null
  } | null
  const hasGitHubSource = Boolean(selectedProjectMetadata?.githubSource)
  const githubRepoFullName =
    selectedProjectMetadata?.githubSource?.owner &&
    selectedProjectMetadata?.githubSource?.repo
      ? `${selectedProjectMetadata.githubSource.owner}/${selectedProjectMetadata.githubSource.repo}`
      : null
  const canCommitToGitHub = Boolean(
    projectId &&
    projectTitle &&
    hasGitHubSource &&
    (localDirtyGlyphIds.length > 0 || localDeletedGlyphIds.length > 0)
  )

  const glyph =
    selectedGlyphId && fontData ? fontData.glyphs[selectedGlyphId] : null
  const activeLayer = getGlyphLayer(glyph ?? undefined, selectedLayerId)
  const displayedMetrics =
    glyph && previewGlyphMetrics?.glyphId === glyph.id
      ? previewGlyphMetrics.metrics
      : (activeLayer?.metrics ?? glyph?.metrics)
  const availableLayers = glyph ? getArchivedGlyphLayerEntries(glyph.id) : []
  const nodeRef = parseSelectedNode(selectedNodeIds[0])
  const selectedPath =
    activeLayer && nodeRef
      ? activeLayer.paths.find((path) => path.id === nodeRef.pathId)
      : null
  const selectedNode =
    selectedPath && nodeRef
      ? selectedPath.nodes.find((node) => node.id === nodeRef.nodeId)
      : null
  const effectiveNodeType =
    selectedPath && selectedNode
      ? getEffectiveNodeType(selectedPath, selectedNode)
      : undefined
  const isOnCurveNode =
    effectiveNodeType === 'corner' || effectiveNodeType === 'smooth'
  const isEndpointNode =
    selectedPath && selectedNode
      ? isPathEndpointNode(selectedPath, selectedNode.id)
      : false

  const gitHubCommitFlow = useGitHubCommitFlow({
    projectId,
    projectTitle,
    fontData,
    selectedLayerId,
    hasGitHubSource,
    githubRepoFullName,
    canCommitToGitHub,
    localDirtyGlyphIds,
    localDeletedGlyphIds,
    markDraftSaved,
  })

  const handleCoordinateChange = (axis: 'x' | 'y', value: string) => {
    if (!glyph || !nodeRef || !selectedNode) {
      return
    }

    updateNodePosition(glyph.id, nodeRef.pathId, nodeRef.nodeId, {
      x: axis === 'x' ? parseNumberInput(value) : selectedNode.x,
      y: axis === 'y' ? parseNumberInput(value) : selectedNode.y,
    })
  }

  const handleNodeTypeChange = (type: NodeType) => {
    if (!glyph || !nodeRef) {
      return
    }

    updateNodeType(glyph.id, nodeRef.pathId, nodeRef.nodeId, type)
  }

  const handleMetricsChange = (
    field: 'lsb' | 'rsb' | 'width',
    value: string
  ) => {
    if (!glyph || value.trim() === '') {
      return
    }

    updateGlyphMetrics(glyph.id, {
      [field]: parseNumberInput(value),
    })
  }

  const handleConvertSelectedSegment = () => {
    if (!glyph || !selectedSegment || selectedSegment.type !== 'line') {
      return
    }

    convertLineSegmentToCurve(
      glyph.id,
      selectedSegment.pathId,
      selectedSegment.startNodeId,
      selectedSegment.endNodeId
    )
  }

  const handleDeleteGlyph = () => {
    if (!glyph) {
      return
    }

    deleteGlyph(glyph.id)
    toast({
      title: '已刪除字符',
      description: `${glyph.id} 已從目前專案移除。`,
      status: 'success',
      duration: 2200,
      isClosable: true,
    })
  }

  const handleSaveUfoToLocal = async (format: 'zip' | 'ttf' | 'otf' | 'woff') => {
    if (!fontData || !projectId || isSavingToLocal) {
      return
    }

    try {
      setIsSavingToLocal(true)

    if (format !== 'zip') {
      const blob = exportFontAsBinary(fontData, format)
      const fileName = `${projectTitle ?? projectId}.${format}`
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(href)
      toast({
        title: `已匯出 ${format.toUpperCase()}`,
        description: `已下載 ${fileName}`,
        status: 'success',
        duration: 2200,
        isClosable: true,
      })
      return
    }

      const projectMetadata = getProjectArchiveMetadata() as {
        activeUfoId?: string | null
      } | null
      const activeUfoId = projectMetadata?.activeUfoId
      const activeLayerId = selectedLayerId ?? 'public.default'
      if (!activeUfoId) {
        throw new Error('找不到目前啟用的 UFO 字重')
      }

      // Sync all dirty glyphs to IndexedDB first
      await syncHotFontDataToUfoRecords({
        projectId,
        activeUfoId,
        activeLayerId,
        fontData,
        dirtyGlyphIds: localDirtyGlyphIds,
        deletedGlyphIds: localDeletedGlyphIds,
      })

      setUfoExportProgress({ completed: 0, total: 0, phase: 'write' })

      const zipFileName = `${projectTitle ?? projectId}.zip`
      const result = await exportUfoAsZipDownload({
        projectId,
        fileName: zipFileName,
        markClean: true,
        fixedConcurrency: 8,
        onProgress: (progress) => setUfoExportProgress(progress),
      })

      markLocalSaved()
      toast({
        title: '已匯出 ZIP',
        description: `已全量匯出 ${result.totalGlyphs} 個 glyph 並下載為 ${zipFileName}。`,
        status: 'success',
        duration: 2400,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: '匯出失敗',
        description:
          error instanceof Error
            ? error.message
            : '目前無法將 UFO 匯出為 ZIP。',
        status: 'error',
        duration: 3200,
        isClosable: true,
      })
      console.warn('UFO zip export failed.', error)
    } finally {
      setIsSavingToLocal(false)
      setUfoExportProgress(null)
    }
  }

  const handleSaveProject = async () => {
    if (!fontData || !projectId || !projectTitle) {
      return
    }

    try {
      await saveDraftSnapshot({
        projectId,
        projectTitle,
        fontData,
        dirtyGlyphIds,
        deletedGlyphIds,
        selectedLayerId,
      })
      markDraftSaved()
      toast({
        title: '已儲存草稿',
        description: '目前變更已寫入本機草稿。',
        status: 'success',
        duration: 2200,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: '儲存失敗',
        description: '無法寫入本機草稿，請稍後再試。',
        status: 'error',
        duration: 3200,
        isClosable: true,
      })
      console.warn('Manual project save failed.', error)
    }
  }

  return {
    activeLayer,
    availableLayers,
    displayedMetrics,
    effectiveNodeType,
    glyph,
    gitHubCommitFlow,
    hasGitHubSource,
    hasLocalChanges,
    isDirty,
    isEndpointNode,
    isOnCurveNode,
    isSavingToLocal,
    nodeRef,
    projectId,
    projectTitle,
    selectedLayerId,
    selectedNode,
    selectedSegment,
    ufoExportProgress,
    workspaceView,
    fontData,
    handleConvertSelectedSegment,
    handleCoordinateChange,
    handleDeleteGlyph,
    handleMetricsChange,
    handleNodeTypeChange,
    handleSaveProject,
    handleSaveUfoToLocal,
    setSelectedLayerId,
    setWorkspaceView,
    hasUfoSource: getProjectArchiveSourceFormat() === 'ufo',
  }
}
