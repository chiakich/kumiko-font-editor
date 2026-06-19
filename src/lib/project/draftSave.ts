import {
  getProjectArchiveMetadata,
  getProjectArchiveSourceFormat,
} from 'src/lib/project/projectArchive'
import { PROJECT_UI_STATE_KEY } from 'src/lib/project/projectRepository'
import {
  fontDataToKumikoProjectRecord,
  glyphDataToKumikoGlyphRecord,
} from 'src/lib/project/kumikoFontDataAdapter'
import {
  loadKumikoGlyphRecord,
  loadKumikoProjectRecord,
  loadKumikoUiValue,
  makeKumikoGlyphKey,
  patchKumikoGlyphMetadata,
  patchKumikoProjectData,
} from 'src/lib/project/kumikoProjectPersistence'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import type { FontData, GlyphData } from 'src/store'
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import {
  UFO_GLYPH_EDIT_TIMES_KEY,
  withProjectGlyphEditTimes,
} from 'src/lib/glyph/glyphEditTimes'

const getGlyphOrder = (fontData: FontData) =>
  fontData.glyphOrder ?? Object.keys(fontData.glyphs)

const hasSameGlyphOrder = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  left.every((glyphId, index) => glyphId === right[index])

const toGlyphMetadataPatch = (glyph: GlyphData) => ({
  displayName: glyph.displayName ?? null,
  unicodes: glyph.unicodes ?? [],
  production: glyph.production,
  export: glyph.export,
  category: glyph.category,
  subCategory: glyph.subCategory,
  status: glyph.status,
  color: glyph.color,
  note: glyph.note,
  leftMetricsKey: glyph.leftMetricsKey,
  rightMetricsKey: glyph.rightMetricsKey,
  widthMetricsKey: glyph.widthMetricsKey,
  customData: glyph.customData,
  sourceData: glyph.sourceData,
})

export const saveDraftSnapshot = async (input: {
  projectId: string
  projectTitle: string
  fontData: FontData
  dirtyGlyphIds: string[]
  deletedGlyphIds: string[]
  projectQueued?: boolean
  projectUiState?: KumikoProjectUiState | null
  glyphEditTimes: GlyphEditTimes
  selectedLayerId: string | null
}) => {
  const persistedProject = await loadKumikoProjectRecord(input.projectId)
  const projectSourceFormat =
    getProjectArchiveSourceFormat() ?? persistedProject?.sourceFormat ?? null
  const projectMetadata =
    (await loadKumikoUiValue<Record<string, unknown>>(
      input.projectId,
      'projectMetadata'
    )) ?? getProjectArchiveMetadata()
  const now = Date.now()

  const nextGlyphOrder = getGlyphOrder(input.fontData)
  const projectChanged =
    input.projectQueued ||
    !persistedProject ||
    persistedProject.title !== input.projectTitle ||
    input.deletedGlyphIds.length > 0 ||
    !hasSameGlyphOrder(persistedProject.glyphOrder, nextGlyphOrder)
  const project = fontDataToKumikoProjectRecord({
    projectId: input.projectId,
    title: input.projectTitle,
    fontData: input.fontData,
    createdAt: persistedProject?.createdAt ?? now,
    updatedAt: now,
    sourceName: persistedProject?.sourceName ?? null,
    sourceType: persistedProject?.sourceType ?? 'local',
    sourceFormat: projectSourceFormat,
    githubSource: persistedProject?.githubSource ?? null,
    sourceData: persistedProject?.sourceData,
    exportDirty: Boolean(persistedProject?.exportDirty) || projectChanged,
    syncDirty: Boolean(persistedProject?.syncDirty) || projectChanged,
  })
  project.exportedDigest = persistedProject?.exportedDigest ?? null
  project.syncedDigest = persistedProject?.syncedDigest ?? null

  const dirtyGlyphs = [...new Set(input.dirtyGlyphIds)]
    .map((glyphId) => input.fontData.glyphs[glyphId])
    .filter((glyph): glyph is NonNullable<typeof glyph> => Boolean(glyph))
  const glyphsWithGeometry = dirtyGlyphs.filter(isGlyphGeometryLoaded)
  const metadataOnlyGlyphs = dirtyGlyphs.filter(
    (glyph) => !isGlyphGeometryLoaded(glyph)
  )

  const glyphsToSave = await Promise.all(
    glyphsWithGeometry.map(async (glyph) => {
      const existing = await loadKumikoGlyphRecord(
        makeKumikoGlyphKey(input.projectId, glyph.id)
      )
      const record = glyphDataToKumikoGlyphRecord({
        projectId: input.projectId,
        glyph,
        updatedAt: now,
        exportDirty: true,
        syncDirty: true,
      })
      return {
        ...record,
        exportedDigest: existing?.exportedDigest ?? null,
        syncedDigest: existing?.syncedDigest ?? null,
      }
    })
  )

  await patchKumikoProjectData({
    project,
    glyphsToSave,
    glyphKeysToDelete: [...new Set(input.deletedGlyphIds)].map((glyphId) =>
      makeKumikoGlyphKey(input.projectId, glyphId)
    ),
    uiStateToSave: [
      {
        projectId: input.projectId,
        key: UFO_GLYPH_EDIT_TIMES_KEY,
        value: input.glyphEditTimes,
      },
      {
        projectId: input.projectId,
        key: 'projectMetadata',
        value: withProjectGlyphEditTimes(projectMetadata, input.glyphEditTimes),
      },
      {
        projectId: input.projectId,
        key: PROJECT_UI_STATE_KEY,
        value: input.projectUiState ?? null,
      },
    ],
  })

  await Promise.all(
    metadataOnlyGlyphs.map((glyph) =>
      patchKumikoGlyphMetadata({
        projectId: input.projectId,
        glyphId: glyph.id,
        patch: toGlyphMetadataPatch(glyph),
        updatedAt: now,
        exportDirty: true,
        syncDirty: true,
      })
    )
  )
}
