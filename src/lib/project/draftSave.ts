import {
  getProjectArchiveMetadata,
  getProjectArchiveRoundTripFormat,
  getProjectArchiveSourceFormat,
} from 'src/lib/project/projectArchive'
import { saveKumikoUiValue } from 'src/lib/project/kumikoProjectPersistence'
import {
  loadProjectDraft,
  saveProjectDraft,
} from 'src/lib/project/projectRepository'
import type { FontData } from 'src/store'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import {
  UFO_GLYPH_EDIT_TIMES_KEY,
  withProjectGlyphEditTimes,
} from 'src/lib/glyph/glyphEditTimes'

export const saveDraftSnapshot = async (input: {
  projectId: string
  projectTitle: string
  fontData: FontData
  dirtyGlyphIds: string[]
  deletedGlyphIds: string[]
  glyphEditTimes: GlyphEditTimes
  selectedLayerId: string | null
}) => {
  const projectSourceFormat = getProjectArchiveSourceFormat()
  const projectRoundTripFormat = getProjectArchiveRoundTripFormat()
  const persistedProject = await loadProjectDraft(input.projectId)
  const projectMetadata = getProjectArchiveMetadata()
  const now = Date.now()
  await saveProjectDraft({
    id: input.projectId,
    title: input.projectTitle,
    lastModified: now,
    createdAt: persistedProject?.createdAt ?? now,
    updatedAt: now,
    sourceName: persistedProject?.sourceName ?? null,
    sourceType: persistedProject?.sourceType ?? 'local',
    githubSource: persistedProject?.githubSource ?? null,
    fontData: input.fontData,
    projectMetadata: withProjectGlyphEditTimes(
      persistedProject?.projectMetadata ?? projectMetadata,
      input.glyphEditTimes
    ),
    projectSourceData: persistedProject?.projectSourceData ?? null,
    projectSourceFormat,
    projectRoundTripFormat,
    projectGlyphsPackage: persistedProject?.projectGlyphsPackage ?? null,
    projectExportDirty:
      input.dirtyGlyphIds.length > 0 || input.deletedGlyphIds.length > 0,
    projectSyncDirty:
      input.dirtyGlyphIds.length > 0 || input.deletedGlyphIds.length > 0,
    exportDirtyGlyphIds: input.dirtyGlyphIds,
    syncDirtyGlyphIds: input.dirtyGlyphIds,
  })
  await saveKumikoUiValue(
    input.projectId,
    UFO_GLYPH_EDIT_TIMES_KEY,
    input.glyphEditTimes
  )
}
