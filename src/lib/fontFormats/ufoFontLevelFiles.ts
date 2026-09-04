import { serializeXmlPlist } from '@/lib/fontFormats/adapters/ufo'
import type { UfoMetadataRecord } from '@/lib/fontFormats/ufoTypes'
import { UFO_FONT_LEVEL_FILE_NAMES } from '@/lib/fontFormats/ufoFileNames'

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
    | 'textStyle'
  >
): UfoFontLevelFile[] => {
  const serializeXmlPlist2 = (value: unknown) =>
    serializeXmlPlist(value, metadata.textStyle)

  const files: UfoFontLevelFile[] = [
    {
      path: 'metainfo.plist',
      text: serializeXmlPlist2({
        creator: metadata.metainfo?.creator ?? DEFAULT_METAINFO_CREATOR,
        formatVersion:
          metadata.metainfo?.formatVersion ?? DEFAULT_UFO_FORMAT_VERSION,
        // Optional in UFO 3 — writing a default the source never had shows up
        // as a change in metainfo.plist on every single commit.
        ...(metadata.metainfo?.formatVersionMinor === undefined
          ? {}
          : { formatVersionMinor: metadata.metainfo.formatVersionMinor }),
      }),
    },
    {
      path: 'fontinfo.plist',
      text: serializeXmlPlist2(metadata.fontinfo ?? {}),
    },
    {
      path: 'lib.plist',
      text: serializeXmlPlist2(metadata.lib ?? {}),
    },
    {
      path: 'groups.plist',
      text: serializeXmlPlist2(metadata.groups ?? {}),
    },
    {
      path: 'kerning.plist',
      text: serializeXmlPlist2(metadata.kerning ?? {}),
    },
    {
      path: 'layercontents.plist',
      text: serializeXmlPlist2(
        metadata.layers.map((layer) => [layer.layerId, layer.glyphDir])
      ),
    },
  ]

  if (metadata.featuresText !== null) {
    files.push({ path: 'features.fea', text: metadata.featuresText })
  }

  // Keeps the builder honest against the shared name list.
  const known = new Set<string>(UFO_FONT_LEVEL_FILE_NAMES)
  return files.filter((file) => known.has(file.path))
}
