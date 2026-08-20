// A DOM-free XML reader, scoped to what UFO files actually contain: elements,
// attributes, text and the five predefined entities plus numeric references.
// DOMParser is unavailable in a worker, and pulling in the remote side of a sync
// (parsing tens of thousands of .glif files) has no business on the main thread.
// This also drops the DOM allocation per file, which is most of the parse cost.

export interface XmlNode {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
  // Concatenated text of this element, entities already resolved. Elements in
  // UFO files never mix text and child elements, so one string is enough.
  text: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const decodeEntities = (value: string) => {
  if (!value.includes('&')) {
    return value
  }
  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, body: string) => {
      if (body.startsWith('#')) {
        const codePoint = body.startsWith('#x')
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : match
      }
      return ENTITIES[body] ?? match
    }
  )
}

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g

const parseAttributes = (raw: string) => {
  const attrs: Record<string, string> = {}
  if (!raw.trim()) {
    return attrs
  }
  for (const match of raw.matchAll(ATTRIBUTE)) {
    attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? '')
  }
  return attrs
}

// Skips a prolog construct — declaration, DOCTYPE, comment or processing
// instruction — returning the index just past it.
const skipProlog = (text: string, from: number) => {
  if (text.startsWith('<!--', from)) {
    const end = text.indexOf('-->', from)
    return end === -1 ? text.length : end + 3
  }
  if (text.startsWith('<?', from)) {
    const end = text.indexOf('?>', from)
    return end === -1 ? text.length : end + 2
  }
  if (text.startsWith('<!', from)) {
    // DOCTYPE may carry a bracketed internal subset; UFO files never do, but
    // stopping at the first '>' would still be wrong if one appeared.
    let depth = 0
    for (let index = from; index < text.length; index += 1) {
      const char = text[index]
      if (char === '[') {
        depth += 1
      } else if (char === ']') {
        depth -= 1
      } else if (char === '>' && depth <= 0) {
        return index + 1
      }
    }
    return text.length
  }
  return from
}

export const parseXmlTree = (text: string, context: string): XmlNode => {
  const stack: XmlNode[] = []
  let root: XmlNode | null = null
  let index = 0

  while (index < text.length) {
    const open = text.indexOf('<', index)
    if (open === -1) {
      break
    }

    if (stack.length > 0) {
      const chunk = text.slice(index, open)
      if (chunk) {
        stack[stack.length - 1].text += decodeEntities(chunk)
      }
    }

    const skipped = skipProlog(text, open)
    if (skipped !== open) {
      index = skipped
      continue
    }

    if (text.startsWith('</', open)) {
      const end = text.indexOf('>', open)
      if (end === -1) {
        throw new Error(`Malformed XML: ${context}`)
      }
      const tag = text.slice(open + 2, end).trim()
      const current = stack.pop()
      if (!current || current.tag !== tag) {
        throw new Error(`Malformed XML: ${context}`)
      }
      index = end + 1
      continue
    }

    const end = text.indexOf('>', open)
    if (end === -1) {
      throw new Error(`Malformed XML: ${context}`)
    }
    const selfClosing = text[end - 1] === '/'
    const inner = text.slice(open + 1, selfClosing ? end - 1 : end)
    const nameEnd = inner.search(/[\s/]/)
    const tag = (nameEnd === -1 ? inner : inner.slice(0, nameEnd)).trim()
    if (!tag) {
      throw new Error(`Malformed XML: ${context}`)
    }
    const node: XmlNode = {
      tag,
      attrs: parseAttributes(nameEnd === -1 ? '' : inner.slice(nameEnd)),
      children: [],
      text: '',
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(node)
    } else if (root) {
      throw new Error(`Malformed XML: ${context}`)
    } else {
      root = node
    }
    if (!selfClosing) {
      stack.push(node)
    }
    index = end + 1
  }

  if (!root || stack.length > 0) {
    throw new Error(`Malformed XML: ${context}`)
  }
  return root
}

export const childrenNamed = (node: XmlNode | null, tag: string) =>
  node ? node.children.filter((child) => child.tag === tag) : []

export const firstChildNamed = (node: XmlNode | null, tag: string) =>
  node?.children.find((child) => child.tag === tag) ?? null

// Depth-first search, for the few places that want an element anywhere below.
export const findDescendant = (node: XmlNode, tag: string): XmlNode | null => {
  if (node.tag === tag) {
    return node
  }
  for (const child of node.children) {
    const found = findDescendant(child, tag)
    if (found) {
      return found
    }
  }
  return null
}
