import {
  loadProjectDraftMetadata,
  saveProjectDraft,
} from 'src/lib/project/projectRepository'
import type { KumikoProjectSummary } from 'src/lib/project/projectTypes'
import type { FontData, GlyphData, GlyphLayerData } from 'src/store'

export interface CreatedKumikoProject {
  id: string
  title: string
  fontData: FontData
  projectMetadata: Record<string, unknown> | null
  projectSourceFormat: KumikoProjectSummary['projectSourceFormat']
  projectRoundTripFormat: KumikoProjectSummary['projectRoundTripFormat']
  summary: KumikoProjectSummary
}

const DEFAULT_LAYER_ID = 'public.default'
const DEFAULT_UNITS_PER_EM = 1000

const createEmptyLayer = (width = DEFAULT_UNITS_PER_EM): GlyphLayerData => ({
  id: DEFAULT_LAYER_ID,
  name: DEFAULT_LAYER_ID,
  type: 'master',
  associatedMasterId: DEFAULT_LAYER_ID,
  paths: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { width, lsb: 0, rsb: width },
})

const createNotdefGlyph = (): GlyphData => ({
  id: '.notdef',
  name: '.notdef',
  unicodes: [],
  production: null,
  activeLayerId: DEFAULT_LAYER_ID,
  layerOrder: [DEFAULT_LAYER_ID],
  layers: {
    [DEFAULT_LAYER_ID]: createEmptyLayer(),
  },
})

const createBlankFontData = (familyName: string): FontData => ({
  glyphOrder: ['.notdef'],
  glyphs: {
    '.notdef': createNotdefGlyph(),
  },
  fontInfo: {
    familyName,
    versionMajor: 1,
    versionMinor: 0,
    customData: {},
  },
  unitsPerEm: DEFAULT_UNITS_PER_EM,
  settings: {
    fontType: 'static',
    outlineType: 'cubic',
  },
})

const createProjectId = () =>
  `kumiko-${
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }`

export const createNewBlankProject = async (
  title: string
): Promise<CreatedKumikoProject> => {
  const now = Date.now()
  const trimmedTitle = title.trim() || 'Untitled Font'
  const fontData = createBlankFontData(trimmedTitle)
  const summary = await saveProjectDraft({
    id: createProjectId(),
    title: trimmedTitle,
    lastModified: now,
    createdAt: now,
    updatedAt: now,
    sourceName: null,
    sourceType: 'local',
    githubSource: null,
    fontData,
    projectMetadata: { familyName: trimmedTitle },
    projectSourceData: null,
    projectSourceFormat: null,
    projectRoundTripFormat: null,
    projectGlyphsPackage: null,
    projectUiState: {
      selectedGlyphId: '.notdef',
      selectedLayerId: DEFAULT_LAYER_ID,
      activeMasterId: null,
      editLocation: null,
      overviewSectionId: 'all',
      overviewTopGlyphId: null,
      overviewGridState: null,
    },
  })
  const draft = await loadProjectDraftMetadata(summary.id)
  if (!draft?.fontData) {
    throw new Error('建立後無法載入專案 metadata')
  }

  return {
    id: draft.id,
    title: draft.title,
    fontData: draft.fontData,
    projectMetadata: draft.projectMetadata ?? null,
    projectSourceFormat: draft.projectSourceFormat ?? null,
    projectRoundTripFormat: draft.projectRoundTripFormat ?? null,
    summary,
  }
}
