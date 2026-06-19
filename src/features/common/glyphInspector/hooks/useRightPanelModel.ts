import { useToast } from '@chakra-ui/react'
import { useMemo } from 'react'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { getProjectArchiveMetadata } from 'src/lib/project/projectArchive'
import { listGlyphLayers } from 'src/store/glyphLayerOps'
import {
  getEffectiveNodeType,
  getGlyphLayer,
  isPathEndpointNode,
  useStore,
  type NodeType,
} from 'src/store'
import type { PathBooleanOperation } from 'src/lib/pathBooleanOperations'
import { useGitHubCommitFlow } from 'src/features/common/glyphInspector/hooks/useGitHubCommitFlow'
import { useProjectSyncDirtyStatus } from 'src/features/common/glyphInspector/hooks/useProjectSyncDirtyStatus'
import { useFlushCurrentDraft } from 'src/features/common/projectPersistence/useFlushCurrentDraft'
import { buildQualityReport } from 'src/features/common/qualityCheck/utils/qualityLint'
import {
  parseNumberInput,
  parseSelectedNode,
} from 'src/features/common/glyphInspector/utils/utils'

export function useRightPanelModel() {
  const toast = useToast()
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const workspaceView = useStore((state) => state.workspaceView)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const overviewSectionId = useStore((state) => state.overviewSectionId)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const overviewGridState = useStore((state) => state.overviewGridState)
  const selectedNodeIds = useStore((state) => state.selectedNodeIds)
  const selectedSegment = useStore((state) => state.selectedSegment)
  const fontData = useStore((state) => state.fontData)
  const projectId = useStore((state) => state.projectId)
  const projectTitle = useStore((state) => state.projectTitle)
  const isDirty = useStore((state) => state.isDirty)
  const dirtyGlyphIds = useStore((state) => state.dirtyGlyphIds)
  const deletedGlyphIds = useStore((state) => state.deletedGlyphIds)
  const persistenceQueue = useStore((state) => state.persistenceQueue)
  const glyphEditTimes = useStore((state) => state.glyphEditTimes)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const hasLocalChanges = useStore((state) => state.hasLocalChanges)
  const localDirtyGlyphIds = useStore((state) => state.localDirtyGlyphIds)
  const localDeletedGlyphIds = useStore((state) => state.localDeletedGlyphIds)
  const previewGlyphMetrics = useStore((state) => state.previewGlyphMetrics)
  const updateNodePosition = useStore((state) => state.updateNodePosition)
  const updateNodePositions = useStore((state) => state.updateNodePositions)
  const updateNodeType = useStore((state) => state.updateNodeType)
  const updateGlyphMetrics = useStore((state) => state.updateGlyphMetrics)
  const applyPathBooleanOperation = useStore(
    (state) => state.applyPathBooleanOperation
  )
  const convertLineSegmentToCurve = useStore(
    (state) => state.convertLineSegmentToCurve
  )
  const setSelectedLayerId = useStore((state) => state.setSelectedLayerId)
  const setActiveMasterId = useStore((state) => state.setActiveMasterId)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const deleteGlyph = useStore((state) => state.deleteGlyph)
  const flushCurrentDraft = useFlushCurrentDraft()
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
  const persistedSyncDirtyQuery = useProjectSyncDirtyStatus({
    projectId,
    enabled: hasGitHubSource,
  })
  const hasRuntimeGitHubChanges =
    localDirtyGlyphIds.length > 0 || localDeletedGlyphIds.length > 0
  const hasPersistedGitHubChanges = persistedSyncDirtyQuery.data ?? false
  const canCommitToGitHub = Boolean(
    projectId &&
    projectTitle &&
    hasGitHubSource &&
    (hasRuntimeGitHubChanges || hasPersistedGitHubChanges)
  )
  const commitQualityReport = useMemo(
    () =>
      buildQualityReport({
        fontData,
        scope: 'changed',
        selectedGlyphId,
        dirtyGlyphIds: localDirtyGlyphIds,
        deletedGlyphIds: localDeletedGlyphIds,
      }),
    [fontData, localDeletedGlyphIds, localDirtyGlyphIds, selectedGlyphId]
  )

  const glyph =
    selectedGlyphId && fontData ? fontData.glyphs[selectedGlyphId] : null
  const activeLayer = getGlyphLayer(glyph ?? undefined, selectedLayerId)
  const displayedMetrics =
    glyph && previewGlyphMetrics?.glyphId === glyph.id
      ? previewGlyphMetrics.metrics
      : activeLayer?.metrics
  const availableLayers = glyph ? listGlyphLayers(glyph) : []
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
    hasBlockingQualityIssues: commitQualityReport.summary.hasBlockingIssues,
    localDirtyGlyphIds,
    localDeletedGlyphIds,
    glyphEditTimes,
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

  const handleMoveSelection = (
    updates: Array<{
      pathId: string
      nodeId: string
      newPos: { x: number; y: number }
    }>
  ) => {
    if (!glyph || updates.length === 0) {
      return
    }

    updateNodePositions(glyph.id, updates)
  }

  const handlePathOperation = (
    operation: PathBooleanOperation,
    pathIds: string[]
  ) => {
    if (!glyph || pathIds.length < 2) {
      return
    }

    applyPathBooleanOperation(glyph.id, pathIds, operation)
  }

  const handleDeleteGlyph = async () => {
    if (!glyph) {
      return
    }

    const glyphId = glyph.id
    try {
      deleteGlyph(glyphId)
      await flushCurrentDraft()
      toast({
        title: '已刪除字符',
        description: `${glyphId} 已從目前專案移除。`,
        status: 'success',
        duration: 2200,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: '刪除後儲存失敗',
        description: '字符已從目前工作階段移除，但尚未寫入本機專案。',
        status: 'error',
        duration: 3600,
        isClosable: true,
      })
      console.warn('Flush after glyph deletion failed.', error)
    }
  }

  const handleSaveProject = async () => {
    if (!fontData || !projectId || !projectTitle) {
      return
    }

    try {
      await flushPendingDraft({
        projectId,
        projectTitle,
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
      toast({
        title: '已儲存',
        description: '目前變更已寫入本機專案。',
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

  // Layer panel rows: a font source switches the active master (font-wide),
  // anything else (backups) is a per-glyph layer selection.
  const selectLayer = (layerId: string) => {
    if (fontData?.sources?.[layerId]) {
      setActiveMasterId(layerId)
    } else {
      setSelectedLayerId(layerId)
    }
  }

  return {
    activeLayer,
    availableLayers,
    selectLayer,
    displayedMetrics,
    effectiveNodeType,
    glyph,
    gitHubCommitFlow,
    commitQualityReport,
    hasGitHubSource,
    hasLocalChanges,
    isDirty,
    isEndpointNode,
    isOnCurveNode,
    nodeRef,
    projectId,
    projectTitle,
    selectedLayerId,
    selectedNodeIds,
    selectedNode,
    selectedSegment,
    workspaceView,
    fontData,
    handleConvertSelectedSegment,
    handleCoordinateChange,
    handleDeleteGlyph,
    handleMetricsChange,
    handleMoveSelection,
    handleNodeTypeChange,
    handlePathOperation,
    handleSaveProject,
    setSelectedLayerId,
    setWorkspaceView,
  }
}
