import type {
  LookupFlagIR,
  ValueRecord,
  GlyphSelector,
} from 'src/lib/openTypeFeatures/types'

export const formatGlyphSelector = (selector: GlyphSelector) =>
  selector.kind === 'class' ? selector.classId : selector.glyph

export const formatGlyphList = (glyphs: string[]) => `[${glyphs.join(' ')}]`

export const escapeFeaNameString = (text: string) => {
  let escaped = ''
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code === 0x22 || code === 0x5c || code < 0x20 || code > 0x7e) {
      escaped += `\\${code.toString(16).padStart(4, '0')}`
    } else {
      escaped += text[index]
    }
  }
  return escaped
}

export const formatAnchor = (anchor: { x: number; y: number }) =>
  `<anchor ${Math.round(anchor.x)} ${Math.round(anchor.y)}>`

export const formatNullableAnchor = (
  anchor: { x: number; y: number } | undefined
) => (anchor ? formatAnchor(anchor) : '<anchor NULL>')

export const formatMarkAttachment = (attachment: {
  markClassName: string
  anchor: { x: number; y: number }
}) => `${formatAnchor(attachment.anchor)} mark ${attachment.markClassName}`

export const formatLookupFlags = (
  flags: LookupFlagIR,
  markAttachmentClassName?: string,
  markFilteringSetName?: string
) => {
  const flagNames = [
    flags.rightToLeft ? 'RightToLeft' : '',
    flags.ignoreBaseGlyphs ? 'IgnoreBaseGlyphs' : '',
    flags.ignoreLigatures ? 'IgnoreLigatures' : '',
    flags.ignoreMarks ? 'IgnoreMarks' : '',
  ].filter(Boolean)

  if (flags.markAttachmentType && markAttachmentClassName) {
    flagNames.push(`MarkAttachmentType ${markAttachmentClassName}`)
  }

  if (flags.useMarkFilteringSet && markFilteringSetName) {
    flagNames.push(`UseMarkFilteringSet ${markFilteringSetName}`)
  }

  return flagNames.length > 0 ? flagNames.join(' ') : '0'
}

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
