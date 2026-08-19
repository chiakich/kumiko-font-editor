// The font-level files a UFO directory carries, in write order. Lives here
// rather than next to the builder so importers can reference it without
// pulling in the serializer.
export const UFO_FONT_LEVEL_FILE_NAMES = [
  'metainfo.plist',
  'fontinfo.plist',
  'lib.plist',
  'groups.plist',
  'kerning.plist',
  'layercontents.plist',
  'features.fea',
] as const

// Port of the UFO 3 "common user name to file name" algorithm
// (unifiedfontobject.org / fontTools.ufoLib.filenames.userNameToFileName).
// Makes glyph names filesystem-safe and case-insensitive-collision-safe, which
// is required for spec-compliant .glif file names.

const ILLEGAL_CHARACTERS = new Set([
  '"',
  '*',
  '+',
  '/',
  ':',
  '<',
  '>',
  '?',
  '[',
  '\\',
  ']',
  '|',
  ...Array.from({ length: 0x20 }, (_, i) => String.fromCharCode(i)),
  String.fromCharCode(0x7f),
])

const RESERVED_FILE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'clock$',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
])

const MAX_FILE_NAME_LENGTH = 255

// `existing` must be a set of already-used file names, lowercased.
export function userNameToFileName(
  userName: string,
  existing: Set<string>,
  suffix = ''
): string {
  let filteredUserName = ''
  for (const char of userName) {
    if (ILLEGAL_CHARACTERS.has(char)) {
      filteredUserName += '_'
    } else if (char !== char.toLowerCase()) {
      // Append an underscore after characters that have a distinct lowercase
      // form, so names differing only by case stay distinct on case-insensitive
      // filesystems.
      filteredUserName += char + '_'
    } else {
      filteredUserName += char
    }
  }

  // A leading period would hide the file, so replace it with an underscore.
  if (filteredUserName.startsWith('.')) {
    filteredUserName = `_${filteredUserName.slice(1)}`
  }
  // Reserved name parts (e.g. CON, NUL) get an underscore prefix.
  let base = filteredUserName
    .split('.')
    .map((part) =>
      RESERVED_FILE_NAMES.has(part.toLowerCase()) ? `_${part}` : part
    )
    .join('.')

  if (base.length + suffix.length > MAX_FILE_NAME_LENGTH) {
    base = base.slice(0, MAX_FILE_NAME_LENGTH - suffix.length)
  }

  let candidate = base + suffix
  if (existing.has(candidate.toLowerCase())) {
    const numberSpace = 15
    const truncated = base.slice(
      0,
      MAX_FILE_NAME_LENGTH - suffix.length - numberSpace
    )
    let counter = 1
    do {
      candidate =
        truncated + String(counter).padStart(numberSpace, '0') + suffix
      counter += 1
    } while (existing.has(candidate.toLowerCase()))
  }

  return candidate
}
