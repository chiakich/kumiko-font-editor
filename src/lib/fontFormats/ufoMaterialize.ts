import {
  isUfoBackgroundLayer,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontFormats/adapters/ufo'
import { buildUfoFontLevelFiles } from 'src/lib/fontFormats/ufoFontLevelFiles'
import { hashString } from 'src/lib/hash'
import { listSyncDirtyKumikoGlyphIds } from 'src/lib/project/kumikoProjectPersistence'
import {
  buildKumikoUfoExportManifest,
  loadKumikoUfoExportExtraGlyphBatch,
  loadKumikoUfoExportGlyphBatch,
  type KumikoUfoExportStateUpdate,
} from 'src/lib/github/sync/kumikoUfoSync'
import type { EntityId } from 'src/lib/fontFormats/formatAdapter/types'

export interface MaterializedFile {
  // Repo-relative path, identical to what the source tree holds on disk.
  path: string
  text: string
  entity: EntityId
  // Mirrors the manifest's totalGlyphs accounting so callers can drive a
  // progress bar without re-deriving which writes are user-visible work.
  countsTowardTotal: boolean
}

const GLYPH_LOAD_BATCH_SIZE = 128

const joinPath = (...parts: Array<string | null | undefined>) =>
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')

export type MaterializeScope = 'all' | 'dirty'

export interface MaterializeUfoTreeOptions {
  projectId: string
  // 'all' rebuilds the whole tree. 'dirty' emits only the glyphs marked sync
  // dirty, plus the font-level files when the project itself changed — the
  // difference between touching one file and touching thirty thousand.
  scope?: MaterializeScope
  // Collects the export-clean bookkeeping the caller may want to persist.
  onExportState?: (update: KumikoUfoExportStateUpdate) => void
  // Reported once the manifest is known, before any file is yielded, so callers
  // can show a real progress total rather than inferring one.
  onTotal?: (totalGlyphs: number) => void
}

// Every path the project would write, without loading any glyph geometry. Used
// to spot files that must be deleted when only part of the tree is rebuilt.
export const listUfoTreePaths = async (projectId: string) => {
  const manifest = await buildKumikoUfoExportManifest(projectId)
  const paths: string[] = []

  if (manifest.designspace) {
    paths.push(manifest.designspace.relativePath)
  }

  for (const ufo of manifest.ufos) {
    const metadata = ufo.metadata
    for (const file of buildUfoFontLevelFiles(metadata)) {
      paths.push(joinPath(metadata.relativePath, file.path))
    }
    for (const layer of metadata.layers) {
      const layerDir = joinPath(metadata.relativePath, layer.glyphDir)
      paths.push(joinPath(layerDir, 'contents.plist'))
      const isDefaultLayer = layer.layerId === ufo.defaultLayer.layerId
      const isBackgroundLayer = isUfoBackgroundLayer(layer, ufo.defaultLayer)
      if (!isDefaultLayer && !isBackgroundLayer) {
        continue
      }
      for (const glyphId of ufo.glyphIds) {
        const fileName = ufo.contents[glyphId]
        if (fileName) {
          paths.push(joinPath(layerDir, fileName))
        }
      }
      for (const extra of ufo.extraGlyphs ?? []) {
        paths.push(joinPath(layerDir, extra.fileName))
      }
    }
  }

  return paths
}

// The single projection from canonical Kumiko records to UFO source files.
// Zip export, GitHub commits and (later) the git worktree all read this stream
// so the three can never disagree on what a project's file tree looks like.
export async function* materializeUfoTree(
  options: MaterializeUfoTreeOptions
): AsyncGenerator<MaterializedFile> {
  const manifest = await buildKumikoUfoExportManifest(options.projectId)
  const scope = options.scope ?? 'all'
  // Only geometry loads are expensive; the dirty set comes from an index scan.
  const dirtyGlyphIds =
    scope === 'dirty'
      ? new Set(await listSyncDirtyKumikoGlyphIds(options.projectId))
      : null
  const includeFontLevel = scope === 'all' || manifest.project.syncDirty === 1

  const glyphIdsFor = (ufo: (typeof manifest.ufos)[number]) =>
    dirtyGlyphIds
      ? ufo.glyphIds.filter((glyphId) => dirtyGlyphIds.has(glyphId))
      : ufo.glyphIds

  options.onTotal?.(
    dirtyGlyphIds
      ? manifest.ufos.reduce((sum, ufo) => sum + glyphIdsFor(ufo).length, 0)
      : manifest.totalGlyphs
  )

  if (manifest.designspace && includeFontLevel) {
    yield {
      path: manifest.designspace.relativePath,
      text: manifest.designspace.text,
      entity: { kind: 'font', part: 'designspace' },
      countsTowardTotal: false,
    }
  }

  for (const ufo of manifest.ufos) {
    const metadata = ufo.metadata

    for (const file of includeFontLevel
      ? buildUfoFontLevelFiles(metadata)
      : []) {
      yield {
        path: joinPath(metadata.relativePath, file.path),
        text: file.text,
        entity:
          file.path === 'groups.plist' || file.path === 'kerning.plist'
            ? { kind: 'font', part: 'kerning' }
            : file.path === 'features.fea'
              ? { kind: 'font', part: 'features' }
              : { kind: 'font', part: 'info' },
        countsTowardTotal: false,
      }
    }

    for (const layer of metadata.layers) {
      const layerDir = joinPath(metadata.relativePath, layer.glyphDir)
      const isDefaultLayer = layer.layerId === ufo.defaultLayer.layerId
      const isBackgroundLayer = isUfoBackgroundLayer(layer, ufo.defaultLayer)

      // Layers Kumiko does not project still need a contents.plist so the UFO
      // stays spec-valid.
      if (!isDefaultLayer && !isBackgroundLayer) {
        yield {
          path: joinPath(layerDir, 'contents.plist'),
          text: serializeXmlPlist({}, metadata.textStyle),
          entity: { kind: 'font', part: 'order' },
          countsTowardTotal: false,
        }
        continue
      }

      const writtenContents: Record<string, string> = {}
      const layerGlyphIds = glyphIdsFor(ufo)

      for (
        let start = 0;
        start < layerGlyphIds.length;
        start += GLYPH_LOAD_BATCH_SIZE
      ) {
        const glyphs = await loadKumikoUfoExportGlyphBatch({
          project: manifest.project,
          activeUfoId: metadata.ufoId,
          source: ufo.source,
          contents: ufo.contents,
          glyphIds: layerGlyphIds.slice(start, start + GLYPH_LOAD_BATCH_SIZE),
          targetLayer: layer,
        })

        for (const glyph of glyphs) {
          const text = serializeGlifRecord(glyph, metadata.textStyle)
          writtenContents[glyph.glyphName] = glyph.fileName
          if (isDefaultLayer) {
            options.onExportState?.({
              activeUfoId: glyph.ufoId,
              glyphId: glyph.glyphName,
              fileName: glyph.fileName,
              sourceHash: hashString(text),
            })
          }
          yield {
            path: joinPath(layerDir, glyph.fileName),
            text,
            entity: { kind: 'glyph', name: glyph.glyphName },
            countsTowardTotal: isDefaultLayer,
          }
        }
      }

      const scopedExtras = (ufo.extraGlyphs ?? []).filter(
        (extra) => !dirtyGlyphIds || dirtyGlyphIds.has(extra.glyphId)
      )
      if (isDefaultLayer && scopedExtras.length > 0) {
        const extraGlyphs = await loadKumikoUfoExportExtraGlyphBatch({
          project: manifest.project,
          activeUfoId: metadata.ufoId,
          source: ufo.source,
          extraGlyphs: scopedExtras,
          targetLayer: layer,
        })

        for (const glyph of extraGlyphs) {
          writtenContents[glyph.glyphName] = glyph.fileName
          yield {
            path: joinPath(layerDir, glyph.fileName),
            text: serializeGlifRecord(glyph, metadata.textStyle),
            entity: { kind: 'glyph', name: glyph.glyphName },
            countsTowardTotal: true,
          }
        }
      }

      // The listing always covers every live glyph: a partial rebuild must not
      // shrink it to whatever happened to be dirty.
      const fullContents = dirtyGlyphIds
        ? Object.fromEntries(
            ufo.glyphIds
              .map((glyphId) => [glyphId, ufo.contents[glyphId]] as const)
              .filter((entry): entry is readonly [string, string] => !!entry[1])
              .concat(
                (ufo.extraGlyphs ?? []).map(
                  (extra) => [extra.glyphName, extra.fileName] as const
                )
              )
          )
        : writtenContents
      yield {
        path: joinPath(layerDir, 'contents.plist'),
        text: serializeXmlPlist(fullContents, metadata.textStyle),
        entity: { kind: 'font', part: 'order' },
        countsTowardTotal: false,
      }
    }
  }
}
