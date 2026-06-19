import {
  deleteKumikoProjectRecord,
  loadKumikoGlyphRecord,
  loadKumikoGlyphRecords,
  listKumikoGlyphRecordsForProject,
  listKumikoProjectRecords,
  loadKumikoProjectRecord,
  loadKumikoUiValue,
  makeKumikoGlyphKey,
  replaceKumikoProjectData,
  saveKumikoUiValue,
  renameKumikoProjectRecord,
} from 'src/lib/project/kumikoProjectPersistence'
import {
  fontDataToKumikoGlyphRecords,
  fontDataToKumikoProjectRecord,
  kumikoGlyphRecordToGlyphData,
  kumikoRecordsToFontData,
} from 'src/lib/project/kumikoFontDataAdapter'
import { toProjectSummary } from 'src/lib/project/projectTypes'
import type {
  KumikoProjectDraft,
  KumikoProjectSummary,
} from 'src/lib/project/projectTypes'

const PROJECT_METADATA_UI_KEY = 'projectMetadata'
const GLYPHS_PACKAGE_UI_KEY = 'glyphsPackage'

export type ProjectDraft = KumikoProjectDraft

const getRoundTripFormat = (
  sourceFormat: NonNullable<
    Awaited<ReturnType<typeof loadKumikoProjectRecord>>
  >['sourceFormat']
) => (sourceFormat === 'ufo' || sourceFormat === 'designspace' ? 'ufo' : null)

const projectRecordToDraft = async (
  record: NonNullable<Awaited<ReturnType<typeof loadKumikoProjectRecord>>>,
  options: { metadataOnly?: boolean } = {}
): Promise<ProjectDraft> => {
  const glyphRecords = await listKumikoGlyphRecordsForProject(record.projectId)
  const fontData = kumikoRecordsToFontData(record, glyphRecords, options)
  return {
    id: record.projectId,
    title: record.title,
    lastModified: record.updatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceName: record.sourceName ?? null,
    sourceType: record.sourceType ?? 'local',
    githubSource: record.githubSource ?? null,
    fontData,
    projectMetadata: await loadKumikoUiValue<Record<string, unknown>>(
      record.projectId,
      PROJECT_METADATA_UI_KEY
    ),
    projectSourceData: record.sourceData ?? null,
    projectSourceFormat: record.sourceFormat ?? null,
    projectRoundTripFormat: getRoundTripFormat(record.sourceFormat),
    projectGlyphsPackage: await loadKumikoUiValue(
      record.projectId,
      GLYPHS_PACKAGE_UI_KEY
    ),
  }
}

export const listProjectSummaries = async () => {
  const projects = await listKumikoProjectRecords()
  return projects
    .map((project) =>
      toProjectSummary({
        id: project.projectId,
        title: project.title,
        lastModified: project.updatedAt,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        sourceName: project.sourceName ?? null,
        sourceType: project.sourceType ?? 'local',
        githubSource: project.githubSource ?? null,
        projectSourceFormat: project.sourceFormat ?? null,
        projectRoundTripFormat: getRoundTripFormat(project.sourceFormat),
      })
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export const loadProjectDraft = async (projectId: string) => {
  const record = await loadKumikoProjectRecord(projectId)
  return record ? projectRecordToDraft(record) : null
}

export const loadProjectDraftMetadata = async (projectId: string) => {
  const record = await loadKumikoProjectRecord(projectId)
  return record ? projectRecordToDraft(record, { metadataOnly: true }) : null
}

export const loadProjectGlyphGeometry = async (
  projectId: string,
  glyphId: string
) => {
  const record = await loadKumikoGlyphRecord(
    makeKumikoGlyphKey(projectId, glyphId)
  )
  return record ? kumikoGlyphRecordToGlyphData(record) : null
}

export const loadProjectGlyphGeometryClosure = async (
  projectId: string,
  glyphIds: string[],
  options: { loadedGlyphIds?: Iterable<string> } = {}
) => {
  const loadedGlyphIds = new Set(options.loadedGlyphIds ?? [])
  const queuedGlyphIds = new Set<string>()
  const result: ReturnType<typeof kumikoGlyphRecordToGlyphData>[] = []
  let batchGlyphIds = [...new Set(glyphIds)].filter(
    (glyphId) => !loadedGlyphIds.has(glyphId)
  )

  while (batchGlyphIds.length > 0) {
    batchGlyphIds.forEach((glyphId) => queuedGlyphIds.add(glyphId))
    const records = await loadKumikoGlyphRecords(
      batchGlyphIds.map((glyphId) => makeKumikoGlyphKey(projectId, glyphId))
    )
    const nextBatchGlyphIds = new Set<string>()

    for (const record of records) {
      queuedGlyphIds.delete(record.glyphId)
      if (loadedGlyphIds.has(record.glyphId)) {
        continue
      }

      loadedGlyphIds.add(record.glyphId)
      result.push(kumikoGlyphRecordToGlyphData(record))
      for (const componentGlyphId of record.componentGlyphIds) {
        if (
          !loadedGlyphIds.has(componentGlyphId) &&
          !queuedGlyphIds.has(componentGlyphId)
        ) {
          nextBatchGlyphIds.add(componentGlyphId)
        }
      }
    }

    batchGlyphIds = [...nextBatchGlyphIds]
  }

  return result
}

export const loadProjectDraftSummary = async (projectId: string) => {
  const record = await loadKumikoProjectRecord(projectId)
  if (!record) {
    return null
  }
  return toProjectSummary({
    id: record.projectId,
    title: record.title,
    lastModified: record.updatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceName: record.sourceName ?? null,
    sourceType: record.sourceType ?? 'local',
    githubSource: record.githubSource ?? null,
    projectSourceFormat: record.sourceFormat ?? null,
    projectRoundTripFormat: getRoundTripFormat(record.sourceFormat),
  })
}

export const saveProjectDraft = async (draft: ProjectDraft) => {
  if (!draft.fontData) {
    throw new Error('Cannot save a Kumiko project without font data.')
  }

  const updatedAt = draft.updatedAt ?? draft.lastModified
  const project = fontDataToKumikoProjectRecord({
    projectId: draft.id,
    title: draft.title,
    fontData: draft.fontData,
    createdAt: draft.createdAt ?? updatedAt,
    updatedAt,
    sourceName: draft.sourceName ?? null,
    sourceType: draft.sourceType ?? 'local',
    sourceFormat: draft.projectSourceFormat ?? null,
    githubSource: draft.githubSource ?? null,
    sourceData: draft.projectSourceData ?? undefined,
    exportDirty: draft.projectExportDirty ?? false,
    syncDirty: draft.projectSyncDirty ?? false,
  })
  const glyphs = fontDataToKumikoGlyphRecords({
    projectId: draft.id,
    fontData: draft.fontData,
    updatedAt,
    exportDirtyGlyphIds: draft.exportDirtyGlyphIds ?? [],
    syncDirtyGlyphIds: draft.syncDirtyGlyphIds ?? [],
  })

  await replaceKumikoProjectData(project, glyphs)
  await saveKumikoUiValue(
    draft.id,
    PROJECT_METADATA_UI_KEY,
    draft.projectMetadata ?? null
  )
  await saveKumikoUiValue(
    draft.id,
    GLYPHS_PACKAGE_UI_KEY,
    draft.projectGlyphsPackage ?? null
  )
  return toProjectSummary(draft)
}

export const renameKumikoProject = async (projectId: string, title: string) => {
  await renameKumikoProjectRecord(projectId, title)
  return loadProjectDraftSummary(projectId)
}

export const deleteKumikoProject = async (projectId: string) => {
  await deleteKumikoProjectRecord(projectId)
}

export type { KumikoProjectDraft, KumikoProjectSummary }
