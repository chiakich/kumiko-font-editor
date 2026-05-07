import type {
  ProjectRoundTripFormat,
  ProjectSourceFormat,
} from 'src/lib/projectFormats'
import type { PathBooleanOperation } from 'src/lib/pathBooleanOperations'

export type NodeType = 'corner' | 'smooth' | 'offcurve' | 'qcurve'

export interface PathNode {
  id: string
  x: number
  y: number
  type: NodeType
}

export interface PathData {
  id: string
  nodes: PathNode[]
  closed: boolean
}

export interface GlyphComponentRef {
  id: string
  glyphId: string
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

export interface GlyphAnchor {
  id: string
  name: string
  x: number
  y: number
}

export interface GlyphGuideline {
  id: string
  x: number
  y: number
  angle: number
  locked?: boolean
  name?: string
}

export interface GlyphMetrics {
  lsb: number
  rsb: number
  width: number
}

export interface GlyphLayerData {
  id: string
  name: string
  associatedMasterId?: string | null
  paths: PathData[]
  components: string[]
  componentRefs: GlyphComponentRef[]
  anchors: GlyphAnchor[]
  guidelines: GlyphGuideline[]
  metrics: GlyphMetrics
}

export interface GlyphData {
  id: string
  name: string
  activeLayerId?: string | null
  paths: PathData[]
  components: string[]
  componentRefs: GlyphComponentRef[]
  anchors?: GlyphAnchor[]
  guidelines?: GlyphGuideline[]
  metrics: GlyphMetrics
  layers?: Record<string, GlyphLayerData>
  layerOrder?: string[]
  unicode?: string | null
  export?: boolean
  category?: string | null
  subCategory?: string | null
  production?: string | null
}

export interface FontData {
  glyphs: Record<string, GlyphData>
  unitsPerEm?: number
  lineMetricsHorizontalLayout?: Record<
    string,
    {
      value: number
      zone?: number
    }
  >
}

export interface SelectedNodeRef {
  pathId: string
  nodeId: string
}

export interface SelectedSegmentState {
  pathId: string
  startNodeId: string
  endNodeId: string
  type: 'line' | 'quad' | 'cubic' | 'quadBlob'
}

export interface ViewportState {
  zoom: number
  pan: { x: number; y: number }
}

export type WorkspaceView = 'overview' | 'editor'
export type OverviewGroupByState = 'none' | 'script' | 'block'

export interface GlobalState {
  fontData: FontData | null
  projectId: string | null
  projectTitle: string
  isDirty: boolean
  dirtyGlyphIds: string[]
  deletedGlyphIds: string[]
  hasLocalChanges: boolean
  localDirtyGlyphIds: string[]
  localDeletedGlyphIds: string[]
  editorGlyphIds: string[]
  editorText: string
  editorTextCursorIndex: number
  editorActiveGlyphIndex: number
  previewGlyphMetrics: { glyphId: string; metrics: GlyphMetrics } | null
  idsDictionary: Record<string, string[]>
  currentSearchQuery: string
  filteredGlyphList: GlyphData[]
  selectedGlyphId: string | null
  selectedLayerId: string | null
  selectedNodeIds: string[]
  selectedSegment: SelectedSegmentState | null
  workspaceView: WorkspaceView
  overviewGroupBy: OverviewGroupByState
  overviewSectionId: string
  overviewGridState: unknown | null
  overviewTopGlyphId: string | null
  viewport: ViewportState

  setSearchQuery: (query: string) => void
  setSelectedGlyphId: (id: string | null) => void
  addGlyphToEditor: (id: string) => void
  insertGlyphIntoEditor: (id: string, afterGlyphId?: string | null) => void
  removeGlyphFromEditor: (id: string) => void
  setEditorTextCursorIndex: (index: number) => void
  setEditorActiveGlyphIndex: (index: number) => void
  setEditorTextState: (
    text: string,
    glyphIds: string[],
    cursorIndex: number,
    activeGlyphIndex?: number
  ) => void
  setWorkspaceView: (view: WorkspaceView) => void
  setOverviewGrouping: (groupBy: OverviewGroupByState) => void
  setOverviewSectionId: (sectionId: string) => void
  setOverviewGridState: (state: unknown | null) => void
  setOverviewTopGlyphId: (glyphId: string | null) => void
  deleteGlyph: (glyphId: string) => void
  addGlyphs: (
    glyphs: Array<{
      id: string
      name: string
      unicode: string | null
      width?: number
    }>
  ) => string[]
  setSelectedNodeIds: (ids: string[]) => void
  setSelectedSegment: (segment: SelectedSegmentState | null) => void
  setSelectedLayerId: (id: string | null) => void
  updateViewport: (zoom: number, panX: number, panY: number) => void
  updateNodePosition: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    newPos: { x: number; y: number }
  ) => void
  updateNodePositions: (
    glyphId: string,
    updates: Array<{
      pathId: string
      nodeId: string
      newPos: { x: number; y: number }
    }>
  ) => void
  updateNodeType: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    type: NodeType
  ) => void
  updateGlyphMetrics: (glyphId: string, metrics: Partial<GlyphMetrics>) => void
  createPath: (glyphId: string, path: PathData) => void
  appendNodesToPath: (
    glyphId: string,
    pathId: string,
    nodes: PathNode[],
    prepend?: boolean
  ) => void
  replacePathNodes: (
    glyphId: string,
    pathId: string,
    startNodeId: string,
    endNodeId: string,
    nodes: PathNode[]
  ) => void
  replacePathWithOpenPieces: (
    glyphId: string,
    pathId: string,
    pieces: PathData[]
  ) => void
  closePath: (glyphId: string, pathId: string) => void
  connectOpenPaths: (
    glyphId: string,
    sourcePathId: string,
    sourceNodeId: string,
    targetPathId: string,
    targetNodeId: string
  ) => { pathId: string; nodeIds: string[] } | null
  reconnectSelectedNodes: (
    glyphId: string,
    selectedNodeIds: string[]
  ) => string[]
  applyPathBooleanOperation: (
    glyphId: string,
    pathIds: string[],
    operation: PathBooleanOperation
  ) => string[]
  convertLineSegmentToCurve: (
    glyphId: string,
    pathId: string,
    startNodeId: string,
    endNodeId: string
  ) => void
  reversePaths: (glyphId: string, pathIds: string[]) => void
  deleteSelectedNodes: (glyphId: string, selectedNodeIds: string[]) => void
  loadProjectState: (
    id: string,
    title: string,
    fontData: FontData,
    projectMetadata?: Record<string, unknown> | null,
    projectSourceFormat?: ProjectSourceFormat | null,
    projectRoundTripFormat?: ProjectRoundTripFormat | null
  ) => void
  hydratePersistedLocalChanges: (
    dirtyGlyphIds: string[],
    deletedGlyphIds: string[]
  ) => void
  closeProjectState: () => void
  markDraftSaved: () => void
  markLocalSaved: () => void
  setPreviewGlyphMetrics: (glyphId: string, metrics: GlyphMetrics) => void
  clearPreviewGlyphMetrics: (glyphId?: string) => void
}
