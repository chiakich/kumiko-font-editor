import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import { partializeTemporalState } from '@/store/temporalSnapshot'
import type { FontData, GlyphData, GlyphLayerData } from '@/store'

const makeLayer = (id: string, width = 1000): GlyphLayerData => ({
  id,
  name: id,
  type: 'master',
  associatedMasterId: id,
  paths: [
    {
      id: `${id}-path`,
      closed: false,
      nodes: [
        {
          id: `${id}-node`,
          x: 10,
          y: 20,
          kind: 'oncurve',
          segmentType: 'line',
        },
      ],
    },
  ],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { width, lsb: 0, rsb: 0 },
})

const makeGlyph = (id: string): GlyphData => ({
  id,
  name: id,
  activeLayerId: 'public.default',
  layerOrder: ['public.default'],
  unicodes: [],
  layers: {
    'public.default': makeLayer('public.default'),
  },
})

const getFirstNode = (glyphId: string) => {
  const node =
    useStore.getState().fontData?.glyphs[glyphId].layers?.['public.default']
      .paths[0].nodes[0]

  expect(node).toBeDefined()
  return node!
}

const loadSingleGlyphProject = () => {
  const fontData: FontData = {
    glyphOrder: ['A'],
    glyphs: {
      A: makeGlyph('A'),
    },
  }
  useStore.getState().loadProjectState('project-a', 'Project A', fontData)
  useStore.getState().setSelectedGlyphId('A')
  useStore.temporal.getState().clear()
}

const expectNoUndoCheckpoint = (name: string, action: () => void) => {
  loadSingleGlyphProject()

  action()

  expect(useStore.temporal.getState().pastStates, name).toHaveLength(0)
  useStore.getState().closeProjectState()
}

describe('temporal snapshots', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('drops non-working-set glyph geometry from undo history', () => {
    const fontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        A: makeGlyph('A'),
        B: makeGlyph('B'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)
    useStore.getState().setSelectedGlyphId('A')
    useStore.getState().updateGlyphMetrics('A', { width: 900 })

    const snapshot = useStore.temporal.getState().pastStates[0] as {
      fontData?: FontData | null
    }

    expect(snapshot.fontData?.glyphs.A.layers).toBeDefined()
    expect(snapshot.fontData?.glyphs.B.layers).toBeUndefined()
    expect(snapshot.fontData?.glyphs.B.activeLayerId).toBeNull()
  })

  it('keeps dirty glyph geometry even when the glyph is not selected', () => {
    const fontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        A: makeGlyph('A'),
        B: makeGlyph('B'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)
    useStore.getState().setSelectedGlyphId('A')
    useStore.getState().updateGlyphMetrics('B', { width: 900 })
    useStore.getState().updateGlyphMetrics('A', { width: 800 })

    const latestSnapshot = useStore.temporal.getState().pastStates.at(-1) as {
      fontData?: FontData | null
    }

    expect(latestSnapshot.fontData?.glyphs.B.layers).toBeDefined()
  })

  it('tracks only font data in temporal snapshots', () => {
    loadSingleGlyphProject()

    expect(Object.keys(partializeTemporalState(useStore.getState()))).toEqual([
      'fontData',
    ])
  })

  it('guards UI-only actions from undo history', () => {
    const uiOnlyActions: Array<[string, () => void]> = [
      ['setSearchQuery', () => useStore.getState().setSearchQuery('latin')],
      [
        'refreshFilteredGlyphList',
        () => useStore.getState().refreshFilteredGlyphList(),
      ],
      ['setSelectedGlyphId', () => useStore.getState().setSelectedGlyphId('A')],
      [
        'setReferenceFontName',
        () => useStore.getState().setReferenceFontName('Ref'),
      ],
      [
        'setReferenceFontVisible',
        () => useStore.getState().setReferenceFontVisible(true),
      ],
      [
        'setReferenceFontChar',
        () => useStore.getState().setReferenceFontChar('A'),
      ],
      [
        'toggleBackdropLayer',
        () => useStore.getState().toggleBackdropLayer('public.default'),
      ],
      [
        'toggleActiveLayerHidden',
        () => useStore.getState().toggleActiveLayerHidden(),
      ],
      ['addGlyphToEditor', () => useStore.getState().addGlyphToEditor('A')],
      [
        'insertGlyphIntoEditor',
        () => useStore.getState().insertGlyphIntoEditor('A'),
      ],
      [
        'removeGlyphFromEditor',
        () => {
          useStore.getState().addGlyphToEditor('A')
          useStore.temporal.getState().clear()
          useStore.getState().removeGlyphFromEditor('A')
        },
      ],
      [
        'setEditorTextCursorIndex',
        () => useStore.getState().setEditorTextCursorIndex(0),
      ],
      [
        'setEditorActiveGlyphIndex',
        () => useStore.getState().setEditorActiveGlyphIndex(0),
      ],
      [
        'setEditorTextState',
        () => useStore.getState().setEditorTextState('A', ['A'], 1, 0),
      ],
      [
        'setWorkspaceView',
        () => useStore.getState().setWorkspaceView('editor'),
      ],
      [
        'setOverviewGrouping',
        () => useStore.getState().setOverviewGrouping('script'),
      ],
      [
        'setOverviewSectionId',
        () => useStore.getState().setOverviewSectionId('blank'),
      ],
      [
        'setOverviewGridState',
        () => useStore.getState().setOverviewGridState({ top: 10 }),
      ],
      [
        'setOverviewTopGlyphId',
        () => useStore.getState().setOverviewTopGlyphId('A'),
      ],
      [
        'setSelectedNodeIds',
        () => useStore.getState().setSelectedNodeIds(['public.default-node']),
      ],
      [
        'setSelectedSegment',
        () =>
          useStore.getState().setSelectedSegment({
            pathId: 'public.default-path',
            startNodeId: 'public.default-node',
            endNodeId: 'public.default-node',
            type: 'line',
          }),
      ],
      ['updateViewport', () => useStore.getState().updateViewport(1, 12, 34)],
      [
        'setPreviewGlyphMetrics',
        () =>
          useStore
            .getState()
            .setPreviewGlyphMetrics('A', { width: 1000, lsb: 0, rsb: 0 }),
      ],
      [
        'clearPreviewGlyphMetrics',
        () => {
          useStore
            .getState()
            .setPreviewGlyphMetrics('A', { width: 1000, lsb: 0, rsb: 0 })
          useStore.temporal.getState().clear()
          useStore.getState().clearPreviewGlyphMetrics('A')
        },
      ],
      [
        'hydrateExternalGlyphDeletions',
        () => useStore.getState().hydrateExternalGlyphDeletions(['A']),
      ],
      [
        'setComponentGhostPaths',
        () => useStore.getState().setComponentGhostPaths([]),
      ],
      [
        'setComponentTargetRect',
        () =>
          useStore
            .getState()
            .setComponentTargetRect({ xMin: 0, yMin: 0, xMax: 10, yMax: 10 }),
      ],
    ]

    for (const [name, action] of uiOnlyActions) {
      expectNoUndoCheckpoint(name, action)
    }
  })

  it('does not store UI-only updates as undo checkpoints', () => {
    const fontData: FontData = {
      glyphOrder: ['A'],
      glyphs: {
        A: makeGlyph('A'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)
    useStore.getState().setSelectedGlyphId('A')
    useStore.temporal.getState().clear()

    useStore.getState().setSelectedNodeIds(['public.default-node'])
    useStore
      .getState()
      .setPreviewGlyphMetrics('A', { width: 1000, lsb: 0, rsb: 0 })
    useStore.getState().updateViewport(1, 12, 34)

    expect(useStore.temporal.getState().pastStates).toHaveLength(0)

    useStore.getState().updateGlyphMetrics('A', { width: 900 })

    expect(useStore.temporal.getState().pastStates).toHaveLength(1)

    useStore.getState().setSelectedNodeIds([])

    expect(useStore.temporal.getState().pastStates).toHaveLength(1)
  })

  it('restores a moved node with a single undo after UI-only updates', () => {
    const fontData: FontData = {
      glyphOrder: ['A'],
      glyphs: {
        A: makeGlyph('A'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)
    useStore.getState().setSelectedGlyphId('A')
    useStore.temporal.getState().clear()

    useStore.getState().updateNodePositions('A', [
      {
        pathId: 'public.default-path',
        nodeId: 'public.default-node',
        newPos: { x: 80, y: 90 },
      },
    ])
    useStore.getState().setSelectedNodeIds(['public.default-node'])
    useStore.getState().setSelectedSegment({
      pathId: 'public.default-path',
      startNodeId: 'public.default-node',
      endNodeId: 'public.default-node',
      type: 'line',
    })

    expect(getFirstNode('A')).toMatchObject({ x: 80, y: 90 })
    expect(useStore.temporal.getState().pastStates).toHaveLength(1)

    useStore.temporal.getState().undo()

    expect(getFirstNode('A')).toMatchObject({ x: 10, y: 20 })
  })
})
