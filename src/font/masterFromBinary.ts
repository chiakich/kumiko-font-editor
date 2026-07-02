import { activeLayer } from 'src/store/glyphLayer'
import { getPrimaryGlyphUnicode } from 'src/lib/glyph/glyphUnicode'
import type {
  FontData,
  FontSource,
  GlyphData,
  GlyphLayerData,
} from 'src/store/types'

export interface MasterFromBinaryResult {
  glyphs: GlyphData[]
  matchedGlyphIds: string[]
  unmatchedGlyphIds: string[]
  // Imported glyphs with no matching project glyph (by name or unicode).
  extraImportedGlyphs: GlyphData[]
}

// A master layer keyed by `source.id`, carrying the imported glyph's outline.
export const buildImportedMasterLayer = (
  source: FontSource,
  imported: GlyphData
): GlyphLayerData => {
  const layer = activeLayer(imported)
  return {
    id: source.id,
    name: source.name,
    type: 'master',
    associatedMasterId: source.id,
    paths: structuredClone(layer.paths),
    // Binary import decomposes composites to paths, so componentRefs is empty;
    // copy defensively in case a source ever carries references.
    componentRefs: structuredClone(layer.componentRefs ?? []),
    anchors: structuredClone(layer.anchors ?? []),
    guidelines: [],
    metrics: { ...layer.metrics },
  }
}

export interface ImportedGlyphIndex {
  resolve: (
    glyph: Pick<GlyphData, 'id' | 'name' | 'unicodes'>
  ) => GlyphData | undefined
}

// Index imported glyphs for lookup by working name (id/name) then primary unicode.
export const createImportedGlyphIndex = (
  glyphs: Record<string, GlyphData>
): ImportedGlyphIndex => {
  const byName = new Map<string, GlyphData>()
  const byUnicode = new Map<string, GlyphData>()
  for (const imported of Object.values(glyphs ?? {})) {
    byName.set(imported.id, imported)
    if (imported.name) {
      byName.set(imported.name, imported)
    }
    const unicode = getPrimaryGlyphUnicode(imported)
    if (unicode && !byUnicode.has(unicode)) {
      byUnicode.set(unicode, imported)
    }
  }
  return {
    resolve: (glyph) => {
      const unicode = getPrimaryGlyphUnicode(glyph)
      return (
        byName.get(glyph.id) ??
        (glyph.name ? byName.get(glyph.name) : undefined) ??
        (unicode ? byUnicode.get(unicode) : undefined)
      )
    },
  }
}

// Build a brand-new project glyph from an imported glyph: filled only in the new
// master, empty in every existing master (so it renders blank there).
export const buildNewGlyphFromImported = (
  imported: GlyphData,
  source: FontSource,
  existingSources: FontSource[]
): GlyphData => {
  const importedLayer = activeLayer(imported)
  const emptyMetrics = { lsb: 0, rsb: 0, width: importedLayer.metrics.width }
  const layers: Record<string, GlyphLayerData> = {
    [source.id]: buildImportedMasterLayer(source, imported),
  }
  for (const existing of existingSources) {
    layers[existing.id] = {
      id: existing.id,
      name: existing.name,
      type: 'master',
      associatedMasterId: existing.id,
      paths: [],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { ...emptyMetrics },
    }
  }
  return {
    id: imported.id,
    name: imported.name ?? imported.id,
    unicodes: imported.unicodes ?? [],
    activeLayerId: source.id,
    layerOrder: [...existingSources.map((existing) => existing.id), source.id],
    layers,
  }
}

// Attach a new master layer (keyed by source.id) to every project glyph, taking
// its outline from the matching glyph in an imported binary font. Glyphs are
// matched by working name first, then by primary unicode. Existing glyphs with
// no match keep their layers unchanged (they stay sparse at the new master).
export const buildMasterFromBinaryFont = (input: {
  glyphs: GlyphData[]
  binaryFontData: Pick<FontData, 'glyphs'>
  source: FontSource
}): MasterFromBinaryResult => {
  const byName = new Map<string, GlyphData>()
  const byUnicode = new Map<string, GlyphData>()
  for (const imported of Object.values(input.binaryFontData.glyphs ?? {})) {
    byName.set(imported.id, imported)
    if (imported.name) {
      byName.set(imported.name, imported)
    }
    const unicode = getPrimaryGlyphUnicode(imported)
    if (unicode && !byUnicode.has(unicode)) {
      byUnicode.set(unicode, imported)
    }
  }

  const matchedGlyphIds: string[] = []
  const unmatchedGlyphIds: string[] = []
  const usedImported = new Set<GlyphData>()
  const glyphs = input.glyphs.map((glyph) => {
    const unicode = getPrimaryGlyphUnicode(glyph)
    const imported =
      byName.get(glyph.id) ??
      (glyph.name ? byName.get(glyph.name) : undefined) ??
      (unicode ? byUnicode.get(unicode) : undefined)
    if (!imported) {
      unmatchedGlyphIds.push(glyph.id)
      return glyph
    }
    usedImported.add(imported)
    matchedGlyphIds.push(glyph.id)
    const layer = buildImportedMasterLayer(input.source, imported)
    return {
      ...glyph,
      layers: { ...glyph.layers, [input.source.id]: layer },
      layerOrder: glyph.layerOrder?.includes(input.source.id)
        ? glyph.layerOrder
        : [
            ...(glyph.layerOrder ?? Object.keys(glyph.layers ?? {})),
            input.source.id,
          ],
    }
  })

  const extraImportedGlyphs = Object.values(
    input.binaryFontData.glyphs ?? {}
  ).filter((imported) => !usedImported.has(imported))

  return { glyphs, matchedGlyphIds, unmatchedGlyphIds, extraImportedGlyphs }
}
