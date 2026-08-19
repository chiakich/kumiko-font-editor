import {
  createBaseGlyphsDocument,
  createGlyphsRecordFromFontDataGlyph,
  serializeOpenStepValue,
} from 'src/lib/fontFormats/glyphsExport'
import { sanitizeGlyphsPackageFileName } from 'src/lib/fontFormats/glyphsPackage'
import {
  listKumikoGlyphMetadataForProject,
  listSyncDirtyKumikoGlyphIds,
  loadKumikoGlyphRecords,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
} from 'src/lib/project/kumikoProjectPersistence'
import {
  kumikoGlyphRecordToGlyphData,
  kumikoRecordsToFontData,
} from 'src/lib/project/kumikoFontDataAdapter'
import type {
  MaterializedFile,
  MaterializeOptions,
} from 'src/lib/fontFormats/formatAdapter/types'

const GLYPH_LOAD_BATCH_SIZE = 128

const joinPath = (...parts: Array<string | null | undefined>) =>
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')

const packageRootFor = (title: string, projectId: string) => {
  const name = (title || projectId).trim() || projectId
  return name.toLowerCase().endsWith('.glyphspackage')
    ? name
    : `${name}.glyphspackage`
}

// glyphName → file name, decided once so materialize and listPaths agree and a
// partial rebuild writes the same path a full one would.
const buildPackageFileNames = (glyphIds: readonly string[]) => {
  const used = new Set<string>()
  const byGlyphId = new Map<string, string>()
  for (const glyphId of glyphIds) {
    byGlyphId.set(glyphId, sanitizeGlyphsPackageFileName(glyphId, used))
  }
  return byGlyphId
}

const loadPackageContext = async (projectId: string) => {
  const project = await loadKumikoProjectRecord(projectId)
  if (!project) {
    throw new Error('找不到 Kumiko 專案')
  }
  const metadata = await listKumikoGlyphMetadataForProject(projectId)
  const ordered = new Set(project.glyphOrder)
  const glyphIds = [
    ...project.glyphOrder.filter((glyphId) =>
      metadata.some((glyph) => glyph.glyphId === glyphId)
    ),
    ...metadata
      .map((glyph) => glyph.glyphId)
      .filter((glyphId) => !ordered.has(glyphId)),
  ]
  return {
    project,
    glyphIds,
    root: packageRootFor(project.title, project.projectId),
    fileNames: buildPackageFileNames(glyphIds),
  }
}

// The .glyphspackage projection: one .glyph file per glyph holding every
// master, plus fontinfo.plist and order.plist at the package root.
export async function* materializeGlyphsPackage(
  options: MaterializeOptions
): AsyncGenerator<MaterializedFile> {
  const { project, glyphIds, root, fileNames } = await loadPackageContext(
    options.projectId
  )
  const scope = options.scope ?? 'all'
  const dirtyGlyphIds =
    scope === 'dirty'
      ? new Set(await listSyncDirtyKumikoGlyphIds(options.projectId))
      : null
  const scopedGlyphIds = dirtyGlyphIds
    ? glyphIds.filter((glyphId) => dirtyGlyphIds.has(glyphId))
    : glyphIds

  options.onTotal?.(scopedGlyphIds.length)

  // Font-level fields only; glyph geometry is streamed separately below.
  const fontData = kumikoRecordsToFontData(project, [])
  const includeFontLevel = scope === 'all' || project.syncDirty === 1

  if (includeFontLevel) {
    const document = createBaseGlyphsDocument(fontData, null)
    document['.formatVersion'] = 3
    const fontInfoDocument = { ...document }
    delete fontInfoDocument.glyphs
    yield {
      path: joinPath(root, 'fontinfo.plist'),
      text: `${serializeOpenStepValue(fontInfoDocument)}\n`,
      entity: { kind: 'font', part: 'info' },
      countsTowardTotal: false,
    }
  }

  for (
    let start = 0;
    start < scopedGlyphIds.length;
    start += GLYPH_LOAD_BATCH_SIZE
  ) {
    const batchIds = scopedGlyphIds.slice(start, start + GLYPH_LOAD_BATCH_SIZE)
    const records = await loadKumikoGlyphRecords(
      batchIds.map((glyphId) => makeKumikoGlyphKey(options.projectId, glyphId))
    )
    for (const record of records) {
      const fileName = fileNames.get(record.glyphId)
      if (!fileName) {
        continue
      }
      const glyphRecord = createGlyphsRecordFromFontDataGlyph(
        undefined,
        kumikoGlyphRecordToGlyphData(record),
        3
      )
      yield {
        path: joinPath(root, 'glyphs', fileName),
        text: `${serializeOpenStepValue(glyphRecord)}\n`,
        entity: { kind: 'glyph', name: record.glyphId },
        countsTowardTotal: true,
      }
    }
  }

  // The order file always lists every live glyph: a partial rebuild must not
  // shrink it to whatever happened to be dirty.
  yield {
    path: joinPath(root, 'order.plist'),
    text: `${serializeOpenStepValue(glyphIds)}\n`,
    entity: { kind: 'font', part: 'order' },
    countsTowardTotal: false,
  }
}

export const listGlyphsPackagePaths = async (projectId: string) => {
  const { glyphIds, root, fileNames } = await loadPackageContext(projectId)
  return [
    joinPath(root, 'fontinfo.plist'),
    joinPath(root, 'order.plist'),
    ...glyphIds
      .map((glyphId) => fileNames.get(glyphId))
      .filter((fileName): fileName is string => Boolean(fileName))
      .map((fileName) => joinPath(root, 'glyphs', fileName)),
  ]
}
