import { compileFontWithFeatures } from '@/lib/openTypeFeatures/openTypeFeatureCompilerWorkerClient'
import { needsOpenTypeFeatureCompilationForBinaryExport } from '@/lib/openTypeFeatures/exportPolicy'
import { generateFea } from '@/lib/openTypeFeatures/generateFea'
import {
  synthesizeKerningFea,
  type SynthesizeKerningInput,
} from '@/lib/openTypeFeatures/synthesizeKerning'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures/types'

const DEFAULT_AFFECTED_TABLES: Array<'GSUB' | 'GPOS' | 'GDEF'> = [
  'GSUB',
  'GPOS',
  'GDEF',
]

export const compileManagedFontFeatures = async (
  inputFontBuffer: ArrayBuffer,
  openTypeFeatures: OpenTypeFeaturesState | undefined,
  // Project kerning data (the UFO kerning.plist model). When present it is
  // synthesized into a kern feature, so panel-edited kerning reaches the
  // binary without a manual conversion step.
  kerning?: Omit<SynthesizeKerningInput, 'state'>
) => {
  // preserve-compiled-layout-tables means exactly that: no rebuild, so no
  // kern injection either — the imported GPOS stays byte-identical.
  const preservesCompiledTables =
    openTypeFeatures?.exportPolicy === 'preserve-compiled-layout-tables'
  const syntheticKern =
    kerning && !preservesCompiledTables
      ? synthesizeKerningFea({ ...kerning, state: openTypeFeatures })
      : null
  const needsFeatureCompile = Boolean(
    openTypeFeatures &&
    needsOpenTypeFeatureCompilationForBinaryExport(openTypeFeatures)
  )
  if (!needsFeatureCompile && !syntheticKern) {
    return inputFontBuffer
  }

  const generated = openTypeFeatures
    ? generateFea(openTypeFeatures)
    : { text: '', sourceMap: { entries: [] } }
  // Synthetic kern is appended after the generated text so the source map's
  // line numbers stay valid.
  const feaText = [
    needsFeatureCompile ? generated.text : '',
    syntheticKern?.text ?? '',
  ]
    .filter(Boolean)
    .join('\n')
  const result = await compileFontWithFeatures(
    inputFontBuffer,
    feaText,
    { affectedTables: DEFAULT_AFFECTED_TABLES },
    generated.sourceMap
  )

  return result.fontBuffer
}
