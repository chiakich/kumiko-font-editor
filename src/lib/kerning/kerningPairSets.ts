import type { FontData, KerningPair } from '@/domain'

type KerningPairSetsSource = Pick<
  FontData,
  | 'kerningPairs'
  | 'kerningPairsByMaster'
  | 'verticalKerningPairs'
  | 'verticalKerningPairsByMaster'
>

// Every pair a project holds — canonical and per-master, both orientations.
// Group renames repoint selectors in place, so callers get the live arrays;
// missing one set leaves dangling class references that only surface as
// silently skipped pairs at compile time.
export const listAllKerningPairs = (
  fontData: KerningPairSetsSource
): KerningPair[] => [
  ...(fontData.kerningPairs ?? []),
  ...Object.values(fontData.kerningPairsByMaster ?? {}).flat(),
  ...(fontData.verticalKerningPairs ?? []),
  ...Object.values(fontData.verticalKerningPairsByMaster ?? {}).flat(),
]

// Rewrites every pair set through `keep`, in place on the given (immer draft)
// font data. Used by group deletion, which must not leave a set behind.
export const filterAllKerningPairs = (
  fontData: KerningPairSetsSource,
  keep: (pair: KerningPair) => boolean
) => {
  if (fontData.kerningPairs) {
    fontData.kerningPairs = fontData.kerningPairs.filter(keep)
  }
  if (fontData.verticalKerningPairs) {
    fontData.verticalKerningPairs = fontData.verticalKerningPairs.filter(keep)
  }
  for (const byMaster of [
    fontData.kerningPairsByMaster,
    fontData.verticalKerningPairsByMaster,
  ]) {
    for (const [masterId, pairs] of Object.entries(byMaster ?? {})) {
      byMaster![masterId] = pairs.filter(keep)
    }
  }
}

type MasterKerningRecords = Pick<
  FontData,
  'kerningPairsByMaster' | 'verticalKerningPairsByMaster'
>

// Non-default masters must carry their own entry for every orientation:
// without one, edits and sync fall back to the canonical (default master's)
// set and silently overwrite it.
export const seedMasterKerningEntries = (
  fontData: MasterKerningRecords,
  masterId: string,
  seed?: { kerningPairs?: KerningPair[] }
) => {
  if (!fontData.kerningPairsByMaster?.[masterId]) {
    fontData.kerningPairsByMaster = {
      ...(fontData.kerningPairsByMaster ?? {}),
      [masterId]: seed?.kerningPairs ?? [],
    }
  }
  if (!fontData.verticalKerningPairsByMaster?.[masterId]) {
    fontData.verticalKerningPairsByMaster = {
      ...(fontData.verticalKerningPairsByMaster ?? {}),
      [masterId]: [],
    }
  }
}

export const dropMasterKerningEntries = (
  fontData: MasterKerningRecords,
  masterId: string
) => {
  delete fontData.kerningPairsByMaster?.[masterId]
  delete fontData.verticalKerningPairsByMaster?.[masterId]
}
