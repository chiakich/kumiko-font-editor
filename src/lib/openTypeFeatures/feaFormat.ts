import type { GlyphSelector, ValueRecord } from 'src/lib/openTypeFeatures/types'

export const formatGlyphSelector = (selector: GlyphSelector) =>
  selector.kind === 'class' ? selector.classId : selector.glyph

export const formatGlyphList = (glyphs: string[]) => `[${glyphs.join(' ')}]`

export const formatAnchor = (anchor: { x: number; y: number }) =>
  `<anchor ${Math.round(anchor.x)} ${Math.round(anchor.y)}>`

export const formatValueRecord = (value: ValueRecord | undefined) => {
  if (!value) return ''
  const values = [
    value.xPlacement ?? 0,
    value.yPlacement ?? 0,
    value.xAdvance ?? 0,
    value.yAdvance ?? 0,
  ]
  if (
    values[0] === 0 &&
    values[1] === 0 &&
    values[3] === 0 &&
    values[2] !== 0
  ) {
    return String(Math.round(values[2]))
  }
  return `<${values.map((entry) => Math.round(entry)).join(' ')}>`
}
