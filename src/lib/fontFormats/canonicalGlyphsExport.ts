import {
  serializeGlyphsFileFromGlyphBatchesToBlob,
  type GlyphsBatchSerializeResult,
  type GlyphsFormatVersion,
} from '@/lib/fontFormats/glyphsExport'
import {
  createGlyphsPackageDataFromGlyphBatches,
  type GlyphsPackageBatchResult,
} from '@/lib/fontFormats/glyphsPackage'
import {
  kumikoGlyphRecordToGlyphData,
  kumikoRecordsToFontData,
} from '@/lib/project/kumikoFontDataAdapter'
import {
  listKumikoGlyphMetadataForProject,
  loadKumikoGlyphRecords,
  loadKumikoProjectRecord,
  loadKumikoUiValue,
  makeKumikoGlyphKey,
} from '@/lib/project/kumikoProjectPersistence'
import {
  GLYPHS_PACKAGE_UI_KEY,
  PROJECT_METADATA_UI_KEY,
} from '@/lib/project/projectRepository'
import type { FontData, GlyphData } from '@/store'

const GLYPHS_EXPORT_BATCH_SIZE = 128

const getOrderedGlyphIds = async (projectId: string, glyphOrder: string[]) => {
  const metadataRecords = await listKumikoGlyphMetadataForProject(projectId)
  const metadataByGlyphId = new Map(
    metadataRecords.map((record) => [record.glyphId, record])
  )
  const orderedGlyphIds = new Set(glyphOrder)
  return [
    ...glyphOrder.filter((glyphId) => metadataByGlyphId.has(glyphId)),
    ...metadataRecords
      .map((record) => record.glyphId)
      .filter((glyphId) => !orderedGlyphIds.has(glyphId)),
  ]
}

const createGlyphBatchLoader = (
  projectId: string,
  glyphIds: string[],
  batchSize = GLYPHS_EXPORT_BATCH_SIZE
): AsyncIterable<GlyphData[]> => ({
  async *[Symbol.asyncIterator]() {
    for (let index = 0; index < glyphIds.length; index += batchSize) {
      const batchGlyphIds = glyphIds.slice(index, index + batchSize)
      const records = await loadKumikoGlyphRecords(
        batchGlyphIds.map((glyphId) => makeKumikoGlyphKey(projectId, glyphId))
      )
      const recordsByGlyphId = new Map(
        records.map((record) => [record.glyphId, record])
      )
      yield batchGlyphIds
        .map((glyphId) => recordsByGlyphId.get(glyphId))
        .filter((record): record is NonNullable<typeof record> =>
          Boolean(record)
        )
        .map(kumikoGlyphRecordToGlyphData)
    }
  },
})

const loadCanonicalGlyphsExportState = async (
  projectId: string
): Promise<{
  baseFontData: FontData
  projectMetadata: Record<string, unknown> | null
  glyphIds: string[]
}> => {
  const project = await loadKumikoProjectRecord(projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }

  const [projectMetadata, glyphIds] = await Promise.all([
    loadKumikoUiValue<Record<string, unknown>>(
      project.projectId,
      PROJECT_METADATA_UI_KEY
    ),
    getOrderedGlyphIds(project.projectId, project.glyphOrder),
  ])

  return {
    baseFontData: kumikoRecordsToFontData(project, [], { metadataOnly: true }),
    projectMetadata,
    glyphIds,
  }
}

export const serializeCanonicalGlyphsProjectToBlob = async (input: {
  projectId: string
  formatVersion: GlyphsFormatVersion
  batchSize?: number
}): Promise<GlyphsBatchSerializeResult> => {
  const { baseFontData, projectMetadata, glyphIds } =
    await loadCanonicalGlyphsExportState(input.projectId)

  return serializeGlyphsFileFromGlyphBatchesToBlob({
    baseFontData,
    projectMetadata,
    glyphBatches: createGlyphBatchLoader(
      input.projectId,
      glyphIds,
      input.batchSize
    ),
    formatVersionOverride: input.formatVersion,
  })
}

export const createCanonicalGlyphsPackageData = async (input: {
  projectId: string
  batchSize?: number
}): Promise<GlyphsPackageBatchResult> => {
  const { baseFontData, projectMetadata, glyphIds } =
    await loadCanonicalGlyphsExportState(input.projectId)
  const packageData = await loadKumikoUiValue<{ packageName?: string | null }>(
    input.projectId,
    GLYPHS_PACKAGE_UI_KEY
  )

  return createGlyphsPackageDataFromGlyphBatches({
    baseFontData,
    projectMetadata,
    glyphBatches: createGlyphBatchLoader(
      input.projectId,
      glyphIds,
      input.batchSize
    ),
    packageName: packageData?.packageName,
  })
}
