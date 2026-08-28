import type { KerningPair } from 'src/store/types'

// opentype.js parses the legacy `kern` table (format 0) into a flat
// "leftIndex,rightIndex" -> value record. Converting it into project kerning
// pairs means old TrueType fonts keep their kerning through Kumiko: the
// binary export never writes a `kern` table, but the synthesized GPOS kern
// feature carries the same pairs.
export const parseLegacyKernPairs = (
  kerningPairs: Record<string, number> | undefined,
  glyphOrder: readonly string[]
): KerningPair[] => {
  const pairs: KerningPair[] = []
  for (const [key, value] of Object.entries(kerningPairs ?? {})) {
    if (!Number.isFinite(value) || value === 0) {
      continue
    }
    const [leftIndex, rightIndex] = key.split(',').map(Number)
    const left = glyphOrder[leftIndex]
    const right = glyphOrder[rightIndex]
    if (!left || !right) {
      continue
    }
    pairs.push({
      id: `kern_legacy_${left}_${right}`,
      left: { kind: 'glyph', glyph: left },
      right: { kind: 'glyph', glyph: right },
      value,
    })
  }
  return pairs
}
