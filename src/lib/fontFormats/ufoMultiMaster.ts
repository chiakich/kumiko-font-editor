import type {
  FontData,
  FontSource,
  GlyphData,
  GlyphLayerData,
  KerningPair,
} from '@/domain'
import {
  designspaceDefaultLocation,
  designspaceToExportInstances,
  designspaceToFontAxes,
  type Designspace,
} from '@/lib/fontFormats/designspace'
import { parseUfoColor } from '@/lib/color/kumikoColor'
import { KUMIKO_VERTICAL_KERNING_LIB_KEY } from '@/lib/fontFormats/fontInfoSettings'
import {
  parseUfoKerning,
  parseVerticalKerningLib,
  type ParsedUfoKerning,
} from '@/lib/fontFormats/ufoKerning'
import {
  buildBoundsResolver,
  glyphRecordToLayerContent,
} from '@/lib/fontFormats/ufoGlif'
import {
  buildFontDataFromUfoGlyphs,
  getGlyphDirForLayer,
  getLayerById,
  isUfoBackgroundLayer,
  pickDefaultLayer,
} from '@/lib/fontFormats/ufoFontData'
import { basename, locationsEqual } from '@/lib/fontFormats/ufoWorkspace'
import type {
  UfoGlyphRecord,
  UfoMetadataRecord,
} from '@/lib/fontFormats/ufoTypes'

export interface SourceRef {
  sourceId: string
  name: string
  location: Record<string, number>
  ufoId: string
  layerId: string
}

const designspaceSourceName = (source: Designspace['sources'][number]) =>
  source.layer ? `${source.name} · ${source.layer}` : source.name

// Match designspace <source> entries to parsed UFOs (by filename) and assign a
// stable source id + layer id per source. Shared by the multi-master builder and
// the save path so both agree on which UFO a source writes to.
export const resolveSourceRefs = (
  metadataRecords: UfoMetadataRecord[],
  designspace: Designspace
): SourceRef[] => {
  const usedIds = new Set<string>()
  const uniqueSourceId = (name: string): string => {
    const base = name || 'master'
    let id = base
    let counter = 2
    while (usedIds.has(id)) {
      id = `${base} (${counter})`
      counter += 1
    }
    usedIds.add(id)
    return id
  }

  const refs: SourceRef[] = []
  for (const source of designspace.sources) {
    const target = basename(source.filename)
    const metadata = metadataRecords.find(
      (record) => basename(record.relativePath) === target
    )
    if (!metadata) {
      continue
    }
    const layer = source.layer
      ? getLayerById(metadata, source.layer)
      : pickDefaultLayer(metadata)
    if (!layer) {
      continue
    }
    const name = designspaceSourceName(source)
    refs.push({
      sourceId: uniqueSourceId(name),
      name,
      location: source.location,
      ufoId: metadata.ufoId,
      layerId: layer.layerId,
    })
  }
  return refs
}

export const resolveDefaultSourceRef = (
  refs: SourceRef[],
  designspace: Designspace
): SourceRef | undefined => {
  const defaultLocation = designspaceDefaultLocation(designspace)
  return (
    refs.find((ref) => locationsEqual(ref.location, defaultLocation)) ?? refs[0]
  )
}

interface MasterSource extends SourceRef {
  metadata: UfoMetadataRecord
  resolveBounds: ReturnType<typeof buildBoundsResolver>
  backgroundByGlyphName: Map<
    string,
    ReturnType<typeof glyphRecordToLayerContent>
  >
  recordsByName: Map<string, UfoGlyphRecord>
}

const isBraceSource = (master: Pick<MasterSource, 'metadata' | 'ufoId'>) =>
  /\.brace\.ufo$/i.test(basename(master.metadata.relativePath)) ||
  /\.brace\.ufo$/i.test(basename(master.ufoId))

const ruleConditionsToBracketAxisRules = (
  conditions: NonNullable<Designspace['rules']>[number]['conditions']
): NonNullable<GlyphLayerData['bracketAxisRules']> =>
  Object.fromEntries(
    Object.entries(conditions).map(([axis, condition]) => [
      axis,
      {
        ...(condition.minimum !== undefined ? { min: condition.minimum } : {}),
        ...(condition.maximum !== undefined ? { max: condition.maximum } : {}),
      },
    ])
  )

const getBracketLayerId = (
  rule: NonNullable<Designspace['rules']>[number],
  substitution: NonNullable<
    Designspace['rules']
  >[number]['substitutions'][number]
) => {
  const rulePrefix = `${substitution.name}.`
  if (rule.name.startsWith(rulePrefix)) {
    return rule.name.slice(rulePrefix.length)
  }
  const exportedPrefix = `${substitution.name}.bracket.`
  if (substitution.with.startsWith(exportedPrefix)) {
    return substitution.with.slice(exportedPrefix.length)
  }
  return substitution.with
}

const uniqueLayerId = (
  layers: Record<string, GlyphLayerData>,
  preferredId: string
) => {
  let id = preferredId || 'layer'
  let counter = 2
  while (layers[id]) {
    id = `${preferredId}-${counter}`
    counter += 1
  }
  return id
}

// Merge several UFO sources (one per designspace <source>) into one FontData with
// one master layer per source. Pure: takes already-parsed records + designspace.
export const buildMultiMasterFontData = (
  metadataRecords: UfoMetadataRecord[],
  glyphRecords: UfoGlyphRecord[],
  designspace: Designspace
): FontData => {
  const refs = resolveSourceRefs(metadataRecords, designspace)
  const masters: MasterSource[] = refs.map((ref) => {
    const metadata = metadataRecords.find(
      (record) => record.ufoId === ref.ufoId
    )!
    const records = glyphRecords.filter(
      (record) => record.ufoId === ref.ufoId && record.layerId === ref.layerId
    )
    const defaultLayer = pickDefaultLayer(metadata)
    const backgroundLayers = metadata.layers.filter((layer) =>
      isUfoBackgroundLayer(layer, defaultLayer)
    )
    const backgroundRecords = glyphRecords.filter(
      (record) =>
        record.ufoId === ref.ufoId &&
        backgroundLayers.some((layer) => layer.layerId === record.layerId)
    )
    const backgroundBounds = buildBoundsResolver([
      ...records,
      ...backgroundRecords,
    ])
    return {
      ...ref,
      metadata,
      resolveBounds: buildBoundsResolver(records),
      backgroundByGlyphName: new Map(
        backgroundRecords.map((record) => [
          record.glyphName,
          glyphRecordToLayerContent(record, backgroundBounds),
        ])
      ),
      recordsByName: new Map(
        records.map((record) => [record.glyphName, record])
      ),
    }
  })

  const regularMasters = masters.filter((master) => !isBraceSource(master))
  const braceMasters = masters.filter(isBraceSource)

  if (regularMasters.length === 0) {
    return { glyphs: {} }
  }

  const defaultRef = resolveDefaultSourceRef(refs, designspace)
  const defaultMaster =
    regularMasters.find((master) => master.sourceId === defaultRef?.sourceId) ??
    regularMasters[0]

  const base = buildFontDataFromUfoGlyphs(
    [...defaultMaster.recordsByName.values()],
    defaultMaster.metadata
  )

  const postscriptNames =
    defaultMaster.metadata.lib?.['public.postscriptNames'] &&
    typeof defaultMaster.metadata.lib['public.postscriptNames'] === 'object'
      ? (defaultMaster.metadata.lib['public.postscriptNames'] as Record<
          string,
          string
        >)
      : {}

  // Union of glyph names: default source order first, then any extras.
  const orderedNames: string[] = []
  const seen = new Set<string>()
  const push = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name)
      orderedNames.push(name)
    }
  }
  const bracketSubstitutions = (designspace.rules ?? []).flatMap((rule) =>
    rule.substitutions.map((substitution) => ({ rule, substitution }))
  )
  const substitutedGlyphNames = new Set(
    bracketSubstitutions.map(({ substitution }) => substitution.with)
  )

  for (const name of defaultMaster.metadata.glyphOrder) {
    if (substitutedGlyphNames.has(name)) {
      continue
    }
    if (regularMasters.some((master) => master.recordsByName.has(name))) {
      push(name)
    }
  }
  for (const master of regularMasters) {
    for (const name of master.recordsByName.keys()) {
      if (substitutedGlyphNames.has(name)) {
        continue
      }
      push(name)
    }
  }

  const glyphs: Record<string, GlyphData> = {}
  for (const glyphId of orderedNames) {
    const layers: Record<string, GlyphLayerData> = {}
    const layerOrder: string[] = []
    let representative: UfoGlyphRecord | undefined

    const addLayer = (master: MasterSource) => {
      const record = master.recordsByName.get(glyphId)
      if (!record) {
        return
      }
      representative = representative ?? record
      layers[master.sourceId] = {
        id: master.sourceId,
        name: master.name,
        type: 'master',
        associatedMasterId: master.sourceId,
        sourceData: {
          ufo: {
            ufoId: record.ufoId,
            layerId: record.layerId,
            glyphDir: getGlyphDirForLayer(master.metadata, record.layerId),
            fileName: record.fileName,
            sourceHash: record.sourceHash,
            remoteBlobSha: record.remoteBlobSha ?? null,
            note: record.note,
            lib: record.lib,
            glifStyle: record.glifStyle ?? null,
          },
        },
        image: record.image
          ? {
              ...record.image,
              color: parseUfoColor(record.image.color),
            }
          : null,
        background: master.backgroundByGlyphName.get(glyphId) ?? null,
        ...glyphRecordToLayerContent(record, master.resolveBounds),
      }
      layerOrder.push(master.sourceId)
    }

    addLayer(defaultMaster)
    for (const master of regularMasters) {
      if (master !== defaultMaster) {
        addLayer(master)
      }
    }
    if (!representative || layerOrder.length === 0) {
      continue
    }

    const activeLayerId = layers[defaultMaster.sourceId]
      ? defaultMaster.sourceId
      : layerOrder[0]

    for (const braceMaster of braceMasters) {
      const record = braceMaster.recordsByName.get(glyphId)
      if (!record) {
        continue
      }
      const layerId = uniqueLayerId(layers, braceMaster.sourceId)
      layers[layerId] = {
        id: layerId,
        name: braceMaster.name,
        type: 'brace',
        associatedMasterId: defaultMaster.sourceId,
        braceLocation: braceMaster.location,
        sourceData: {
          ufo: {
            ufoId: record.ufoId,
            layerId: record.layerId,
            glyphDir: getGlyphDirForLayer(braceMaster.metadata, record.layerId),
            fileName: record.fileName,
            sourceHash: record.sourceHash,
            remoteBlobSha: record.remoteBlobSha ?? null,
            note: record.note,
            lib: record.lib,
            glifStyle: record.glifStyle ?? null,
          },
        },
        image: record.image
          ? {
              ...record.image,
              color: parseUfoColor(record.image.color),
            }
          : null,
        background: braceMaster.backgroundByGlyphName.get(glyphId) ?? null,
        ...glyphRecordToLayerContent(record, braceMaster.resolveBounds),
      }
      layerOrder.push(layerId)
    }

    for (const { rule, substitution } of bracketSubstitutions) {
      if (substitution.name !== glyphId) {
        continue
      }
      const substituteMaster =
        regularMasters.find((master) =>
          master.recordsByName.has(substitution.with)
        ) ?? defaultMaster
      const record = substituteMaster.recordsByName.get(substitution.with)
      if (!record) {
        continue
      }
      const layerId = uniqueLayerId(
        layers,
        getBracketLayerId(rule, substitution)
      )
      layers[layerId] = {
        id: layerId,
        name: layerId,
        type: 'bracket',
        associatedMasterId: substituteMaster.sourceId,
        bracketAxisRules: ruleConditionsToBracketAxisRules(rule.conditions),
        sourceData: {
          ufo: {
            ufoId: record.ufoId,
            layerId: record.layerId,
            glyphDir: getGlyphDirForLayer(
              substituteMaster.metadata,
              record.layerId
            ),
            fileName: record.fileName,
            sourceHash: record.sourceHash,
            remoteBlobSha: record.remoteBlobSha ?? null,
            note: record.note,
            lib: record.lib,
            glifStyle: record.glifStyle ?? null,
          },
        },
        image: record.image
          ? {
              ...record.image,
              color: parseUfoColor(record.image.color),
            }
          : null,
        background:
          substituteMaster.backgroundByGlyphName.get(substitution.with) ?? null,
        ...glyphRecordToLayerContent(record, substituteMaster.resolveBounds),
      }
      layerOrder.push(layerId)
    }

    glyphs[glyphId] = {
      id: glyphId,
      name: glyphId,
      activeLayerId,
      layerOrder,
      layers,
      unicodes: representative.unicodes,
      production: postscriptNames[glyphId] ?? null,
      export: true,
      sourceData: {
        ufo: {
          fileName: representative.fileName,
          sourceHash: representative.sourceHash,
          remoteBlobSha: representative.remoteBlobSha ?? null,
        },
      },
    }
  }

  const sources: Record<string, FontSource> = {}
  for (const master of regularMasters) {
    sources[master.sourceId] = {
      id: master.sourceId,
      name: master.name,
      location: master.location,
      ufoId: master.ufoId,
    }
  }

  // Per-master kerning: the default master's pairs are the canonical set
  // (already on `base`); every other master keeps its own UFO's pairs so a
  // sync never clobbers them with the default's. Groups merge by id (UFO
  // group keys are the ids, so identical names collide into one record).
  const kerningGroups = [...(base.kerningGroups ?? [])]
  const knownGroupIds = new Set(kerningGroups.map((group) => group.id))
  const kerningPairsByMaster: Record<string, KerningPair[]> = {}
  const verticalKerningPairsByMaster: Record<string, KerningPair[]> = {}
  const parsedKerningByUfo = new Map<string, ParsedUfoKerning>()
  for (const master of regularMasters) {
    if (master === defaultMaster) {
      continue
    }
    let parsed = parsedKerningByUfo.get(master.ufoId)
    if (!parsed) {
      parsed = parseUfoKerning(master.metadata.groups, master.metadata.kerning)
      parsedKerningByUfo.set(master.ufoId, parsed)
    }
    for (const group of parsed.kerningGroups) {
      if (!knownGroupIds.has(group.id)) {
        knownGroupIds.add(group.id)
        kerningGroups.push(group)
      }
    }
    kerningPairsByMaster[master.sourceId] = parsed.kerningPairs
    verticalKerningPairsByMaster[master.sourceId] = parseVerticalKerningLib(
      master.metadata.lib?.[KUMIKO_VERTICAL_KERNING_LIB_KEY]
    )
  }

  return {
    ...base,
    glyphs,
    axes: designspaceToFontAxes(designspace),
    sources,
    kerningGroups,
    ...(Object.keys(kerningPairsByMaster).length > 0
      ? { kerningPairsByMaster }
      : {}),
    ...(Object.keys(verticalKerningPairsByMaster).length > 0
      ? { verticalKerningPairsByMaster }
      : {}),
    exportInstances: designspaceToExportInstances(designspace),
  }
}
