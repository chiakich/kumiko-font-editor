import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { temporal, type TemporalState } from 'zundo'
import type { GlobalState } from '@/store/types'
import {
  DEFAULT_OVERVIEW_SEARCH_OPTIONS,
  IDS_DICTIONARY,
} from '@/store/glyphSearch'
import { loadAppOverviewCustomFilters } from '@/lib/preferences/appPreferences'
import { buildUiActions } from '@/store/actions/uiActions'
import { buildGlyphActions } from '@/store/actions/glyphActions'
import { buildPathActions } from '@/store/actions/pathActions'
import { buildProjectActions } from '@/store/actions/projectActions'
import { buildBehaviorActions } from '@/store/actions/behaviorActions'
import { buildKerningActions } from '@/store/actions/kerningActions'
import {
  areTemporalTrackedStatesEqual,
  partializeTemporalState,
} from '@/store/temporalSnapshot'

export type {
  GlobalState,
  OpenTypeFeaturesState,
  OverviewCustomFilter,
  OverviewSearchOptionsState,
  OverviewGroupByState,
  PersistenceQueueState,
  PersistenceStatus,
  SelectedNodeRef,
  SelectedSegmentState,
  ViewportState,
  WorkspaceView,
} from '@/store/types'

const initialState = {
  fontData: null,
  projectId: null,
  projectTitle: '',
  isDirty: false,
  persistenceStatus: 'idle' as const,
  persistenceError: null,
  persistenceQueue: {
    projectQueued: false,
    uiStateQueued: false,
    glyphIds: [],
    deletedGlyphIds: [],
    revision: 0,
    projectRevision: null,
    uiStateRevision: null,
    glyphRevisions: {},
    deletedGlyphRevisions: {},
    status: 'idle' as const,
    lastError: null,
  },
  dirtyGlyphIds: [],
  deletedGlyphIds: [],
  hasLocalChanges: false,
  localDirtyGlyphIds: [],
  localDeletedGlyphIds: [],
  glyphEditTimes: {},
  glyphGeometryAccess: {},
  glyphGeometryAccessCounter: 0,
  editorGlyphIds: [],
  editorText: '',
  editorTextCursorIndex: 0,
  editorActiveGlyphIndex: 0,
  editorReferenceGlyphIds: [],
  previewGlyphMetrics: null,
  componentGhostPaths: null,
  componentTargetRect: null,
  idsDictionary: IDS_DICTIONARY,
  currentSearchQuery: '',
  overviewCustomFilters: loadAppOverviewCustomFilters(),
  overviewSearchOptions: DEFAULT_OVERVIEW_SEARCH_OPTIONS,
  filteredGlyphList: [],
  selectedGlyphId: null,
  selectedLayerId: 'default',
  activeMasterId: null,
  editLocation: {},
  isDesignspaceScrubbing: false,
  selectedNodeIds: [],
  selectedSegment: null,
  referenceFontName: null,
  referenceFontVisible: false,
  referenceFontChar: null,
  referenceFontColor: '#1f6feb',
  referenceFontOpacity: 0.2,
  referenceFontResidualEnabled: false,
  referenceFontResidualStatus: 'idle' as const,
  referenceFontResidualData: null,
  referenceFontResidualError: null,
  referenceFontResidualSummary: null,
  visibleBackdropLayerIds: [],
  hideActiveLayer: false,
  workspaceView: 'overview' as const,
  editorRightPanelTabRequest: null,
  featureWorkspaceRequest: null,
  featureWorkspaceSnapshot: null,
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
      ...buildKerningActions(set),

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

      setEditLocation: (location: Record<string, number>) => {
        buildGlyphActions(set).setEditLocation(location, () =>
          useStore.temporal.getState().clear()
        )
      },

      // ── Path / node actions ──────────────────────────────────────────────
      ...buildPathActions(set),

      // ── Project lifecycle actions ────────────────────────────────────────
      ...buildProjectActions(
        set,
        () => useStore.temporal.getState().clear(),
        (callback) => {
          const temporal = useStore.temporal.getState()
          const wasTracking = temporal.isTracking
          if (wasTracking) {
            temporal.pause()
          }
          try {
            callback()
          } finally {
            if (wasTracking) {
              temporal.resume()
            }
          }
        }
      ),
    })),
    {
      partialize: partializeTemporalState,
      // Treat any transition that involves a null fontData (project open/close)
      // as "unchanged" so it is never recorded. Otherwise the null→loaded open
      // transition becomes the bottom of the undo stack, and undoing far enough
      // restores fontData = null, which routes the app back to the Home screen.
      equality: areTemporalTrackedStatesEqual,
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
