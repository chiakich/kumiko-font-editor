// Radical-form → canonical character mappings (e.g. ⺣ → 灬) derived from
// the GlyphWiki dump by scripts/build-glyphwiki-data.mjs. Used to match
// IDS components against GlyphWiki part characters regardless of which
// variant form each dataset uses.

const VARIANTS_DATA_PATH = '/glyphwiki/variants.txt'

let variantMapPromise: Promise<Map<string, string>> | null = null

const loadVariantMap = async () => {
  const response = await fetch(VARIANTS_DATA_PATH)
  if (!response.ok) {
    throw new Error(`無法載入部件異體對照表：${response.status}`)
  }
  const text = await response.text()
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const [variant, canonical] = line.split('\t')
    if (variant && canonical) {
      map.set(variant, canonical)
    }
  }
  return map
}

export const getGlyphwikiVariantMap = () => {
  if (!variantMapPromise) {
    variantMapPromise = loadVariantMap().catch((error) => {
      variantMapPromise = null
      throw error
    })
  }
  return variantMapPromise
}

export const canonicalizeComponent = (
  variantMap: Map<string, string>,
  character: string
) => {
  let current = character
  for (let depth = 0; depth < 5; depth += 1) {
    const next = variantMap.get(current)
    if (!next || next === current) {
      break
    }
    current = next
  }
  return current
}
