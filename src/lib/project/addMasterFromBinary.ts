import {
  buildImportedMasterLayer,
  buildNewGlyphFromImported,
  createImportedGlyphIndex,
} from 'src/font/masterFromBinary'
import {
  buildCopiedMasterLayer,
  buildEmptyMasterLayer,
} from 'src/font/masterLayerBuilders'
import { getGlyphMasterLayerForSource } from 'src/font/designspaceLocation'
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
import type { FontData, FontSource, GlyphData, GlyphLayerData } from 'src/store'

const DEFAULT_BATCH_SIZE = 256

export type AddMasterMethod = 'font' | 'empty' | 'copy'

export interface AddMasterOptions {
  projectId: string
  source: FontSource
  now: number
  batchSize?: number
  method: AddMasterMethod
  // method 'font': imported glyphs to match, and whether to create project
  // glyphs for imported glyphs that have no match.
  importedGlyphs?: Record<string, GlyphData>
  createNewGlyphs?: boolean
  // method 'empty' | 'copy': the existing master to derive from.
  baseSourceId?: string
  // method 'copy': outline offset distance in font units.
  offsetDistance?: number
}

export interface AddMasterResult {
  source: FontSource
  matchedCount: number
  unmatchedGlyphIds: string[]
  createdGlyphs: GlyphData[]
}

// Build the new master's layer for one glyph per the chosen method, or undefined
// to leave the glyph sparse at the new master.
const deriveMasterLayer = (
  glyph: GlyphData,
  options: AddMasterOptions,
  index: ReturnType<typeof createImportedGlyphIndex> | null,
  used: Set<GlyphData>
): GlyphLayerData | undefined => {
  if (options.method === 'font') {
    const imported = index?.resolve(glyph)
    if (!imported) {
      return undefined
    }
    used.add(imported)
    return buildImportedMasterLayer(options.source, imported)
  }
  const base = options.baseSourceId
    ? getGlyphMasterLayerForSource(glyph, options.baseSourceId)
    : null
  if (!base) {
    return undefined
  }
  return options.method === 'copy'
    ? buildCopiedMasterLayer(options.source, base, options.offsetDistance ?? 0)
    : buildEmptyMasterLayer(options.source, base)
}

// Add a new master to a project. Runs against canonical glyph records (not the
// in-memory store) so it is unaffected by geometry eviction.
export const addMasterToProject = async (
  options: AddMasterOptions
): Promise<AddMasterResult> => {
  const project = await loadKumikoProjectRecord(options.projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }

  const existingSources = Object.values(project.sources ?? {})
  project.sources = {
    ...(project.sources ?? {}),
    [options.source.id]: options.source,
  }
  project.updatedAt = options.now
  project.exportDirty = 1
  project.syncDirty = 1

  const index =
    options.method === 'font' && options.importedGlyphs
      ? createImportedGlyphIndex(options.importedGlyphs)
      : null
  const usedImported = new Set<GlyphData>()

  const metadata = await listKumikoGlyphMetadataForProject(options.projectId)
  const glyphIds = metadata.map((record) => record.glyphId)
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
  let matchedCount = 0
  const unmatchedGlyphIds: string[] = []

  const toRecord = (glyph: GlyphData) =>
    glyphDataToKumikoGlyphRecord({
      projectId: options.projectId,
      glyph,
      updatedAt: options.now,
      exportDirty: true,
      syncDirty: true,
      projectOutlineType: project.settings?.outlineType,
    })

  for (let index2 = 0; index2 < glyphIds.length; index2 += batchSize) {
    const batchIds = glyphIds.slice(index2, index2 + batchSize)
    const records = await loadKumikoGlyphRecords(
      batchIds.map((glyphId) => makeKumikoGlyphKey(options.projectId, glyphId))
    )
    const changed: GlyphData[] = []
    for (const record of records) {
      const glyph = kumikoGlyphRecordToGlyphData(record)
      const layer = deriveMasterLayer(glyph, options, index, usedImported)
      if (!layer) {
        unmatchedGlyphIds.push(glyph.id)
        continue
      }
      matchedCount += 1
      changed.push({
        ...glyph,
        layers: { ...glyph.layers, [options.source.id]: layer },
        layerOrder: glyph.layerOrder?.includes(options.source.id)
          ? glyph.layerOrder
          : [
              ...(glyph.layerOrder ?? Object.keys(glyph.layers ?? {})),
              options.source.id,
            ],
      })
    }
    await saveKumikoGlyphRecordBatch(changed.map(toRecord))
  }

  const createdGlyphs: GlyphData[] = []
  if (options.method === 'font' && options.createNewGlyphs && index) {
    const extras = Object.values(options.importedGlyphs ?? {}).filter(
      (imported) => !usedImported.has(imported)
    )
    for (const imported of extras) {
      const newGlyph = buildNewGlyphFromImported(
        imported,
        options.source,
        existingSources
      )
      createdGlyphs.push(newGlyph)
      project.glyphOrder = [...(project.glyphOrder ?? []), newGlyph.id]
    }
    await saveKumikoGlyphRecordBatch(createdGlyphs.map(toRecord))
  }

  await saveKumikoProjectRecord(project)

  return {
    source: options.source,
    matchedCount,
    unmatchedGlyphIds,
    createdGlyphs,
  }
}

// Backwards-compatible wrapper for importing a binary font as a master.
export const addMasterFromBinaryToProject = async (input: {
  projectId: string
  binaryFontData: Pick<FontData, 'glyphs'>
  source: FontSource
  now: number
  batchSize?: number
}): Promise<{
  source: FontSource
  matchedCount: number
  unmatchedGlyphIds: string[]
}> => {
  const result = await addMasterToProject({
    projectId: input.projectId,
    source: input.source,
    now: input.now,
    batchSize: input.batchSize,
    method: 'font',
    importedGlyphs: input.binaryFontData.glyphs ?? {},
    createNewGlyphs: false,
  })
  return {
    source: result.source,
    matchedCount: result.matchedCount,
    unmatchedGlyphIds: result.unmatchedGlyphIds,
  }
}
