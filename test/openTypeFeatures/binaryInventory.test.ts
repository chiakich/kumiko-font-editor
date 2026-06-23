import { describe, expect, it } from 'vitest'
import { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
import { readSfntTableDirectory } from 'src/lib/openTypeFeatures/binaryReader'
import { parseLayoutTableInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'
import {
  makeDummyTable,
  makeMinimalGsubTable,
  makeSfnt,
} from './helpers/layoutTableFixtures'

describe('SFNT binary inventory', () => {
  it('reads table tags from the SFNT directory', () => {
    const buffer = makeSfnt([
      { tag: 'head', data: makeDummyTable() },
      { tag: 'GSUB', data: makeMinimalGsubTable() },
      { tag: 'kern', data: makeDummyTable() },
    ])

    const directory = readSfntTableDirectory(buffer)

    expect(directory.scalerType).toBe('TrueType')
    expect(directory.diagnostics).toEqual([])
    expect(directory.tables.map((table) => table.tag)).toEqual([
      'head',
      'GSUB',
      'kern',
    ])
  })

  it('handles fonts without GSUB or GPOS layout tables gracefully', () => {
    const state = extractBinaryFeatures(
      makeSfnt([{ tag: 'head', data: makeDummyTable() }]),
      null
    )

    expect(state.features).toEqual([])
    expect(state.lookups).toEqual([])
    expect(state.unsupportedLookups).toEqual([])
    expect(state.diagnostics).toEqual([])
  })

  it('inventories a minimal GSUB ScriptList, FeatureList, and LookupList', () => {
    const buffer = makeSfnt([{ tag: 'GSUB', data: makeMinimalGsubTable() }])
    const directory = readSfntTableDirectory(buffer)
    const gsubRecord = directory.tables.find((table) => table.tag === 'GSUB')

    expect(gsubRecord).toBeDefined()
    const inventory = parseLayoutTableInventory(buffer, {
      ...gsubRecord!,
      tag: 'GSUB',
    })

    expect(inventory.languages).toEqual([
      { script: 'latn', language: 'dflt', featureIndices: [0] },
    ])
    expect(inventory.features).toEqual([
      { tag: 'liga', featureIndex: 0, lookupIndices: [0] },
    ])
    expect(inventory.lookups).toEqual([
      {
        lookupIndex: 0,
        lookupType: 6,
        lookupFlag: 0x0008,
        subtableFormats: [3],
        subtableOffsets: [56],
      },
    ])
    expect(inventory.diagnostics).toEqual([])
  })

  it('detects GDEF and legacy kern table presence distinctly', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        { tag: 'GDEF', data: makeDummyTable() },
        { tag: 'kern', data: makeDummyTable() },
      ]),
      null
    )

    expect(state.gdef).toEqual({})
    expect(state.unsupportedLookups).toEqual([])
    expect(
      (state.diagnostics ?? []).map((diagnostic) => diagnostic.id)
    ).toEqual([
      'feature-diagnostic-warning-gdef-parser-version-unsupported',
      'feature-diagnostic-warning-binary-extractor-legacy-kern-present',
    ])
  })
})
