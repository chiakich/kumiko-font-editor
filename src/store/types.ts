import type {
  ProjectRoundTripFormat,
  ProjectSourceFormat,
} from 'src/lib/project/projectFormats'
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'
import type { PathBooleanOperation } from 'src/lib/pathBooleanOperations'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import type {
  OverviewCustomFilter,
  OverviewSearchField,
} from 'src/lib/glyph/glyphOverview'
import type {
  AlternateBehaviorDraft,
  CombinationBehaviorDraft,
  ContextualBehaviorDraft,
  AnchorBehaviorDraft,
  GlyphSelector,
  OpenTypeFeaturesState,
  SpacingBehaviorDraft,
} from 'src/lib/openTypeFeatures'
export type { ProjectRoundTripFormat, ProjectSourceFormat }
export type { OpenTypeFeaturesState }
export type { OverviewCustomFilter }

export type OnCurveNodeType = 'corner' | 'smooth'
export type NodeType = OnCurveNodeType
export type PathNodeKind = 'oncurve' | 'offcurve'
export type PathSegmentType = 'line' | 'cubic' | 'quadratic'
export type KumikoColor = [number, number, number, number]

export type GlyphCustomData = Record<string, unknown>
export type GlyphSourceData = Record<string, unknown>

interface BasePathNode {
  id: string
  x: number
  y: number
  identifier?: string | null
  name?: string | null
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface OnCurvePathNode extends BasePathNode {
  kind: 'oncurve'
  // On-curve nodes carry the segment ending at this node. Off-curve nodes are
  // handles and leave this unset.
  segmentType?: PathSegmentType
  smooth?: boolean
}

export interface OffCurvePathNode extends BasePathNode {
  kind: 'offcurve'
}

export type PathNode = OnCurvePathNode | OffCurvePathNode

export interface PathData {
  id: string
  nodes: PathNode[]
  closed: boolean
  identifier?: string | null
  name?: string | null
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphComponentRef {
  id: string
  identifier?: string | null
  name?: string | null
  glyphId: string
  // Canonical affine transform in DOMMatrix order. Legacy decomposed fields are
  // kept for UI controls and format adapter convenience.
  transform?: {
    a: number
    b: number
    c: number
    d: number
    e: number
    f: number
  }
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  // Off-diagonal 2x2 matrix terms (shear); absent means 0. Together with
  // scaleX/scaleY they carry the full UFO/Glyphs component transform.
  xyScale?: number
  yxScale?: number
  autoAlign?: boolean | null
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphAnchor {
  id: string
  identifier?: string | null
  name: string
  x: number
  y: number
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphGuideline {
  id: string
  identifier?: string | null
  x: number
  y: number
  angle: number
  locked?: boolean
  name?: string
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphMetrics {
  lsb: number
  rsb: number
  width: number
}

export interface GlyphVerticalMetrics {
  height?: number | null
  tsb?: number | null
  bsb?: number | null
}

export interface GlyphImage {
  fileName: string
  xScale?: number
  xyScale?: number
  yxScale?: number
  yScale?: number
  xOffset?: number
  yOffset?: number
  color?: KumikoColor | null
  customData?: GlyphCustomData
}

export type GlyphHint = Record<string, unknown>

export interface GlyphLayerData {
  id: string
  name: string
  // 'master' layers map to font masters (one per master); 'backup' layers are
  // user-kept outline snapshots. Undefined is treated as 'master' for back-compat.
  type?: 'master' | 'backup' | 'brace' | 'bracket'
  associatedMasterId?: string | null
  braceLocation?: Record<string, number> | null
  bracketAxisRules?: Record<string, { min?: number; max?: number }> | null
  paths: PathData[]
  componentRefs: GlyphComponentRef[]
  anchors: GlyphAnchor[]
  guidelines: GlyphGuideline[]
  metrics: GlyphMetrics
  verticalMetrics?: GlyphVerticalMetrics
  hints?: GlyphHint[]
  color?: KumikoColor | null
  visible?: boolean
  locked?: boolean
  background?: GlyphLayerContent | null
  image?: GlyphImage | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

// Content fields of a layer (the fontra StaticGlyph equivalent). All editable
// glyph content lives in a layer, never on GlyphData directly.
export type GlyphLayerContent = Pick<
  GlyphLayerData,
  'paths' | 'componentRefs' | 'anchors' | 'guidelines' | 'metrics'
>

export interface GlyphData {
  id: string
  name: string
  displayName?: string | null
  // Layers are the single source of truth; activeLayerId points at the one being
  // edited/displayed. Content is read via getGlyphLayer / activeLayer.
  activeLayerId?: string | null
  layers?: Record<string, GlyphLayerData>
  layerOrder?: string[]
  componentGlyphIds?: string[]
  hasDrawableContent?: boolean
  unicodes?: string[]
  export?: boolean
  category?: string | null
  subCategory?: string | null
  status?: number | null
  production?: string | null
  note?: string | null
  color?: KumikoColor | null
  leftMetricsKey?: string | null
  rightMetricsKey?: string | null
  widthMetricsKey?: string | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface FontData {
  glyphs: Record<string, GlyphData>
  glyphOrder?: string[]
  kerningGroups?: KerningGroup[]
  kerningPairs?: KerningPair[]
  fontInfo?: FontInfo
  axes?: FontAxes
  sources?: Record<string, FontSource>
  openTypeFeatures?: OpenTypeFeaturesState
  exportInstances?: FontExportInstance[]
  statusDefinitions?: DevelopmentStatusDefinition[]
  settings?: FontProjectSettings
  unitsPerEm?: number
  lineMetricsHorizontalLayout?: Record<
    string,
    {
      value: number
      zone?: number
    }
  >
}

export interface KerningGroup {
  id: string
  side: 'left' | 'right'
  name: string
  glyphs: string[]
}

export interface KerningPair {
  id?: string
  left: GlyphSelector
  right: GlyphSelector
  value: number
}

export type FontInfoCustomDataValue =
  | string
  | number
  | boolean
  | number[]
  | string[]
  | null

export interface FontInfo {
  familyName?: string
  versionMajor?: number
  versionMinor?: number
  copyright?: string
  trademark?: string
  description?: string
  sampleText?: string
  designer?: string
  designerURL?: string
  manufacturer?: string
  manufacturerURL?: string
  licenseDescription?: string
  licenseInfoURL?: string
  vendorID?: string
  localizedNames?: Record<string, Record<string, string>>
  openTypeNameRecords?: Record<string, Record<string, Record<string, string>>>
  customData: Record<string, FontInfoCustomDataValue>
}

export interface FontAxis {
  name: string
  label: string
  tag: string
  minValue: number
  defaultValue: number
  maxValue: number
  hidden?: boolean
  mapping?: Array<[number, number]>
  customData?: Record<string, unknown>
}

export interface CrossAxisMapping {
  description?: string
  groupDescription?: string
  inputLocation: Record<string, number>
  outputLocation: Record<string, number>
}

export interface FontAxes {
  axes: FontAxis[]
  mappings: CrossAxisMapping[]
  customData?: Record<string, unknown>
}

export interface FontSource {
  id: string
  name: string
  location: Record<string, number>
  italicAngle?: number
  lineMetricsHorizontalLayout?: Record<string, { value: number; zone?: number }>
  lineMetricsVerticalLayout?: Record<string, { value: number; zone?: number }>
  customData?: Record<string, unknown>
}

export interface FontExportInstance {
  id: string
  name: string
  styleName: string
  location: Record<string, number>
  export: boolean
  fileName?: string
  familyName?: string
  weightClass?: number
  widthClass?: number
  customData?: Record<string, unknown>
}

export interface DevelopmentStatusDefinition {
  value: number
  label: string
  color: [number, number, number, number]
  isDefault?: boolean
}

export interface FontProjectSettings {
  fontType?: 'static' | 'variable'
  outlineType?: 'cubic' | 'quadratic'
  customParameters?: Record<string, unknown>
  notes?: string
  supplementalText?: string
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
export type PersistenceStatus = 'idle' | 'queued' | 'saving' | 'saved' | 'error'

export interface OverviewSearchOptionsState {
  fields: OverviewSearchField[]
  matchCase: boolean
  regex: boolean
}

export interface PersistenceQueueState {
  projectQueued: boolean
  uiStateQueued: boolean
  glyphIds: string[]
  deletedGlyphIds: string[]
  revision: number
  projectRevision: number | null
  uiStateRevision: number | null
  glyphRevisions: Record<string, number>
  deletedGlyphRevisions: Record<string, number>
  status: PersistenceStatus
  lastError: string | null
}

export interface GlobalState {
  fontData: FontData | null
  projectId: string | null
  projectTitle: string
  isDirty: boolean
  persistenceStatus: PersistenceStatus
  persistenceError: string | null
  persistenceQueue: PersistenceQueueState
  dirtyGlyphIds: string[]
  deletedGlyphIds: string[]
  hasLocalChanges: boolean
  localDirtyGlyphIds: string[]
  localDeletedGlyphIds: string[]
  glyphEditTimes: GlyphEditTimes
  glyphGeometryAccess: Record<string, number>
  glyphGeometryAccessCounter: number
  editorGlyphIds: string[]
  editorText: string
  editorTextCursorIndex: number
  editorActiveGlyphIndex: number
  previewGlyphMetrics: { glyphId: string; metrics: GlyphMetrics } | null
  // Ghost outline previewed in the editor before inserting a component copy.
  componentGhostPaths: PathData[] | null
  // Destination region of the searched component, in glyph font units.
  componentTargetRect: {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
  } | null
  idsDictionary: Record<string, string[]>
  currentSearchQuery: string
  filteredGlyphList: GlyphData[]
  selectedGlyphId: string | null
  selectedLayerId: string | null
  // Font-wide active master (a FontSource.id); null means none selected.
  activeMasterId: string | null
  // Current position in design space. master switch snaps it to source.location;
  // variable font (Phase 1) generalises it to any continuous location.
  editLocation: Record<string, number>
  // Transient UI state while a variable-axis slider is actively being scrubbed.
  isDesignspaceScrubbing: boolean
  // Reference font for tracing (loaded font held in lib/referenceFont; here we
  // keep only serialisable UI state). referenceFontChar overrides the character
  // shown; when null the editing glyph's own character is used.
  referenceFontName: string | null
  referenceFontVisible: boolean
  referenceFontChar: string | null
  // Non-active glyph layers shown as a faint backdrop behind the editing layer.
  // This can include master layers when a backup layer is selected.
  visibleBackdropLayerIds: string[]
  // Hide the active editing layer's outline, e.g. to trace from a backdrop.
  hideActiveLayer: boolean
  selectedNodeIds: string[]
  selectedSegment: SelectedSegmentState | null
  workspaceView: WorkspaceView
  overviewCustomFilters: OverviewCustomFilter[]
  overviewSearchOptions: OverviewSearchOptionsState
  overviewGroupBy: OverviewGroupByState
  overviewSectionId: string
  overviewGridState: unknown | null
  overviewTopGlyphId: string | null
  viewport: ViewportState

  setSearchQuery: (query: string) => void
  setOverviewSearchOptions: (
    options: Partial<OverviewSearchOptionsState>
  ) => void
  addOverviewCustomFilter: (
    filter: Omit<OverviewCustomFilter, 'id'> & { id?: string }
  ) => string
  updateOverviewCustomFilter: (filter: OverviewCustomFilter) => void
  deleteOverviewCustomFilter: (filterId: string) => void
  refreshFilteredGlyphList: () => void
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
  renameGlyph: (oldGlyphId: string, newGlyphId: string) => boolean
  addComponentRef: (glyphId: string, componentGlyphId: string) => boolean
  addGlyphs: (
    glyphs: Array<{
      id: string
      name: string
      unicode: string | null
      production?: string | null
      width?: number
    }>
  ) => string[]
  upsertCombinationBehavior: (draft: CombinationBehaviorDraft) => void
  deleteCombinationBehavior: (lookupId: string, ruleId: string) => void
  upsertAlternateBehavior: (draft: AlternateBehaviorDraft) => void
  deleteAlternateBehavior: (
    lookupId: string,
    ruleId: string,
    alternate: string
  ) => void
  upsertSpacingBehavior: (draft: SpacingBehaviorDraft) => void
  deleteSpacingBehavior: (lookupId: string, ruleId: string) => void
  splitSpacingClassMember: (input: {
    lookupId: string
    ruleId: string
    side: 'left' | 'right'
    glyphId: string
    counterpartGlyphId: string
    value: number
  }) => void
  upsertContextualBehavior: (draft: ContextualBehaviorDraft) => void
  deleteContextualBehavior: (lookupId: string, ruleId: string) => void
  upsertAnchorBehavior: (draft: AnchorBehaviorDraft) => void
  deleteAnchorBehavior: (glyphId: string, anchorId: string) => void
  setSelectedNodeIds: (ids: string[]) => void
  setSelectedSegment: (segment: SelectedSegmentState | null) => void
  setSelectedLayerId: (id: string | null) => void
  setActiveMasterId: (id: string | null) => void
  setEditLocation: (location: Record<string, number>) => void
  setDesignspaceScrubbing: (isScrubbing: boolean) => void
  createBackupLayer: (glyphId: string) => void
  createGlyphMasterLayer: (glyphId: string, masterId: string) => void
  duplicateLayer: (glyphId: string, layerId: string) => void
  deleteBackupLayer: (glyphId: string, layerId: string) => void
  renameBackupLayer: (glyphId: string, layerId: string, name: string) => void
  promoteBackupToMaster: (glyphId: string, layerId: string) => void
  setReferenceFontName: (name: string | null) => void
  setReferenceFontVisible: (visible: boolean) => void
  setReferenceFontChar: (char: string | null) => void
  toggleBackdropLayer: (layerId: string) => void
  toggleActiveLayerHidden: () => void
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
  applyBatchNodePositions: (
    batch: Array<{
      glyphId: string
      updates: Array<{
        pathId: string
        nodeId: string
        newPos: { x: number; y: number }
      }>
    }>
  ) => void
  updateNodeType: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    type: OnCurveNodeType
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
  setStartPoint: (glyphId: string, pathId: string, nodeId: string) => void
  deleteSelectedNodes: (glyphId: string, selectedNodeIds: string[]) => void
  loadProjectState: (
    id: string,
    title: string,
    fontData: FontData,
    projectMetadata?: Record<string, unknown> | null,
    projectSourceFormat?: ProjectSourceFormat | null,
    projectRoundTripFormat?: ProjectRoundTripFormat | null,
    projectUiState?: KumikoProjectUiState | null
  ) => void
  hydrateGlyphGeometry: (
    glyphs: GlyphData[],
    options?: { maxLoadedGlyphs?: number }
  ) => void
  hydrateExternalGlyphDeletions: (glyphIds: string[]) => void
  hydratePersistedLocalChanges: (
    dirtyGlyphIds: string[],
    deletedGlyphIds: string[],
    glyphEditTimes?: GlyphEditTimes
  ) => void
  closeProjectState: () => void
  markDraftSaved: (
    savedDirtyIds?: string[],
    savedDeletedIds?: string[],
    savedRevision?: number
  ) => void
  setPersistenceStatus: (
    status: PersistenceStatus,
    error?: string | null
  ) => void
  markLocalSaved: () => void
  updateFontInfo: (update: { fontInfo: FontInfo; unitsPerEm?: number }) => void
  updateFontSettings: (fontDataUpdate: Partial<FontData>) => void
  setPreviewGlyphMetrics: (glyphId: string, metrics: GlyphMetrics) => void
  setComponentGhostPaths: (paths: PathData[] | null) => void
  setComponentTargetRect: (
    rect: { xMin: number; yMin: number; xMax: number; yMax: number } | null
  ) => void
  clearPreviewGlyphMetrics: (glyphId?: string) => void
}
