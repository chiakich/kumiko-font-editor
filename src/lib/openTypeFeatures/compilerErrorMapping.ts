import { makeDiagnostic } from 'src/lib/openTypeFeatures/diagnostics'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures/feaAst'
import type { FeatureDiagnostic } from 'src/lib/openTypeFeatures/types'

type DiagnosticTarget = FeatureDiagnostic['target']

export interface CompilerErrorLocation {
  line: number
  column?: number
  message: string
}

const entrySpecificity = (entry: GeneratedFeaSourceMap['entries'][number]) => {
  if (entry.ruleId) {
    return 3
  }
  if (entry.lookupId) {
    return 2
  }
  if (entry.featureId) {
    return 1
  }
  return 0
}

const entrySpan = (entry: GeneratedFeaSourceMap['entries'][number]) =>
  entry.lineEnd - entry.lineStart

const targetFromEntry = (
  entry: GeneratedFeaSourceMap['entries'][number] | undefined
): DiagnosticTarget => {
  if (!entry) {
    return { kind: 'global' }
  }
  if (entry.ruleId) {
    return { kind: 'rule', ruleId: entry.ruleId }
  }
  if (entry.lookupId) {
    return { kind: 'lookup', lookupId: entry.lookupId }
  }
  if (entry.featureId) {
    return { kind: 'feature', featureId: entry.featureId }
  }
  return { kind: 'global' }
}

export const findFeaSourceMapEntryForLine = (
  sourceMap: GeneratedFeaSourceMap,
  line: number
) =>
  sourceMap.entries
    .filter((entry) => entry.lineStart <= line && line <= entry.lineEnd)
    .sort((left, right) => {
      const specificity = entrySpecificity(right) - entrySpecificity(left)
      if (specificity !== 0) {
        return specificity
      }
      return entrySpan(left) - entrySpan(right)
    })[0]

export const mapFeaLineToDiagnosticTarget = (
  sourceMap: GeneratedFeaSourceMap | undefined,
  line: number | undefined
): DiagnosticTarget => {
  if (!sourceMap || !line || !Number.isFinite(line)) {
    return { kind: 'global' }
  }

  return targetFromEntry(findFeaSourceMapEntryForLine(sourceMap, line))
}

const FONTTOOLS_LOCATION_PATTERNS = [
  /(?:^|\s)(?:[^:\s]+\.fea|<features>|generated\.fea):(\d+)(?::(\d+))?/i,
  /(?:^|\s)line\s+(\d+)(?:,\s*column\s+(\d+))?/i,
  /(?:^|\s)line\s+(\d+)(?::(\d+))?/i,
]

const firstNonEmptyLine = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

export const parseCompilerErrorLocations = (
  rawCompilerOutput: string
): CompilerErrorLocation[] => {
  const locations: CompilerErrorLocation[] = []

  rawCompilerOutput.split(/\r?\n/).forEach((line) => {
    for (const pattern of FONTTOOLS_LOCATION_PATTERNS) {
      const match = pattern.exec(line)
      if (!match) {
        continue
      }
      locations.push({
        line: Number(match[1]),
        column: match[2] ? Number(match[2]) : undefined,
        message: line.trim(),
      })
      return
    }
  })

  return locations
}

export const mapCompilerErrorsToDiagnostics = ({
  fallbackMessage,
  rawCompilerOutput,
  sourceMap,
}: {
  fallbackMessage: string
  rawCompilerOutput?: string
  sourceMap?: GeneratedFeaSourceMap
}): FeatureDiagnostic[] => {
  const locations = rawCompilerOutput
    ? parseCompilerErrorLocations(rawCompilerOutput)
    : []

  if (locations.length === 0) {
    return [
      makeDiagnostic(
        'error',
        firstNonEmptyLine(rawCompilerOutput ?? '') ?? fallbackMessage,
        { kind: 'global' },
        ['compiler', 'global']
      ),
    ]
  }

  return locations.map((location, index) =>
    makeDiagnostic(
      'error',
      location.message,
      mapFeaLineToDiagnosticTarget(sourceMap, location.line),
      ['compiler', `line-${location.line}`, `error-${index}`]
    )
  )
}
