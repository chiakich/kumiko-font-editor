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

export { getGlyphLayer } from 'src/store/glyphLayer'
export {
  getEffectiveNodeType,
  isPathEndpointNode,
} from 'src/store/glyphGeometry'
export { deterministicStringify } from 'src/store/deterministicStringify'
export type {
  FontData,
  GlyphAnchor,
  GlyphComponentRef,
  GlyphData,
  GlyphGuideline,
  GlyphLayerData,
  GlyphMetrics,
  GlobalState,
  NodeType,
  OverviewGroupByState,
  PathData,
  PathNode,
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
  dirtyGlyphIds: [],
  deletedGlyphIds: [],
  hasLocalChanges: false,
  localDirtyGlyphIds: [],
  localDeletedGlyphIds: [],
  editorGlyphIds: [],
  editorText: '',
  editorTextCursorIndex: 0,
  editorActiveGlyphIndex: 0,
  previewGlyphMetrics: null,
  idsDictionary: IDS_DICTIONARY,
  currentSearchQuery: '',
  filteredGlyphList: [],
  selectedGlyphId: null,
  selectedLayerId: 'default',
  selectedNodeIds: [],
  selectedSegment: null,
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

      // setSelectedLayerId needs access to temporal store, so wire it here
      setSelectedLayerId: (id: string | null) => {
        buildGlyphActions(set).setSelectedLayerId(id, () =>
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
      equality: (pastState, currentState) =>
        pastState.fontData === currentState.fontData,
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
