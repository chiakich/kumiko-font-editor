import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { temporal, type TemporalState } from 'zundo'
import type { GlobalState } from 'src/store/types'
import { IDS_DICTIONARY } from 'src/store/glyphSearch'
import { buildUiActions } from 'src/store/actions/uiActions'
import { buildGlyphActions } from 'src/store/actions/glyphActions'
import { buildPathActions } from 'src/store/actions/pathActions'
import { buildProjectActions } from 'src/store/actions/projectActions'
import { buildBehaviorActions } from 'src/store/actions/behaviorActions'

export {
  getGlyphLayer,
  getActiveLayer,
  activeLayer,
  ensureActiveLayer,
  setGlyphActiveLayer,
  withActiveLayer,
  getActiveLayerId,
  normalizeGlyphToLayers,
} from 'src/store/glyphLayer'
export {
  createOffCurveNode,
  createOnCurveNode,
  getEffectiveNodeType,
  getNodeSegmentType,
  getNodeType,
  isOffCurveNode,
  isOnCurveNode,
  isPathEndpointNode,
  setNodeSegmentType,
  setNodeType,
} from 'src/store/glyphGeometry'
export { deterministicStringify } from 'src/store/deterministicStringify'
export type {
  FontData,
  FontAxes,
  FontAxis,
  FontExportInstance,
  FontInfo,
  FontInfoCustomDataValue,
  FontProjectSettings,
  FontSource,
  GlyphAnchor,
  GlyphComponentRef,
  GlyphCustomData,
  GlyphData,
  GlyphGuideline,
  GlyphImage,
  GlyphLayerData,
  GlyphMetrics,
  GlyphSourceData,
  GlyphVerticalMetrics,
  KerningGroup,
  KerningPair,
  KumikoColor,
  GlobalState,
  CrossAxisMapping,
  DevelopmentStatusDefinition,
  NodeType,
  OnCurveNodeType,
  OpenTypeFeatures,
  OpenTypeFeaturesState,
  OverviewGroupByState,
  PathData,
  PathNode,
  PathNodeKind,
  PathSegmentType,
  SelectedNodeRef,
  SelectedSegmentState,
  ViewportState,
  WorkspaceView,
} from 'src/store/types'

const initialState = {
  fontData: null,
  projectId: null,
  projectTitle: '',
  isDirty: false,
  persistenceStatus: 'idle' as const,
  persistenceError: null,
  dirtyGlyphIds: [],
  deletedGlyphIds: [],
  hasLocalChanges: false,
  localDirtyGlyphIds: [],
  localDeletedGlyphIds: [],
  glyphEditTimes: {},
  editorGlyphIds: [],
  editorText: '',
  editorTextCursorIndex: 0,
  editorActiveGlyphIndex: 0,
  previewGlyphMetrics: null,
  componentGhostPaths: null,
  componentTargetRect: null,
  idsDictionary: IDS_DICTIONARY,
  currentSearchQuery: '',
  filteredGlyphList: [],
  selectedGlyphId: null,
  selectedLayerId: 'default',
  activeMasterId: null,
  editLocation: {},
  selectedNodeIds: [],
  selectedSegment: null,
  referenceFontName: null,
  referenceFontVisible: false,
  referenceFontChar: null,
  visibleBackdropLayerIds: [],
  hideActiveLayer: false,
  workspaceView: 'overview' as const,
  overviewGroupBy: 'script' as const,
  overviewSectionId: 'all',
  overviewGridState: null,
  overviewTopGlyphId: null,
  viewport: {
    zoom: 0.46,
    pan: { x: 0, y: 30 },
  },
} satisfies Partial<GlobalState>

export const useStore = create<GlobalState>()(
  temporal(
    immer((set) => ({
      ...initialState,

      // ── UI / editor actions ──────────────────────────────────────────────
      ...buildUiActions(set),

      // ── Glyph-level actions ──────────────────────────────────────────────
      ...buildGlyphActions(set),
      ...buildBehaviorActions(set),

      // setSelectedLayerId needs access to temporal store, so wire it here
      setSelectedLayerId: (id: string | null) => {
        buildGlyphActions(set).setSelectedLayerId(id, () =>
          useStore.temporal.getState().clear()
        )
      },

      // Master switch mutates glyph.activeLayerId; clear temporal so it is not an
      // undo step (mirrors setSelectedLayerId).
      setActiveMasterId: (id: string | null) => {
        buildGlyphActions(set).setActiveMasterId(id, () =>
          useStore.temporal.getState().clear()
        )
      },

      // ── Path / node actions ──────────────────────────────────────────────
      ...buildPathActions(set),

      // ── Project lifecycle actions ────────────────────────────────────────
      ...buildProjectActions(set, () => useStore.temporal.getState().clear()),
    })),
    {
      partialize: (state) => ({ fontData: state.fontData }),
      // Treat any transition that involves a null fontData (project open/close)
      // as "unchanged" so it is never recorded. Otherwise the null→loaded open
      // transition becomes the bottom of the undo stack, and undoing far enough
      // restores fontData = null, which routes the app back to the Home screen.
      equality: (pastState, currentState) =>
        pastState.fontData === currentState.fontData ||
        !pastState.fontData ||
        !currentState.fontData,
      limit: 50,
    }
  )
)

export const useTemporalStore = <T>(
  selector: (state: TemporalState<unknown>) => T
): T =>
  useSyncExternalStore(
    useStore.temporal.subscribe,
    () => selector(useStore.temporal.getState()),
    () => selector(useStore.temporal.getState())
  )
