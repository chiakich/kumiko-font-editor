import {
  hydrateProjectFontData,
  getProjectArchiveMetadata,
  getProjectArchiveRoundTripFormat,
  getProjectArchiveSourceFormat,
} from 'src/lib/projectArchive'
import { loadProjectDraft, saveProjectDraft } from 'src/lib/projectRepository'
import {
  loadUfoProject,
  saveUfoProject,
  saveUfoUiValue,
} from 'src/lib/ufoPersistence'
import { syncHotFontDataToUfoRecords } from 'src/lib/fontAdapters/ufo'
import type { FontData } from 'src/store'

export const UFO_LOCAL_DELETED_GLYPHS_KEY = 'ufo-local-deleted-glyph-ids'

export const saveDraftSnapshot = async (input: {
  projectId: string
  projectTitle: string
  fontData: FontData
  dirtyGlyphIds: string[]
  deletedGlyphIds: string[]
  selectedLayerId: string | null
}) => {
  const projectSourceFormat = getProjectArchiveSourceFormat()
  const projectRoundTripFormat = getProjectArchiveRoundTripFormat()

  if (projectRoundTripFormat === 'ufo') {
    const projectMetadata = getProjectArchiveMetadata() as {
      activeUfoId?: string | null
    } | null
    const activeUfoId = projectMetadata?.activeUfoId
    const activeLayerId = input.selectedLayerId ?? 'public.default'
    if (!activeUfoId) {
      throw new Error('找不到目前啟用的 UFO 字重')
    }

    await syncHotFontDataToUfoRecords({
      projectId: input.projectId,
      activeUfoId,
      activeLayerId,
      fontData: input.fontData,
      dirtyGlyphIds: input.dirtyGlyphIds,
      deletedGlyphIds: input.deletedGlyphIds,
    })

    const now = Date.now()
    const projectRecord = await loadUfoProject(input.projectId)
    if (projectRecord) {
      await saveUfoProject({
        ...projectRecord,
        updatedAt: now,
      })
    }
    const persistedProject = await loadProjectDraft(input.projectId)
    await saveProjectDraft({
      id: input.projectId,
      title: input.projectTitle,
      lastModified: now,
      createdAt: persistedProject?.createdAt ?? projectRecord?.createdAt ?? now,
      updatedAt: now,
      sourceName:
        persistedProject?.sourceName ?? projectRecord?.sourceFolderName ?? null,
      sourceType:
        persistedProject?.sourceType ?? projectRecord?.sourceType ?? 'local',
      githubSource:
        persistedProject?.githubSource ?? projectRecord?.githubSource ?? null,
      fontData: hydrateProjectFontData(input.fontData),
      projectMetadata: persistedProject?.projectMetadata ?? projectMetadata,
      projectSourceFormat,
      projectRoundTripFormat,
      projectGlyphsText: persistedProject?.projectGlyphsText ?? null,
      projectGlyphsDocument: persistedProject?.projectGlyphsDocument ?? null,
      projectGlyphsPackage: persistedProject?.projectGlyphsPackage ?? null,
    })
    await saveUfoUiValue(
      input.projectId,
      UFO_LOCAL_DELETED_GLYPHS_KEY,
      input.deletedGlyphIds
    )
    return
  }

  const persistedProject = await loadProjectDraft(input.projectId)
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
    fontData: hydrateProjectFontData(input.fontData),
    projectMetadata: persistedProject?.projectMetadata ?? null,
    projectSourceFormat,
    projectRoundTripFormat,
    projectGlyphsText: persistedProject?.projectGlyphsText ?? null,
    projectGlyphsDocument: persistedProject?.projectGlyphsDocument ?? null,
    projectGlyphsPackage: persistedProject?.projectGlyphsPackage ?? null,
  })
}
