import { parseOpenStep } from 'src/lib/openstepParser'
import { serializeOpenStepValue } from 'src/lib/glyphsExport'
import type { GlyphsDocument } from 'src/lib/glyphsDocument'
import type { GlyphData } from 'src/store'

interface GlyphBlockRange {
  start: number
  end: number
  glyphKeys: string[]
  text: string
}

const skipWhitespaceAndComments = (source: string, start: number) => {
  let index = start

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index + 2)
      index = end === -1 ? source.length : end + 1
      continue
    }

    break
  }

  return index
}

const findMatching = (
  source: string,
  start: number,
  openChar: string,
  closeChar: string
) => {
  let index = start
  let depth = 0
  let quote: '"' | "'" | null = null

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (quote) {
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === quote) {
        quote = null
      }
      index += 1
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index + 2)
      index = end === -1 ? source.length : end + 1
      continue
    }

    if (char === openChar) {
      depth += 1
    } else if (char === closeChar) {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }

    index += 1
  }

  return -1
}

const parseGlyphKeys = (glyphText: string) => {
  const keys = new Set<string>()

  const unicodeMatch = glyphText.match(/\bunicode\s*=\s*("?)([^";]+)\1\s*;/)
  if (unicodeMatch?.[2]) {
    keys.add(`uni${unicodeMatch[2]}`.toLowerCase())
  }

  const glyphNameMatch = glyphText.match(/\bglyphname\s*=\s*("?)([^";]+)\1\s*;/)
  if (glyphNameMatch?.[2]) {
    keys.add(glyphNameMatch[2].toLowerCase())
  }

  return [...keys]
}

const getGlyphLookupKeys = (glyph: GlyphData) => {
  const keys = new Set<string>()
  keys.add(glyph.id.toLowerCase())
  keys.add(glyph.name.toLowerCase())
  if (glyph.unicode) {
    keys.add(`uni${glyph.unicode}`.toLowerCase())
  }
  return [...keys]
}

const formatPointTuple = (x: number, y: number) =>
  `{${Math.round(x)}, ${Math.round(y)}}`

const formatTransformTuple = (
  scaleX: number,
  scaleY: number,
  x: number,
  y: number
) => `{${scaleX}, 0, 0, ${scaleY}, ${Math.round(x)}, ${Math.round(y)}}`

const findGlyphArrayRange = (source: string) => {
  const match = /glyphs\s*=/.exec(source)
  if (!match) {
    return null
  }

  const equalsIndex = match.index + match[0].length
  const arrayStart = skipWhitespaceAndComments(source, equalsIndex)
  if (source[arrayStart] !== '(') {
    return null
  }

  const arrayEnd = findMatching(source, arrayStart, '(', ')')
  if (arrayEnd < 0) {
    return null
  }

  return { start: arrayStart, end: arrayEnd }
}

const collectGlyphBlocks = (
  source: string,
  arrayStart: number,
  arrayEnd: number
) => {
  const blocks: GlyphBlockRange[] = []
  let cursor = arrayStart + 1

  while (cursor < arrayEnd) {
    cursor = skipWhitespaceAndComments(source, cursor)
    if (cursor >= arrayEnd) {
      break
    }

    if (source[cursor] !== '{') {
      cursor += 1
      continue
    }

    const blockEnd = findMatching(source, cursor, '{', '}')
    if (blockEnd < 0) {
      break
    }

    const text = source.slice(cursor, blockEnd + 1)
    blocks.push({
      start: cursor,
      end: blockEnd + 1,
      glyphKeys: parseGlyphKeys(text),
      text,
    })
    cursor = blockEnd + 1
  }

  return blocks
}

export const patchGlyphText = (
  glyph: GlyphData,
  rawGlyphText: string | undefined
) => {
  const rawGlyph = rawGlyphText
    ? (parseOpenStep(rawGlyphText) as Record<string, unknown>)
    : {
        glyphname: glyph.name,
        unicode: glyph.unicode ?? undefined,
        export: glyph.export === false ? 0 : 1,
        category: glyph.category ?? undefined,
        subCategory: glyph.subCategory ?? undefined,
        production: glyph.production ?? undefined,
        layers: [],
      }

  const doc = {
    glyphs: [rawGlyph],
  } as GlyphsDocument

  const glyphRecord = (doc.glyphs?.[0] ?? rawGlyph) as Record<string, unknown>
  glyphRecord.glyphname = glyph.name
  if (!rawGlyphText) {
    glyphRecord.unicode = glyph.unicode ?? undefined
  }
  glyphRecord.export = glyph.export === false ? 0 : 1
  glyphRecord.category = glyph.category ?? undefined
  glyphRecord.subCategory = glyph.subCategory ?? undefined
  glyphRecord.production = glyph.production ?? undefined

  const layers = Array.isArray(glyphRecord.layers)
    ? (glyphRecord.layers as Array<Record<string, unknown>>)
    : []
  const layerMap = new Map(
    layers.map((layer) => [
      String(layer.layerId ?? layer.associatedMasterId ?? layer.name ?? ''),
      layer,
    ])
  )

  const fallbackLayerId =
    glyph.activeLayerId ??
    (layers[0]
      ? String(
          layers[0].layerId ??
            layers[0].associatedMasterId ??
            layers[0].name ??
            'default'
        )
      : 'default')

  const editableLayerIds =
    glyph.layerOrder && glyph.layerOrder.length > 0
      ? glyph.layerOrder
      : [fallbackLayerId]

  const editableLayers = new Map(
    editableLayerIds.map((layerId) => {
      const explicitLayer = glyph.layers?.[layerId]
      if (explicitLayer) {
        return [layerId, explicitLayer] as const
      }

      return [
        layerId,
        {
          id: layerId,
          name: String(layerMap.get(layerId)?.name ?? layerId),
          associatedMasterId:
            (layerMap.get(layerId)?.associatedMasterId as
              | string
              | null
              | undefined) ?? layerId,
          paths: glyph.paths,
          components: glyph.components,
          componentRefs: glyph.componentRefs,
          anchors: glyph.anchors ?? [],
          guidelines: glyph.guidelines ?? [],
          metrics: glyph.metrics,
        },
      ] as const
    })
  )

  glyphRecord.layers = editableLayerIds
    .map((layerId) => {
      const glyphLayer = editableLayers.get(layerId)
      if (!glyphLayer) {
        return null
      }
      const layerRecord = { ...(layerMap.get(layerId) ?? {}) }
      layerRecord.layerId = glyphLayer.id
      layerRecord.associatedMasterId =
        glyphLayer.associatedMasterId ?? glyphLayer.id
      layerRecord.name = glyphLayer.name
      layerRecord.width = Math.round(glyphLayer.metrics.width)
      layerRecord.paths = glyphLayer.paths.map((path) => ({
        closed: path.closed ? 1 : 0,
        nodes: path.nodes.map((node, index) => {
          if (node.type === 'offcurve') {
            return `${Math.round(node.x)} ${Math.round(node.y)} OFFCURVE`
          }
          if (node.type === 'qcurve') {
            return `${Math.round(node.x)} ${Math.round(node.y)} QCURVE`
          }
          const previous = path.nodes[index - 1]
          const previous2 = path.nodes[index - 2]
          const keyword =
            previous?.type === 'offcurve' ||
            previous?.type === 'qcurve' ||
            previous2?.type === 'offcurve' ||
            previous2?.type === 'qcurve'
              ? 'CURVE'
              : 'LINE'
          return `${Math.round(node.x)} ${Math.round(node.y)} ${keyword}${node.type === 'smooth' ? ' SMOOTH' : ''}`
        }),
      }))
      layerRecord.components = glyphLayer.componentRefs.map((component) => ({
        name: component.glyphId,
        ...(component.scaleX === 1 &&
        component.scaleY === 1 &&
        component.rotation === 0 &&
        component.x === 0 &&
        component.y === 0
          ? {}
          : {
              transform: formatTransformTuple(
                component.scaleX,
                component.scaleY,
                component.x,
                component.y
              ),
            }),
      }))
      layerRecord.anchors = glyphLayer.anchors.map((anchor) => ({
        name: anchor.name,
        position: formatPointTuple(anchor.x, anchor.y),
      }))
      layerRecord.guides = glyphLayer.guidelines.map((guide) => ({
        position: formatPointTuple(guide.x, guide.y),
        angle: guide.angle,
        locked: guide.locked ? 1 : 0,
        ...(guide.name ? { name: guide.name } : {}),
      }))
      return layerRecord
    })
    .filter(Boolean)

  return serializeOpenStepValue(glyphRecord)
}

export const exportGlyphsByPatchingText = async (input: {
  rawText: string
  dirtyGlyphs: Record<string, GlyphData>
}) => {
  const arrayRange = findGlyphArrayRange(input.rawText)
  if (!arrayRange) {
    throw new Error('Unable to locate glyphs array in original .glyphs text')
  }

  const glyphBlocks = collectGlyphBlocks(
    input.rawText,
    arrayRange.start,
    arrayRange.end
  )
  const glyphBlockMap = new Map<string, GlyphBlockRange>()
  for (const block of glyphBlocks) {
    for (const key of block.glyphKeys) {
      if (!glyphBlockMap.has(key)) {
        glyphBlockMap.set(key, block)
      }
    }
  }

  const replacements = await Promise.all(
    Object.entries(input.dirtyGlyphs).map(([, glyph]) => {
      if (!glyph) {
        return null
      }

      const block = getGlyphLookupKeys(glyph)
        .map((key) => glyphBlockMap.get(key))
        .find((candidate): candidate is GlyphBlockRange => Boolean(candidate))
      const patched = patchGlyphText(glyph, block?.text)
      return {
        start: block?.start ?? arrayRange.end,
        end: block?.end ?? arrayRange.end,
        text: patched.trim(),
        append: !block,
      }
    })
  )

  const validReplacements = replacements.filter(
    (replacement): replacement is NonNullable<typeof replacement> =>
      Boolean(replacement)
  )

  if (validReplacements.some((replacement) => replacement.append)) {
    throw new Error(
      'Appending brand new glyphs is not supported yet in patch export'
    )
  }

  validReplacements.sort((a, b) => a.start - b.start)

  const parts: string[] = []
  let cursor = 0
  for (const replacement of validReplacements) {
    parts.push(input.rawText.slice(cursor, replacement.start))
    parts.push(replacement.text)
    cursor = replacement.end
  }
  parts.push(input.rawText.slice(cursor))

  return new Blob(parts, { type: 'text/plain;charset=utf-8' })
}
