import { DiscreteVariationModel } from '@/font/fontra-ported/discrete-variation-model'
import {
  mapAxesFromUserSpaceToSourceSpace,
  mapForward,
} from '@/font/fontra-ported/var-model'
import { locationsMatch } from '@/font/designspaceLocation'
import {
  buildKerningGroupMaps,
  getMasterKerningPairs,
  orientedKerning,
  type KerningGroupMaps,
  type KerningOrientation,
  type OrientedKerningSource,
} from '@/lib/kerning/resolveKerning'
import type { FontData, KerningPair } from '@/domain'
import type { GlyphSelector } from '@/lib/openTypeFeatures'

// Group references arrive as id, name, or '@name' depending on the import
// path; resolve them to the stable group id so the same pair matches across
// masters (mirrors kerningSelectorsEqual / synthesizeKerning).
const selectorKey = (selector: GlyphSelector, maps: KerningGroupMaps) =>
  selector.kind === 'glyph'
    ? `g:${selector.glyph}`
    : `c:${maps.groupByReference.get(selector.classId)?.id ?? selector.classId}`

const pairKey = (pair: KerningPair, maps: KerningGroupMaps) =>
  `${selectorKey(pair.left, maps)} ${selectorKey(pair.right, maps)}`

// Kerning value for a static instance location, mirroring how varLib merges
// per-master GPOS kerning: the union of pairs across masters, with a pair
// missing from a master contributing 0 there. Falls back to the canonical
// pairs when the project has no per-master kerning to interpolate.
export const interpolateKerningPairsAtLocation = (
  input: Pick<FontData, 'axes' | 'sources' | 'kerningGroups'> &
    OrientedKerningSource,
  location: Record<string, number>,
  orientation: KerningOrientation = 'horizontal'
): KerningPair[] => {
  const fontData = {
    ...input,
    ...orientedKerning(input, orientation),
  }
  const byMaster = fontData.kerningPairsByMaster
  if (!byMaster || Object.keys(byMaster).length === 0) {
    return fontData.kerningPairs ?? []
  }
  const axes = fontData.axes?.axes ?? []
  const sources = Object.values(fontData.sources ?? {})
  if (axes.length === 0 || sources.length < 2) {
    return fontData.kerningPairs ?? []
  }

  const exactSource = sources.find((source) =>
    locationsMatch(source.location, location, axes)
  )
  if (exactSource) {
    return getMasterKerningPairs(fontData, exactSource.id)
  }

  const groupMaps = buildKerningGroupMaps(fontData.kerningGroups)
  const masterPairMaps = sources.map((source) => {
    const pairMap = new Map<string, KerningPair>()
    for (const pair of getMasterKerningPairs(fontData, source.id)) {
      const key = pairKey(pair, groupMaps)
      // First wins on duplicates, matching findKerningPairIndex.
      if (!pairMap.has(key)) {
        pairMap.set(key, pair)
      }
    }
    return pairMap
  })
  const templateByKey = new Map<string, KerningPair>()
  for (const pairMap of masterPairMaps) {
    for (const [key, pair] of pairMap) {
      if (!templateByKey.has(key)) {
        templateByKey.set(key, pair)
      }
    }
  }
  const keys = [...templateByKey.keys()]
  if (keys.length === 0) {
    return []
  }

  try {
    const modelAxes = mapAxesFromUserSpaceToSourceSpace(axes)
    const model = new DiscreteVariationModel(
      sources.map((source) => mapForward(source.location, axes)),
      modelAxes
    )
    const sourceValues = masterPairMaps.map((pairMap) =>
      keys.map((key) => pairMap.get(key)?.value ?? 0)
    )
    const { subModel, subValues } = model.getSubModel(sourceValues)
    const deltas = subModel.getDeltas(subValues)
    const result = subModel.interpolateFromDeltas(
      mapForward(location, axes),
      deltas
    )
    const values = result.instance as number[]
    return keys.map((key, index) => ({
      ...templateByKey.get(key)!,
      value: values[index],
    }))
  } catch {
    // A degenerate designspace must not fail the whole export over kerning.
    return fontData.kerningPairs ?? []
  }
}
