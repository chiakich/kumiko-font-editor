import { compileFontWithFeatures } from 'src/lib/openTypeFeatures/compileFontWithFeatures'
import { needsOpenTypeFeatureCompilationForBinaryExport } from 'src/lib/openTypeFeatures/exportPolicy'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures/types'

const DEFAULT_AFFECTED_TABLES: Array<'GSUB' | 'GPOS' | 'GDEF'> = [
  'GSUB',
  'GPOS',
  'GDEF',
]

export const compileManagedFontFeatures = async (
  inputFontBuffer: ArrayBuffer,
  openTypeFeatures: OpenTypeFeaturesState | undefined
) => {
  if (
    !openTypeFeatures ||
    !needsOpenTypeFeatureCompilationForBinaryExport(openTypeFeatures)
  ) {
    return inputFontBuffer
  }

  const generated = generateFea(openTypeFeatures)
  const result = await compileFontWithFeatures(
    inputFontBuffer,
    generated.text,
    { affectedTables: DEFAULT_AFFECTED_TABLES },
    generated.sourceMap
  )

  return result.fontBuffer
}
