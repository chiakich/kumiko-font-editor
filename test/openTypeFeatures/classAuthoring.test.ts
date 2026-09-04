import { describe, expect, it } from 'vitest'
import {
  countGlyphClassRuleReferences,
  createGlyphClass,
  deleteGlyphClass,
  sanitizeGlyphClassName,
  updateGlyphClass,
} from '@/features/common/projectControl/fontSettings/features/utils/classAuthoring'
import { createEmptyOpenTypeFeaturesState } from '@/lib/openTypeFeatures/defaults'
import { generateFea } from '@/lib/openTypeFeatures/generateFea'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

const stateWithClassReference = (): OpenTypeFeaturesState => {
  const created = createGlyphClass(createEmptyOpenTypeFeaturesState(), 'kana')!
  return {
    ...created.state,
    lookups: [
      {
        id: 'lookup_1',
        name: 'lookup_1',
        table: 'GSUB',
        lookupType: 'singleSubst',
        lookupFlag: {},
        editable: true,
        origin: 'manual',
        rules: [
          {
            id: 'rule_1',
            kind: 'singleSubstitution',
            target: { kind: 'class', classId: created.classId },
            replacement: 'a.alt',
            meta: { origin: 'manual' },
          },
        ],
      },
    ],
  }
}

describe('classAuthoring', () => {
  it('sanitizes class names to the FEA grammar', () => {
    expect(sanitizeGlyphClassName('@kana')).toBe('@kana')
    expect(sanitizeGlyphClassName('kana')).toBe('@kana')
    expect(sanitizeGlyphClassName('平假名')).toBe('@___')
    expect(sanitizeGlyphClassName('2x')).toBe('@_2x')
    expect(sanitizeGlyphClassName('  ')).toBe('')
  })

  it('creates a class once and dedupes members on update', () => {
    const created = createGlyphClass(
      createEmptyOpenTypeFeaturesState(),
      'kana'
    )!
    expect(created.state.glyphClasses).toHaveLength(1)
    const again = createGlyphClass(created.state, 'kana')!
    expect(again.state).toBe(created.state)

    const updated = updateGlyphClass(created.state, created.classId, {
      glyphs: ['a', 'b', 'a', ''],
    })
    expect(updated.glyphClasses[0].glyphs).toEqual(['a', 'b'])
  })

  it('serializes created classes with the @ prefix', () => {
    const created = createGlyphClass(
      createEmptyOpenTypeFeaturesState(),
      'kana'
    )!
    const withMembers = updateGlyphClass(created.state, created.classId, {
      glyphs: ['a', 'b'],
    })
    expect(generateFea(withMembers).text).toContain('@kana = [a b];')
  })

  it('heals a legacy class name that lacks the @ prefix', () => {
    const state = {
      ...createEmptyOpenTypeFeaturesState(),
      glyphClasses: [
        {
          id: 'class_legacy',
          name: 'legacy',
          glyphs: ['a'],
          origin: 'manual' as const,
        },
      ],
    }
    expect(generateFea(state).text).toContain('@legacy = [a];')
  })

  it('never serializes an empty class definition', () => {
    const created = createGlyphClass(
      createEmptyOpenTypeFeaturesState(),
      'kana'
    )!
    expect(generateFea(created.state).text).not.toContain('= [];')
  })

  it('sanitizes a leading dot into a valid class name', () => {
    expect(sanitizeGlyphClassName('.vert')).toBe('@_.vert')
  })

  it('refuses a rename that collides with another class', () => {
    const first = createGlyphClass(createEmptyOpenTypeFeaturesState(), 'kana')!
    const second = createGlyphClass(first.state, 'kanji')!
    const renamed = updateGlyphClass(second.state, second.classId, {
      name: 'kana',
    })
    expect(renamed).toBe(second.state)
  })

  it('counts lookupflag class references so they cannot be deleted', () => {
    const created = createGlyphClass(
      createEmptyOpenTypeFeaturesState(),
      'marks'
    )!
    const state = {
      ...created.state,
      lookups: [
        {
          id: 'lookup_1',
          name: 'lookup_1',
          table: 'GPOS' as const,
          lookupType: 'markToBasePos' as const,
          lookupFlag: { useMarkFilteringSet: true },
          markFilteringSetClassId: created.classId,
          editable: true,
          origin: 'manual' as const,
          rules: [],
        },
      ],
    }
    expect(countGlyphClassRuleReferences(state, created.classId)).toBe(1)
    expect(deleteGlyphClass(state, created.classId)).toBeNull()
  })

  it('refuses to delete a referenced class and counts references', () => {
    const state = stateWithClassReference()
    const classId = state.glyphClasses[0].id
    expect(countGlyphClassRuleReferences(state, classId)).toBe(1)
    expect(deleteGlyphClass(state, classId)).toBeNull()

    const withoutRule = { ...state, lookups: [] }
    const deleted = deleteGlyphClass(withoutRule, classId)
    expect(deleted?.glyphClasses).toHaveLength(0)
  })
})
