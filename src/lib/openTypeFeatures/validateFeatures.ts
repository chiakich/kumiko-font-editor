import { createFontFingerprint } from 'src/lib/openTypeFeatures/defaults'
import { makeDiagnostic } from 'src/lib/openTypeFeatures/diagnostics'
import {
  getNestedLookupReferences,
  getRuleClassReferences,
  getRuleGlyphReferences,
  getRuleValueRecords,
  hasValueRecordValue,
} from 'src/lib/openTypeFeatures/ruleReferences'
import type {
  FeatureDiagnostic,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import {
  isFourCharTag,
  isValidGlyphClassName,
  isValidGlyphName,
  isValidLookupName,
} from 'src/lib/openTypeFeatures/validationNames'
import type { FontData } from 'src/store/types'

const sameFingerprint = (
  left: OpenTypeFeaturesState['fontFingerprint'],
  right: OpenTypeFeaturesState['fontFingerprint']
) =>
  Boolean(
    left &&
    right &&
    left.glyphOrderHash === right.glyphOrderHash &&
    left.cmapHash === right.cmapHash &&
    left.unitsPerEm === right.unitsPerEm &&
    left.glyphCount === right.glyphCount
  )

const validateRuleShape = (
  rule: Rule,
  lookup: LookupRecord,
  diagnostics: FeatureDiagnostic[]
) => {
  if (rule.kind === 'ligatureSubstitution') {
    if (rule.components.length === 0) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          'Ligature substitutions need at least one component glyph.',
          { kind: 'rule', ruleId: rule.id },
          [rule.id, 'empty-components']
        )
      )
    }
    if (!rule.replacement) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          'Ligature substitutions need exactly one replacement glyph.',
          { kind: 'rule', ruleId: rule.id },
          [rule.id, 'missing-replacement']
        )
      )
    }
  }

  if (rule.kind === 'alternateSubstitution' && rule.alternates.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        'error',
        'Alternate substitutions need at least one alternate glyph.',
        { kind: 'rule', ruleId: rule.id },
        [rule.id, 'empty-alternates']
      )
    )
  }

  if (rule.kind === 'multipleSubstitution' && rule.replacement.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        'error',
        'Multiple substitutions need at least one replacement glyph.',
        { kind: 'rule', ruleId: rule.id },
        [rule.id, 'empty-replacement']
      )
    )
  }

  if (rule.kind === 'pairPositioning') {
    if (
      !hasValueRecordValue(rule.firstValue) &&
      !hasValueRecordValue(rule.secondValue)
    ) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          'Pair positioning rules need at least one value record.',
          { kind: 'rule', ruleId: rule.id },
          [rule.id, 'missing-values']
        )
      )
    }
  }

  for (const value of getRuleValueRecords(rule)) {
    for (const numberValue of Object.values(value)) {
      if (numberValue !== undefined && !Number.isFinite(numberValue)) {
        diagnostics.push(
          makeDiagnostic(
            'error',
            `Rule ${rule.id} contains a non-finite positioning value.`,
            { kind: 'rule', ruleId: rule.id },
            [rule.id, 'non-finite-value']
          )
        )
      }
    }
  }

  if (!lookup.editable) {
    diagnostics.push(
      makeDiagnostic(
        'warning',
        'This lookup can be inspected but not visually edited yet.',
        { kind: 'lookup', lookupId: lookup.id },
        [lookup.id, 'readonly']
      )
    )
  }
}

export const validateFeatures = (
  state: OpenTypeFeaturesState,
  fontData: FontData
) => {
  const diagnostics: FeatureDiagnostic[] = []
  const glyphIds = new Set(Object.keys(fontData.glyphs))
  const classIds = new Set(
    state.glyphClasses.map((glyphClass) => glyphClass.id)
  )
  const lookupIds = new Set(state.lookups.map((lookup) => lookup.id))
  const lookupNames = new Set<string>()

  for (const languageSystem of state.languagesystems) {
    if (
      !isFourCharTag(languageSystem.script) ||
      !isFourCharTag(languageSystem.language)
    ) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          'Language system script and language tags must both be 4 characters.',
          { kind: 'global' },
          [languageSystem.id, 'tag-length']
        )
      )
    }
  }

  for (const feature of state.features) {
    if (!isFourCharTag(feature.tag)) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          `Feature tag "${feature.tag}" must be 4 characters.`,
          { kind: 'feature', featureId: feature.id },
          [feature.id, 'tag-length']
        )
      )
    }
    for (const entry of feature.entries) {
      for (const lookupId of entry.lookupIds) {
        if (!lookupIds.has(lookupId)) {
          diagnostics.push(
            makeDiagnostic(
              'error',
              `Feature "${feature.tag}" references missing lookup "${lookupId}".`,
              { kind: 'feature', featureId: feature.id },
              [feature.id, lookupId, 'missing-lookup']
            )
          )
        }
      }
    }
  }

  for (const glyphClass of state.glyphClasses) {
    if (!isValidGlyphClassName(glyphClass.name)) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          `Glyph class name "${glyphClass.name}" is not valid FEA syntax.`,
          { kind: 'class', classId: glyphClass.id },
          [glyphClass.id, 'invalid-name']
        )
      )
    }
    if (glyphClass.glyphs.length === 0) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          `Glyph class "${glyphClass.name}" must not be empty.`,
          { kind: 'class', classId: glyphClass.id },
          [glyphClass.id, 'empty']
        )
      )
    }
    for (const glyph of glyphClass.glyphs) {
      if (!glyphIds.has(glyph)) {
        diagnostics.push(
          makeDiagnostic(
            'error',
            `Glyph class "${glyphClass.name}" references missing glyph "${glyph}".`,
            { kind: 'class', classId: glyphClass.id },
            [glyphClass.id, glyph, 'missing-glyph']
          )
        )
      }
    }
  }

  for (const lookup of state.lookups) {
    if (!isValidLookupName(lookup.name)) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          `Lookup name "${lookup.name}" is not valid FEA syntax.`,
          { kind: 'lookup', lookupId: lookup.id },
          [lookup.id, 'invalid-name']
        )
      )
    }
    if (lookupNames.has(lookup.name)) {
      diagnostics.push(
        makeDiagnostic(
          'error',
          `Lookup name "${lookup.name}" is used more than once.`,
          { kind: 'lookup', lookupId: lookup.id },
          [lookup.id, 'duplicate-name']
        )
      )
    }
    lookupNames.add(lookup.name)

    for (const rule of lookup.rules) {
      validateRuleShape(rule, lookup, diagnostics)

      for (const glyphName of getRuleGlyphReferences(rule)) {
        if (!isValidGlyphName(glyphName) || !glyphIds.has(glyphName)) {
          diagnostics.push(
            makeDiagnostic(
              'error',
              `Rule references missing or invalid glyph "${glyphName}".`,
              { kind: 'rule', ruleId: rule.id },
              [rule.id, glyphName, 'missing-glyph']
            )
          )
        }
      }

      for (const classId of getRuleClassReferences(rule)) {
        if (!classIds.has(classId)) {
          diagnostics.push(
            makeDiagnostic(
              'error',
              `Rule references missing glyph class "${classId}".`,
              { kind: 'rule', ruleId: rule.id },
              [rule.id, classId, 'missing-class']
            )
          )
        }
      }

      for (const nestedLookupId of getNestedLookupReferences(rule)) {
        if (!lookupIds.has(nestedLookupId)) {
          diagnostics.push(
            makeDiagnostic(
              'error',
              `Contextual rule references missing lookup "${nestedLookupId}".`,
              { kind: 'rule', ruleId: rule.id },
              [rule.id, nestedLookupId, 'missing-nested-lookup']
            )
          )
        }
      }

      if (rule.meta.dirty) {
        diagnostics.push(
          makeDiagnostic(
            'warning',
            'This auto-generated rule is dirty and should be reviewed.',
            { kind: 'rule', ruleId: rule.id },
            [rule.id, 'dirty']
          )
        )
      }
    }
  }

  for (const markClass of state.markClasses) {
    for (const mark of markClass.marks) {
      if (!glyphIds.has(mark.glyph)) {
        diagnostics.push(
          makeDiagnostic(
            'error',
            `Mark class "${markClass.name}" references missing glyph "${mark.glyph}".`,
            { kind: 'global' },
            [markClass.id, mark.glyph, 'missing-mark']
          )
        )
      }
      if (!Number.isFinite(mark.anchor.x) || !Number.isFinite(mark.anchor.y)) {
        diagnostics.push(
          makeDiagnostic(
            'error',
            `Mark class "${markClass.name}" has a non-finite anchor coordinate.`,
            { kind: 'global' },
            [markClass.id, mark.glyph, 'invalid-anchor']
          )
        )
      }
    }
  }

  if (state.unsupportedLookups.length > 0) {
    diagnostics.push(
      makeDiagnostic(
        'warning',
        'Some imported OpenType lookups are not editable or not representable. Rebuilding layout tables may remove them.',
        { kind: 'global' },
        ['unsupported-lookups']
      )
    )
  }

  if (
    state.fontFingerprint &&
    !sameFingerprint(state.fontFingerprint, createFontFingerprint(fontData))
  ) {
    diagnostics.push(
      makeDiagnostic(
        'warning',
        'The feature model was created for an earlier glyph order, cmap, or metrics state.',
        { kind: 'global' },
        ['font-fingerprint-mismatch']
      )
    )
  }

  return diagnostics
}
