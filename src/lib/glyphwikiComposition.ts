// Loader for the GlyphWiki-derived composition data produced by
// scripts/build-glyphwiki-data.mjs. Boxes live on GlyphWiki's 200x200
// design canvas (y grows downward, baseline-agnostic).

const COMPOSITION_DATA_PATH = '/glyphwiki/composition.txt'

export interface GlyphwikiPartBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface GlyphwikiPartPlacement {
  char: string
  box: GlyphwikiPartBox
  variant: string | null
}

export const parseCompositionLine = (
  line: string
): { target: string; parts: GlyphwikiPartPlacement[] } | null => {
  const columns = line.split('\t')
  const target = columns[0]
  if (!target || columns.length < 3) {
    return null
  }

  const parts: GlyphwikiPartPlacement[] = []
  for (const column of columns.slice(1)) {
    const segments = column.split(':')
    const char = segments[0]
    const coordinates = (segments[1] ?? '').split(',').map(Number)
    if (!char || coordinates.length !== 4 || coordinates.some(Number.isNaN)) {
      return null
    }
    parts.push({
      char,
      box: {
        x1: coordinates[0]!,
        y1: coordinates[1]!,
        x2: coordinates[2]!,
        y2: coordinates[3]!,
      },
      variant: segments[2] ?? null,
    })
  }

  return parts.length >= 2 ? { target, parts } : null
}

let compositionMapPromise: Promise<
  Map<string, GlyphwikiPartPlacement[]>
> | null = null

const loadCompositionMap = async () => {
  const response = await fetch(COMPOSITION_DATA_PATH)
  if (!response.ok) {
    throw new Error(`無法載入 GlyphWiki 組字資料：${response.status}`)
  }

  const text = await response.text()
  const map = new Map<string, GlyphwikiPartPlacement[]>()
  for (const line of text.split('\n')) {
    const parsed = parseCompositionLine(line)
    if (parsed) {
      map.set(parsed.target, parsed.parts)
    }
  }
  return map
}

export const getGlyphwikiComposition = async (character: string) => {
  if (!compositionMapPromise) {
    compositionMapPromise = loadCompositionMap().catch((error) => {
      // Allow a retry on the next call instead of caching the failure.
      compositionMapPromise = null
      throw error
    })
  }
  const map = await compositionMapPromise
  return map.get(character) ?? null
}
