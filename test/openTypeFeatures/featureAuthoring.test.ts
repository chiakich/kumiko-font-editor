import { describe, expect, it } from 'vitest'
import {
  addRuleToFeature,
  createFeature,
  deleteLookupRule,
} from 'src/features/common/projectControl/fontSettings/features/utils/featureAuthoring'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'

describe('featureAuthoring', () => {
  it('creates a manual feature once and returns the existing one after', () => {
    const state = createEmptyOpenTypeFeaturesState()
    const first = createFeature(state, 'ss02')
    expect(first).not.toBeNull()
    expect(first!.state.features).toHaveLength(1)
    expect(first!.state.features[0]).toMatchObject({
      tag: 'ss02',
      isActive: true,
      origin: 'manual',
    })
    const second = createFeature(first!.state, 'ss02')
    expect(second!.state).toBe(first!.state)
    expect(second!.featureId).toBe(first!.featureId)
  })

  it('rejects an invalid tag', () => {
    expect(createFeature(createEmptyOpenTypeFeaturesState(), 'SS2')).toBeNull()
    expect(createFeature(createEmptyOpenTypeFeaturesState(), 'kernx')).toBe(
      null
    )
  })

  it('adds a blank rule, creating a matching lookup on first use', () => {
    const created = createFeature(createEmptyOpenTypeFeaturesState(), 'ss02')!
    const feature = created.state.features[0]
    const added = addRuleToFeature(created.state, feature, 'singleSubstitution')
    expect(added.state.lookups).toHaveLength(1)
    expect(added.state.lookups[0]).toMatchObject({
      table: 'GSUB',
      lookupType: 'singleSubst',
      editable: true,
    })
    expect(
      added.state.features[0].entries.every((entry) =>
        entry.lookupIds.includes(added.state.lookups[0].id)
      )
    ).toBe(true)

    // A second rule of the same kind lands in the same lookup.
    const again = addRuleToFeature(
      added.state,
      added.state.features[0],
      'singleSubstitution'
    )
    expect(again.state.lookups).toHaveLength(1)
    expect(again.state.lookups[0].rules).toHaveLength(2)

    // A GPOS rule gets its own lookup.
    const pos = addRuleToFeature(
      again.state,
      again.state.features[0],
      'pairPositioning'
    )
    expect(pos.state.lookups).toHaveLength(2)
    expect(pos.state.lookups[1].table).toBe('GPOS')
  })

  it('never serializes an incomplete blank rule into the FEA', () => {
    const created = createFeature(createEmptyOpenTypeFeaturesState(), 'ss02')!
    const added = addRuleToFeature(
      created.state,
      created.state.features[0],
      'singleSubstitution'
    )
    const blankFea = generateFea(added.state).text
    expect(blankFea).not.toMatch(/sub\s+by/)

    // Once filled in, the rule serializes normally.
    const filled = {
      ...added.state,
      lookups: added.state.lookups.map((lookup) => ({
        ...lookup,
        rules: lookup.rules.map((rule) =>
          rule.kind === 'singleSubstitution'
            ? {
                ...rule,
                target: { kind: 'glyph' as const, glyph: 'a' },
                replacement: 'a.alt',
              }
            : rule
        ),
      })),
    }
    expect(generateFea(filled).text).toContain('sub a by a.alt;')
  })

  it('deletes a rule from its lookup', () => {
    const created = createFeature(createEmptyOpenTypeFeaturesState(), 'ss02')!
    const added = addRuleToFeature(
      created.state,
      created.state.features[0],
      'singleSubstitution'
    )
    const lookup = added.state.lookups[0]
    const next = deleteLookupRule(added.state, lookup.id, added.ruleId)
    expect(next.lookups[0].rules).toHaveLength(0)
  })
})
