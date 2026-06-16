// In-memory holder for a user-loaded reference font. Renders a single
// character behind the editing glyph for tracing (補字 workflow).
// Not persisted yet — re-loaded each session; persisting the bytes would need
// an IndexedDB schema bump (see src/lib/project/persistence.ts).

import opentype from 'opentype.js'

interface LoadedReferenceFont {
  name: string
  font: opentype.Font
  unitsPerEm: number
}

let loaded: LoadedReferenceFont | null = null

export async function loadReferenceFontFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const font = opentype.parse(buffer)
  const familyNames = font.names?.fontFamily as
    | Record<string, string>
    | undefined
  const name =
    familyNames?.en ??
    (familyNames ? Object.values(familyNames)[0] : undefined) ??
    file.name.replace(/\.[^.]+$/, '')
  loaded = { name, font, unitsPerEm: font.unitsPerEm }
  return name
}

export function clearReferenceFont(): void {
  loaded = null
}

export function hasReferenceFont(): boolean {
  return loaded !== null
}

// Build a fill Path2D for `char`, scaled to `targetUnitsPerEm` and expressed in
// font units (y-up) to match the editor's per-glyph coordinate space. Returns
// null when no font is loaded or the character is absent from the font.
//
// When `advanceWidth` is given, the glyph is centred horizontally within that
// width by its ink bounding box (sidebearings differ between fonts, so origin
// alignment would look off-centre). The vertical position is left on the
// baseline so it stays aligned for tracing.
export function buildReferenceCharPath(
  char: string,
  targetUnitsPerEm: number,
  advanceWidth?: number
): Path2D | null {
  if (!loaded || !char) {
    return null
  }
  const glyph = loaded.font.charToGlyph(char)
  // index 0 is .notdef — the character is not present in the reference font.
  if (!glyph || glyph.index === 0) {
    return null
  }
  const commands = glyph.path?.commands
  if (!commands || commands.length === 0) {
    return null
  }
  const scale = targetUnitsPerEm / loaded.unitsPerEm
  let offsetX = 0
  if (advanceWidth !== undefined) {
    const bbox = glyph.getBoundingBox()
    const inkCenterX = ((bbox.x1 + bbox.x2) / 2) * scale
    offsetX = advanceWidth / 2 - inkCenterX
  }
  const x = (value: number) => value * scale + offsetX
  const y = (value: number) => value * scale
  const path = new Path2D()
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        path.moveTo(x(command.x), y(command.y))
        break
      case 'L':
        path.lineTo(x(command.x), y(command.y))
        break
      case 'C':
        path.bezierCurveTo(
          x(command.x1),
          y(command.y1),
          x(command.x2),
          y(command.y2),
          x(command.x),
          y(command.y)
        )
        break
      case 'Q':
        path.quadraticCurveTo(
          x(command.x1),
          y(command.y1),
          x(command.x),
          y(command.y)
        )
        break
      case 'Z':
        path.closePath()
        break
    }
  }
  return path
}
