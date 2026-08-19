import {
  isUfoBackgroundLayer,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontFormats/adapters/ufo'
import { buildUfoFontLevelFiles } from 'src/lib/fontFormats/ufoFontLevelFiles'
import { hashString } from 'src/lib/hash'
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

export interface MaterializeUfoTreeOptions {
  projectId: string
  // Collects the export-clean bookkeeping the caller may want to persist.
  onExportState?: (update: KumikoUfoExportStateUpdate) => void
  // Reported once the manifest is known, before any file is yielded, so callers
  // can show a real progress total rather than inferring one.
  onTotal?: (totalGlyphs: number) => void
}

// The single projection from canonical Kumiko records to UFO source files.
// Zip export, GitHub commits and (later) the git worktree all read this stream
// so the three can never disagree on what a project's file tree looks like.
export async function* materializeUfoTree(
  options: MaterializeUfoTreeOptions
): AsyncGenerator<MaterializedFile> {
  const manifest = await buildKumikoUfoExportManifest(options.projectId)
  options.onTotal?.(manifest.totalGlyphs)

  if (manifest.designspace) {
    yield {
      path: manifest.designspace.relativePath,
      text: manifest.designspace.text,
      entity: { kind: 'font', part: 'designspace' },
      countsTowardTotal: false,
    }
  }

  for (const ufo of manifest.ufos) {
    const metadata = ufo.metadata

    for (const file of buildUfoFontLevelFiles(metadata)) {
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
          text: serializeXmlPlist({}),
          entity: { kind: 'font', part: 'order' },
          countsTowardTotal: false,
        }
        continue
      }

      const writtenContents: Record<string, string> = {}

      for (
        let start = 0;
        start < ufo.glyphIds.length;
        start += GLYPH_LOAD_BATCH_SIZE
      ) {
        const glyphs = await loadKumikoUfoExportGlyphBatch({
          project: manifest.project,
          activeUfoId: metadata.ufoId,
          source: ufo.source,
          contents: ufo.contents,
          glyphIds: ufo.glyphIds.slice(start, start + GLYPH_LOAD_BATCH_SIZE),
          targetLayer: layer,
        })

        for (const glyph of glyphs) {
          const text = serializeGlifRecord(glyph)
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

      if (isDefaultLayer && (ufo.extraGlyphs?.length ?? 0) > 0) {
        const extraGlyphs = await loadKumikoUfoExportExtraGlyphBatch({
          project: manifest.project,
          activeUfoId: metadata.ufoId,
          source: ufo.source,
          extraGlyphs: ufo.extraGlyphs ?? [],
          targetLayer: layer,
        })

        for (const glyph of extraGlyphs) {
          writtenContents[glyph.glyphName] = glyph.fileName
          yield {
            path: joinPath(layerDir, glyph.fileName),
            text: serializeGlifRecord(glyph),
            entity: { kind: 'glyph', name: glyph.glyphName },
            countsTowardTotal: true,
          }
        }
      }

      yield {
        path: joinPath(layerDir, 'contents.plist'),
        text: serializeXmlPlist(writtenContents),
        entity: { kind: 'font', part: 'order' },
        countsTowardTotal: false,
      }
    }
  }
}
