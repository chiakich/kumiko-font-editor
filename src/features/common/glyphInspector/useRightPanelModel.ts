import { useToast } from '@chakra-ui/react'
import { saveDraftSnapshot } from 'src/lib/draftSave'
import {
  getArchivedGlyphLayerEntries,
  getProjectArchiveMetadata,
} from 'src/lib/projectArchive'
import {
  getEffectiveNodeType,
  getGlyphLayer,
  isPathEndpointNode,
  useStore,
  type NodeType,
} from 'src/store'
import type { PathBooleanOperation } from 'src/lib/pathBooleanOperations'
import { useGitHubCommitFlow } from 'src/features/common/glyphInspector/useGitHubCommitFlow'
import {
  parseNumberInput,
  parseSelectedNode,
} from 'src/features/common/glyphInspector/utils'

export function useRightPanelModel() {
  const toast = useToast()
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
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
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
      : (glyph?.metrics ?? activeLayer?.metrics)
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
