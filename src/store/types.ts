import type {
  ProjectRoundTripFormat,
  ProjectSourceFormat,
} from '@/lib/project/projectFormats'
import type { KumikoProjectUiState } from '@/lib/project/projectTypes'
import type { PathBooleanOperation } from '@/lib/pathBooleanOperations'
import type { OutlineOffsetOptions } from '@/lib/outlineOffset'
import type { GlyphEditTimes } from '@/lib/glyph/glyphEditTimes'
import type { RadarReferenceData } from '@/lib/qualityCheck/qualityRadar'
import type {
  OverviewCustomFilter,
  OverviewSearchField,
} from '@/lib/glyph/glyphOverview'
import type {
  AlternateBehaviorDraft,
  CombinationBehaviorDraft,
  ContextualBehaviorDraft,
  AnchorBehaviorDraft,
  GlyphSelector,
  OpenTypeFeaturesState,
  SpacingBehaviorDraft,
} from '@/lib/openTypeFeatures'
export type { ProjectRoundTripFormat, ProjectSourceFormat }
export type { OpenTypeFeaturesState }
export type { OverviewCustomFilter }
import type {
  FontData,
  FontInfo,
  FontSource,
  GlyphData,
  GlyphLayerData,
  GlyphMetrics,
  KerningPair,
  KumikoColor,
  OnCurveNodeType,
  PathData,
  PathNode,
} from '@/domain/types'

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

export type WorkspaceView = 'overview' | 'editor' | 'features'
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

export type ReferenceFontResidualStatus =
  | 'idle'
  | 'computing'
  | 'ready'
  | 'error'

export interface ReferenceFontResidualSummary {
  source: string
  sampleCount: number
  entryCount: number
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
  // Glyphs currently needed by editor-side reference previews. Their geometry
  // should survive undo snapshots so previews do not immediately reload it.
  editorReferenceGlyphIds: string[]
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
  referenceFontColor: string
  referenceFontOpacity: number
  referenceFontResidualEnabled: boolean
  referenceFontResidualStatus: ReferenceFontResidualStatus
  referenceFontResidualData: RadarReferenceData | null
  referenceFontResidualError: string | null
  referenceFontResidualSummary: ReferenceFontResidualSummary | null
  // Non-active glyph layers shown as a faint backdrop behind the editing layer.
  // This can include master layers when a backup layer is selected.
  visibleBackdropLayerIds: string[]
  // Hide the active editing layer's outline, e.g. to trace from a backdrop.
  hideActiveLayer: boolean
  selectedNodeIds: string[]
  selectedSegment: SelectedSegmentState | null
  workspaceView: WorkspaceView
  // One-shot request from other screens (e.g. the feature workspace) to open
  // a specific editor right-panel tab; the panel consumes and clears it.
  editorRightPanelTabRequest: number | null
  // Last feature-workspace UI state so leaving and returning does not reset
  // the preview text, direction, or open view. Session-only.
  featureWorkspaceSnapshot: {
    view:
      | { kind: 'home' }
      | { kind: 'index' }
      | { kind: 'feature'; featureId: string }
      | { kind: 'kern' }
      | { kind: 'classes' }
    text: string
    direction: 'ltr' | 'ttb'
    languageOptionId: string | null
  } | null
  // One-shot deep link into the feature workspace, consumed by its screen.
  featureWorkspaceRequest:
    | { kind: 'home' }
    | { kind: 'kern' }
    | { kind: 'classes' }
    | { kind: 'feature'; tag: string }
    | null
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
  requestEditorRightPanelTab: (index: number | null) => void
  requestFeatureWorkspace: (
    request: GlobalState['featureWorkspaceRequest']
  ) => void
  setFeatureWorkspaceSnapshot: (
    snapshot: GlobalState['featureWorkspaceSnapshot']
  ) => void
  setOverviewGrouping: (groupBy: OverviewGroupByState) => void
  setOverviewSectionId: (sectionId: string) => void
  setOverviewGridState: (state: unknown | null) => void
  setOverviewTopGlyphId: (glyphId: string | null) => void
  deleteGlyph: (glyphId: string) => void
  renameGlyph: (oldGlyphId: string, newGlyphId: string) => boolean
  setGlyphColor: (glyphId: string, color: KumikoColor | null) => void
  setLayerColor: (
    glyphId: string,
    layerId: string,
    color: KumikoColor | null
  ) => void
  pasteGlyphCopies: (
    glyphs: GlyphData[],
    options?: { afterGlyphId?: string | null }
  ) => string[]
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
  createGlyphVariant: (sourceGlyphId: string, newGlyphId: string) => void
  upsertKerningPair: (
    left: GlyphSelector,
    right: GlyphSelector,
    value: number,
    orientation?: 'horizontal' | 'vertical'
  ) => void
  deleteKerningPair: (
    left: GlyphSelector,
    right: GlyphSelector,
    orientation?: 'horizontal' | 'vertical'
  ) => void
  upsertKerningGroup: (draft: {
    id?: string
    side: 'left' | 'right'
    name: string
    glyphs: string[]
  }) => void
  deleteKerningGroup: (groupId: string) => void
  upsertContextualBehavior: (draft: ContextualBehaviorDraft) => void
  deleteContextualBehavior: (lookupId: string, ruleId: string) => void
  upsertAnchorBehavior: (draft: AnchorBehaviorDraft) => void
  deleteAnchorBehavior: (glyphId: string, anchorId: string) => void
  setSelectedNodeIds: (ids: string[]) => void
  setSelectedSegment: (segment: SelectedSegmentState | null) => void
  setEditorReferenceGlyphIds: (ids: string[]) => void
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
  setReferenceFontColor: (color: string) => void
  setReferenceFontOpacity: (opacity: number) => void
  setReferenceFontResidualComputing: () => void
  setReferenceFontResidualReady: (
    data: RadarReferenceData,
    summary: ReferenceFontResidualSummary
  ) => void
  setReferenceFontResidualError: (message: string) => void
  clearReferenceFontResidual: () => void
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
  applyOutlineOffset: (
    glyphId: string,
    distance: number,
    options?: OutlineOffsetOptions
  ) => void
  applyBatchOutlineOffset: (
    glyphIds: string[],
    distance: number,
    options?: OutlineOffsetOptions
  ) => void
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
  // Reflect an imported binary master in the store: register the source and, for
  // glyphs whose geometry is currently loaded, attach the pre-built master layer.
  // Records were already persisted; evicted glyphs re-hydrate them on access.
  applyImportedMaster: (input: {
    source: FontSource
    layersByGlyphId: Record<string, GlyphLayerData>
    newGlyphs?: GlyphData[]
    // Pairs to seed the new master's kerning entry with (a copy-method master
    // copies its base master's pairs); defaults to an empty set.
    kerningPairs?: KerningPair[]
  }) => void
  setPreviewGlyphMetrics: (glyphId: string, metrics: GlyphMetrics) => void
  setComponentGhostPaths: (paths: PathData[] | null) => void
  setComponentTargetRect: (
    rect: { xMin: number; yMin: number; xMax: number; yMax: number } | null
  ) => void
  clearPreviewGlyphMetrics: (glyphId?: string) => void
}
