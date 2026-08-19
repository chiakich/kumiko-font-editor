import { detectUfoSourceTrees } from 'src/lib/fontFormats/formatAdapter/ufoFormatAdapter'
import { detectGlyphsPackageSourceTrees } from 'src/lib/fontFormats/formatAdapter/glyphsPackageFormatAdapter'
import type { FormatDetection } from 'src/lib/fontFormats/formatAdapter/types'

// One place that knows which source formats Kumiko can open. Import and sync
// both ask here rather than testing extensions themselves.
export const detectSourceFormats = (
  paths: readonly string[]
): FormatDetection[] => [
  ...detectUfoSourceTrees(paths),
  ...detectGlyphsPackageSourceTrees(paths),
]

export const hasSupportedSourceFormat = (paths: readonly string[]) =>
  detectSourceFormats(paths).length > 0
