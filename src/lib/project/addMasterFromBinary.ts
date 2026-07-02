import { buildMasterFromBinaryFont } from 'src/font/masterFromBinary'
import {
  listKumikoGlyphMetadataForProject,
  loadKumikoGlyphRecords,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecordBatch,
  saveKumikoProjectRecord,
} from 'src/lib/project/kumikoProjectPersistence'
import {
  glyphDataToKumikoGlyphRecord,
  kumikoGlyphRecordToGlyphData,
} from 'src/lib/project/kumikoFontDataAdapter'
import type { FontData, FontSource } from 'src/store'

const DEFAULT_BATCH_SIZE = 256

export interface AddMasterFromBinaryResult {
  source: FontSource
  matchedCount: number
  unmatchedGlyphIds: string[]
}

// Add a new master to a project by importing the outlines of a binary font.
// Runs against the canonical glyph records (not the in-memory store) so it is
// unaffected by geometry eviction: every glyph record carries full outlines,
// which avoids persisting stripped geometry for large (CJK) projects.
export const addMasterFromBinaryToProject = async (input: {
  projectId: string
  binaryFontData: Pick<FontData, 'glyphs'>
  source: FontSource
  now: number
  batchSize?: number
}): Promise<AddMasterFromBinaryResult> => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }

  project.sources = {
    ...(project.sources ?? {}),
    [input.source.id]: input.source,
  }
  project.updatedAt = input.now
  project.exportDirty = 1
  project.syncDirty = 1
  await saveKumikoProjectRecord(project)

  const metadata = await listKumikoGlyphMetadataForProject(input.projectId)
  const glyphIds = metadata.map((record) => record.glyphId)
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE
  let matchedCount = 0
  const unmatchedGlyphIds: string[] = []

  for (let index = 0; index < glyphIds.length; index += batchSize) {
    const batchIds = glyphIds.slice(index, index + batchSize)
    const records = await loadKumikoGlyphRecords(
      batchIds.map((glyphId) => makeKumikoGlyphKey(input.projectId, glyphId))
    )
    const glyphs = records.map(kumikoGlyphRecordToGlyphData)
    const result = buildMasterFromBinaryFont({
      glyphs,
      binaryFontData: input.binaryFontData,
      source: input.source,
    })
    matchedCount += result.matchedGlyphIds.length
    unmatchedGlyphIds.push(...result.unmatchedGlyphIds)

    const matchedSet = new Set(result.matchedGlyphIds)
    const changedRecords = result.glyphs
      .filter((glyph) => matchedSet.has(glyph.id))
      .map((glyph) =>
        glyphDataToKumikoGlyphRecord({
          projectId: input.projectId,
          glyph,
          updatedAt: input.now,
          exportDirty: true,
          syncDirty: true,
          projectOutlineType: project.settings?.outlineType,
        })
      )
    await saveKumikoGlyphRecordBatch(changedRecords)
  }

  return { source: input.source, matchedCount, unmatchedGlyphIds }
}
