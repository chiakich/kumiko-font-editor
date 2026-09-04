import { unicodeHexToCharacter } from '@/lib/project/unicode'

export const glyphNameToDisplayCharacter = (glyphName: string) => {
  const unicodeMatch =
    glyphName.match(/^uni([0-9a-f]{4})$/i) ??
    glyphName.match(/^u([0-9a-f]{5,6})$/i)

  if (!unicodeMatch) {
    return glyphName
  }

  return unicodeHexToCharacter(unicodeMatch[1]) ?? glyphName
}
