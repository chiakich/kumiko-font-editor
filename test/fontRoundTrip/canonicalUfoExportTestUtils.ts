import { strToU8, zipSync } from 'fflate'
import {
  isUfoBackgroundLayer,
  serializeGlifRecord,
  serializeXmlPlist,
} from '@/lib/fontFormats/ufoFormat'
import {
  buildKumikoUfoExportManifest,
  loadKumikoUfoExportExtraGlyphBatch,
  loadKumikoUfoExportGlyphBatch,
} from '@/lib/github/sync/kumikoUfoSync'
import { saveProjectDraft } from '@/lib/project/projectRepository'
import type { KumikoProjectDraft } from '@/lib/project/projectTypes'
import type { FontData } from '@/domain'

const joinRepoPath = (...parts: string[]) =>
  parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')

const putText = (
  files: Record<string, Uint8Array>,
  path: string,
  text: string
) => {
  files[path] = strToU8(text)
}

export const exportCanonicalFontDataAsUfoZip = async (input: {
  fontData: FontData
  projectId: string
  projectTitle: string
  projectSourceData?: KumikoProjectDraft['projectSourceData']
  projectSourceFormat?: KumikoProjectDraft['projectSourceFormat']
}) => {
  await saveProjectDraft({
    id: input.projectId,
    title: input.projectTitle,
    lastModified: 2,
    createdAt: 1,
    updatedAt: 2,
    sourceName: input.projectTitle,
    sourceType: 'local',
    githubSource: null,
    fontData: input.fontData,
    projectMetadata: null,
    projectSourceData: input.projectSourceData ?? null,
    projectSourceFormat: input.projectSourceFormat ?? null,
    projectRoundTripFormat: null,
    projectGlyphsPackage: null,
  })

  const manifest = await buildKumikoUfoExportManifest(input.projectId)
  const files: Record<string, Uint8Array> = {}

  if (manifest.designspace) {
    putText(files, manifest.designspace.relativePath, manifest.designspace.text)
  }

  for (const ufo of manifest.ufos) {
    const metadata = ufo.metadata
    putText(
      files,
      joinRepoPath(metadata.relativePath, 'metainfo.plist'),
      serializeXmlPlist({
        creator: metadata.metainfo?.creator ?? 'org.kumiko.fonteditor',
        formatVersion: metadata.metainfo?.formatVersion ?? 3,
        formatVersionMinor: metadata.metainfo?.formatVersionMinor ?? 0,
      })
    )
    putText(
      files,
      joinRepoPath(metadata.relativePath, 'fontinfo.plist'),
      serializeXmlPlist(metadata.fontinfo ?? {})
    )
    putText(
      files,
      joinRepoPath(metadata.relativePath, 'lib.plist'),
      serializeXmlPlist(metadata.lib ?? {})
    )
    putText(
      files,
      joinRepoPath(metadata.relativePath, 'groups.plist'),
      serializeXmlPlist(metadata.groups ?? {})
    )
    putText(
      files,
      joinRepoPath(metadata.relativePath, 'kerning.plist'),
      serializeXmlPlist(metadata.kerning ?? {})
    )
    putText(
      files,
      joinRepoPath(metadata.relativePath, 'layercontents.plist'),
      serializeXmlPlist(
        metadata.layers.map((layer) => [layer.layerId, layer.glyphDir])
      )
    )
    if (metadata.featuresText !== null) {
      putText(
        files,
        joinRepoPath(metadata.relativePath, 'features.fea'),
        metadata.featuresText
      )
    }

    for (const layer of metadata.layers) {
      const isDefaultLayer = layer.layerId === ufo.defaultLayer.layerId
      const isBackgroundLayer = isUfoBackgroundLayer(layer, ufo.defaultLayer)
      const writtenContents: Record<string, string> = {}
      if (isDefaultLayer || isBackgroundLayer) {
        const glyphs = await loadKumikoUfoExportGlyphBatch({
          project: manifest.project,
          activeUfoId: metadata.ufoId,
          source: ufo.source,
          contents: ufo.contents,
          glyphIds: ufo.glyphIds,
          targetLayer: layer,
        })
        const extraGlyphs = isDefaultLayer
          ? await loadKumikoUfoExportExtraGlyphBatch({
              project: manifest.project,
              activeUfoId: metadata.ufoId,
              source: ufo.source,
              extraGlyphs: ufo.extraGlyphs ?? [],
              targetLayer: layer,
            })
          : []

        for (const glyph of [...glyphs, ...extraGlyphs]) {
          putText(
            files,
            joinRepoPath(metadata.relativePath, layer.glyphDir, glyph.fileName),
            serializeGlifRecord(glyph)
          )
          writtenContents[glyph.glyphName] = glyph.fileName
        }
      }

      putText(
        files,
        joinRepoPath(metadata.relativePath, layer.glyphDir, 'contents.plist'),
        serializeXmlPlist(writtenContents)
      )
    }
  }

  const zipBytes = zipSync(files)
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBuffer).set(zipBytes)
  return new Blob([zipBuffer], { type: 'application/zip' })
}
