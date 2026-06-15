import { describe, expect, it } from 'vitest'
import { updateLookupRule } from 'src/features/common/projectControl/fontSettings/features/utils/ruleEditorState'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import {
  getValueRecordFieldText,
  updateValueRecordField,
} from 'src/features/common/projectControl/fontSettings/features/utils/valueRecordState'

describe('rule editor state helpers', () => {
  it('marks edited auto substitution rules as manual user overrides', () => {
    const state = makeState()
    const rule = state.lookups[0].rules[0]

    if (rule.kind !== 'singleSubstitution') {
      throw new Error('Expected a single substitution fixture.')
    }

    const nextState = updateLookupRule(state, 'lookup_liga', {
      ...rule,
      replacement: 'f_i.alt',
    })

    expect(nextState).not.toBe(state)
    expect(nextState.features[0].origin).toBe('mixed')
    expect(nextState.lookups[0].origin).toBe('manual')
    expect(nextState.lookups[0].rules[0]).toMatchObject({
      replacement: 'f_i.alt',
      meta: {
        origin: 'manual',
        userOverridden: true,
        dirty: true,
      },
    })
  })

  it('marks edited positioning rules as manual user overrides', () => {
    const state = makeState()
    const rule = state.lookups[1].rules[0]

    if (rule.kind !== 'pairPositioning') {
      throw new Error('Expected a pair positioning fixture.')
    }

    const nextState = updateLookupRule(state, 'lookup_kern', {
      ...rule,
      firstValue: { xAdvance: -100 },
    })

    expect(nextState.features[1].origin).toBe('mixed')
    expect(nextState.lookups[1].origin).toBe('manual')
    expect(nextState.lookups[1].rules[0]).toMatchObject({
      firstValue: { xAdvance: -100 },
      meta: {
        origin: 'manual',
        userOverridden: true,
        dirty: true,
      },
    })
  })

  it('updates optional value record fields from input text', () => {
    const value = updateValueRecordField(undefined, 'xAdvance', '-80')

    expect(value).toEqual({ xAdvance: -80 })
    expect(getValueRecordFieldText(value, 'xAdvance')).toBe('-80')
    expect(updateValueRecordField(value, 'xAdvance', '')).toBeUndefined()
  })
})

function makeState(): OpenTypeFeaturesState {
  return {
    irVersion: '1',
    fontFingerprint: null,
    languagesystems: [],
    features: [
      {
        id: 'feature_liga',
        tag: 'liga',
        isActive: true,
        origin: 'auto',
        entries: [
          {
            id: 'entry_liga',
            script: 'DFLT',
            language: 'dflt',
            lookupIds: ['lookup_liga'],
          },
        ],
      },
      {
        id: 'feature_kern',
        tag: 'kern',
        isActive: true,
        origin: 'auto',
        entries: [
          {
            id: 'entry_kern',
            script: 'DFLT',
            language: 'dflt',
            lookupIds: ['lookup_kern'],
          },
        ],
      },
    ],
    lookups: [
      {
        id: 'lookup_liga',
        name: 'lookup_liga',
        table: 'GSUB',
        lookupType: 'singleSubst',
        lookupFlag: {},
        editable: true,
        origin: 'auto',
        rules: [
          {
            id: 'rule_f_i',
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'f_i' },
            replacement: 'f_i',
            meta: {
              origin: 'auto',
              generator: 'glyph-suffix',
            },
          },
        ],
      },
      {
        id: 'lookup_kern',
        name: 'lookup_kern',
        table: 'GPOS',
        lookupType: 'pairPos',
        lookupFlag: {},
        editable: true,
        origin: 'auto',
        rules: [
          {
            id: 'rule_t_o',
            kind: 'pairPositioning',
            left: { kind: 'glyph', glyph: 'T' },
            right: { kind: 'glyph', glyph: 'o' },
            firstValue: { xAdvance: -80 },
            meta: {
              origin: 'auto',
              generator: 'kerning-groups',
            },
          },
        ],
      },
    ],
    glyphClasses: [],
    markClasses: [],
    anchors: [],
    gdef: null,
    unsupportedLookups: [],
    autoFeatureConfig: {
      enabled: true,
      liga: true,
      dlig: true,
      rlig: true,
      hlig: true,
      locl: true,
      salt: true,
      stylisticSets: true,
      smcp: true,
      c2sc: true,
      onum: true,
      lnum: true,
      pnum: true,
      tnum: true,
      sups: true,
      subs: true,
      ordn: true,
      frac: true,
      kern: true,
      mark: true,
      mkmk: true,
    },
    ignoredSuggestionIds: [],
    exportPolicy: 'rebuild-managed-layout-tables',
  }
}
