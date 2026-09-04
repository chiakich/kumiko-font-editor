import { parseXmlTree, type XmlNode } from '@/lib/fontFormats/xmlTree'
import {
  resolveUfoTextStyle,
  UFOLIB_TEXT_STYLE,
  xmlDeclaration,
  type UfoTextStyle,
} from '@/lib/fontFormats/ufoTextStyle'

// Text content and attribute values escape different sets — matching what the
// producers do, so an apostrophe in a copyright string is not rewritten as
// &apos; and counted as a change.
export const escapeXmlText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const escapeXml = (value: string) =>
  escapeXmlText(value).replace(/"/g, '&quot;')

export const parseNumeric = (value: string | null | undefined) => {
  if (!value) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const parsePlistElement = (element: XmlNode): unknown => {
  const tagName = element.tag

  if (tagName === 'dict') {
    const result: Record<string, unknown> = {}
    const children = element.children
    for (let index = 0; index < children.length; index += 2) {
      const keyElement = children[index]
      const valueElement = children[index + 1]
      if (!keyElement || keyElement.tag !== 'key' || !valueElement) {
        continue
      }
      result[keyElement.text] = parsePlistElement(valueElement)
    }
    return result
  }

  if (tagName === 'array') {
    return element.children.map((child) => parsePlistElement(child))
  }

  if (tagName === 'integer' || tagName === 'real') {
    return parseNumeric(element.text) ?? 0
  }

  if (tagName === 'true') {
    return true
  }

  if (tagName === 'false') {
    return false
  }

  return element.text
}

export const parseXmlPlist = (
  text: string
): Record<string, unknown> | unknown[] => {
  const root = parseXmlTree(text, 'plist')
  const plistChild = root.children[0] ?? root
  return parsePlistElement(plistChild) as Record<string, unknown> | unknown[]
}

export const serializePlistValue = (
  value: unknown,
  indentLevel = 1,
  style: UfoTextStyle = UFOLIB_TEXT_STYLE
): string => {
  const indent = style.plistIndent.repeat(indentLevel)
  const childIndent = style.plistIndent.repeat(indentLevel + 1)
  // Plists keep `<false/>` even in sources whose glifs pad it to `<false />`.
  const selfClose = '/>'

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}<array${selfClose}`
    }
    return [
      `${indent}<array>`,
      ...value.map((item) => serializePlistValue(item, indentLevel + 1, style)),
      `${indent}</array>`,
    ].join('\n')
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined && entryValue !== null
    )
    if (entries.length === 0) {
      return `${indent}<dict${selfClose}`
    }
    return [
      `${indent}<dict>`,
      ...entries.flatMap(([key, entryValue]) => [
        `${childIndent}<key>${escapeXmlText(key)}</key>`,
        serializePlistValue(entryValue, indentLevel + 1, style),
      ]),
      `${indent}</dict>`,
    ].join('\n')
  }

  if (typeof value === 'boolean') {
    return `${indent}<${value ? 'true' : 'false'}${selfClose}`
  }

  if (typeof value === 'number') {
    return `${indent}<${Number.isInteger(value) ? 'integer' : 'real'}>${value}</${Number.isInteger(value) ? 'integer' : 'real'}>`
  }

  const text = escapeXmlText(String(value ?? ''))
  return `${indent}<string>${style.escapeQuotesInText ? text.replace(/"/g, '&quot;') : text}</string>`
}

export const serializeXmlPlist = (
  value: unknown,
  textStyle?: Partial<UfoTextStyle> | null
) => {
  const style = resolveUfoTextStyle(textStyle)
  return `${xmlDeclaration(style)}
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${serializePlistValue(value, style.plistIndentRoot ? 1 : 0, style)}
</plist>
`
}
