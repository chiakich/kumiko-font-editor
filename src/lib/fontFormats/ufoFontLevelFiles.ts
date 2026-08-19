import { serializeXmlPlist } from 'src/lib/fontFormats/adapters/ufo'
import type { UfoMetadataRecord } from 'src/lib/fontFormats/ufoTypes'

export interface UfoFontLevelFile {
  /** Path relative to the UFO directory. */
  path: string
  text: string
}

const DEFAULT_METAINFO_CREATOR = 'org.kumiko.fonteditor'
const DEFAULT_UFO_FORMAT_VERSION = 3

// The single source of truth for which font-level files a UFO carries, shared by
// zip export and GitHub commits so the two can never drift apart again.
export const buildUfoFontLevelFiles = (
  metadata: Pick<
    UfoMetadataRecord,
    | 'metainfo'
    | 'fontinfo'
    | 'lib'
    | 'groups'
    | 'kerning'
    | 'featuresText'
    | 'layers'
  >
): UfoFontLevelFile[] => {
  const files: UfoFontLevelFile[] = [
    {
      path: 'metainfo.plist',
      text: serializeXmlPlist({
        creator: metadata.metainfo?.creator ?? DEFAULT_METAINFO_CREATOR,
        formatVersion:
          metadata.metainfo?.formatVersion ?? DEFAULT_UFO_FORMAT_VERSION,
        formatVersionMinor: metadata.metainfo?.formatVersionMinor ?? 0,
      }),
    },
    {
      path: 'fontinfo.plist',
      text: serializeXmlPlist(metadata.fontinfo ?? {}),
    },
    {
      path: 'lib.plist',
      text: serializeXmlPlist(metadata.lib ?? {}),
    },
    {
      path: 'groups.plist',
      text: serializeXmlPlist(metadata.groups ?? {}),
    },
    {
      path: 'kerning.plist',
      text: serializeXmlPlist(metadata.kerning ?? {}),
    },
    {
      path: 'layercontents.plist',
      text: serializeXmlPlist(
        metadata.layers.map((layer) => [layer.layerId, layer.glyphDir])
      ),
    },
  ]

  if (metadata.featuresText !== null) {
    files.push({ path: 'features.fea', text: metadata.featuresText })
  }

  return files
}
