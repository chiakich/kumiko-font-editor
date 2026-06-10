// Extract per-character part composition from the GlyphWiki dump.
//
// For every encoded character whose GlyphWiki glyph is a pure composition of
// part references (KAGE 99-lines), this emits the component character, its
// effective bounding box on the 200x200 design canvas, and the GlyphWiki
// variant suffix. The effective box is the part's recursive stroke bbox
// mapped through the placement box, so a left-radical 火 reports the box it
// actually occupies in the composed glyph.
//
// Output format (tab-separated, one line per character):
//   <char>\t<part char>:<x1>,<y1>,<x2>,<y2>[:<variant suffix>]\t...
//
// Usage:
//   node scripts/build-glyphwiki-data.mjs <path-to-dump_newest_only.txt>
// Download the dump first:
//   curl -A Mozilla -o dump.tar.gz https://glyphwiki.org/dump.tar.gz && tar xzf dump.tar.gz
//
// GlyphWiki data is free for any use including modification, redistribution
// and commercial use (https://glyphwiki.org/wiki/GlyphWiki:License).

import { createReadStream, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'glyphwiki',
  'composition.txt'
)

const GLYPH_NAME_PATTERN = /^u([0-9a-f]{4,6})(?:-(.+))?$/
const IDC_MIN = 0x2ff0
const IDC_MAX = 0x2fff
const MAX_DEPTH = 12

const dumpPath = process.argv[2]
if (!dumpPath) {
  console.error(
    'Usage: node scripts/build-glyphwiki-data.mjs <dump_newest_only.txt>'
  )
  process.exit(1)
}

const stripVersion = (name) => name.split('@')[0]

// Limit output to Han-related targets; the dump also composes enclosed
// alphanumerics, emoji tags, etc. that are useless for CJK contribution.
const isHanCodePoint = (codePoint) =>
  (codePoint >= 0x2e80 && codePoint <= 0x2fdf) ||
  (codePoint >= 0x31c0 && codePoint <= 0x31ef) ||
  (codePoint >= 0x3400 && codePoint <= 0x9fff) ||
  (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
  (codePoint >= 0x20000 && codePoint <= 0x3ffff)

const parsePartName = (name) => {
  const match = stripVersion(name).match(GLYPH_NAME_PATTERN)
  if (!match) {
    return null
  }
  const codePoint = Number.parseInt(match[1], 16)
  if (
    !Number.isFinite(codePoint) ||
    (codePoint >= IDC_MIN && codePoint <= IDC_MAX) ||
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    codePoint >= 0xf0000
  ) {
    return null
  }
  return {
    char: String.fromCodePoint(codePoint),
    suffix: match[2] ?? null,
  }
}

const parse99Line = (fields) => {
  if (fields.length < 8) {
    return null
  }
  const x1 = Number(fields[3])
  const y1 = Number(fields[4])
  const x2 = Number(fields[5])
  const y2 = Number(fields[6])
  const name = stripVersion(fields[7] ?? '')
  if (![x1, y1, x2, y2].every(Number.isFinite) || !name) {
    return null
  }
  return { x1, y1, x2, y2, name }
}

const mergeBounds = (bounds, x, y) => {
  bounds.xMin = Math.min(bounds.xMin, x)
  bounds.yMin = Math.min(bounds.yMin, y)
  bounds.xMax = Math.max(bounds.xMax, x)
  bounds.yMax = Math.max(bounds.yMax, y)
}

const main = async () => {
  const glyphData = new Map()
  const reader = createInterface({
    input: createReadStream(dumpPath, 'utf-8'),
    crlfDelay: Infinity,
  })

  for await (const line of reader) {
    const columns = line.split('|')
    if (columns.length < 3) {
      continue
    }
    const name = columns[0].trim()
    const data = columns.slice(2).join('|').trim()
    if (name && data && !name.includes('_')) {
      glyphData.set(name, data)
    }
  }
  console.log(`Loaded ${glyphData.size.toLocaleString()} glyph records`)

  const bboxCache = new Map()

  // Approximate drawn bbox from stroke control points; exact rendering is
  // unnecessary for layout hints.
  const computeBBox = (name, depth = 0, visiting = new Set()) => {
    if (bboxCache.has(name)) {
      return bboxCache.get(name)
    }
    if (depth > MAX_DEPTH || visiting.has(name)) {
      return null
    }
    const data = glyphData.get(name)
    if (!data) {
      return null
    }

    visiting.add(name)
    const bounds = {
      xMin: Infinity,
      yMin: Infinity,
      xMax: -Infinity,
      yMax: -Infinity,
    }

    for (const stroke of data.split('$')) {
      const fields = stroke.split(':')
      if (fields[0] === '99') {
        const part = parse99Line(fields)
        if (!part) {
          continue
        }
        const partBounds = computeBBox(part.name, depth + 1, visiting)
        if (!partBounds) {
          continue
        }
        const scaleX = (part.x2 - part.x1) / 200
        const scaleY = (part.y2 - part.y1) / 200
        mergeBounds(
          bounds,
          part.x1 + partBounds.xMin * scaleX,
          part.y1 + partBounds.yMin * scaleY
        )
        mergeBounds(
          bounds,
          part.x1 + partBounds.xMax * scaleX,
          part.y1 + partBounds.yMax * scaleY
        )
      } else {
        for (let index = 3; index + 1 < fields.length; index += 2) {
          const x = Number(fields[index])
          const y = Number(fields[index + 1])
          if (Number.isFinite(x) && Number.isFinite(y)) {
            mergeBounds(bounds, x, y)
          }
        }
      }
    }
    visiting.delete(name)

    const result = Number.isFinite(bounds.xMin) ? bounds : null
    bboxCache.set(name, result)
    return result
  }

  const isFullCanvasAlias = (part) =>
    part.x1 <= 10 && part.y1 <= 10 && part.x2 >= 190 && part.y2 >= 190

  const resolveAlias = (name, depth = 0) => {
    const data = glyphData.get(name)
    if (!data || depth > MAX_DEPTH) {
      return null
    }
    const strokes = data.split('$')
    if (strokes.length === 1) {
      const fields = strokes[0].split(':')
      if (fields[0] === '99') {
        const part = parse99Line(fields)
        if (part && isFullCanvasAlias(part)) {
          return resolveAlias(part.name, depth + 1)
        }
        return null
      }
    }
    return { name, data, strokes }
  }

  const lines = []
  let candidateCount = 0

  for (const name of glyphData.keys()) {
    const nameMatch = name.match(/^u([0-9a-f]{4,6})$/)
    if (!nameMatch) {
      continue
    }
    const target = parsePartName(name)
    if (!target || !isHanCodePoint(target.char.codePointAt(0))) {
      continue
    }

    const resolved = resolveAlias(name)
    if (!resolved || resolved.strokes.length < 2) {
      continue
    }

    const parts = []
    let isPureComposition = true
    for (const stroke of resolved.strokes) {
      const fields = stroke.split(':')
      if (fields[0] !== '99') {
        isPureComposition = false
        break
      }
      const placement = parse99Line(fields)
      const part = placement ? parsePartName(placement.name) : null
      if (!placement || !part || part.char === target.char) {
        isPureComposition = false
        break
      }
      const partBounds = computeBBox(placement.name)
      if (!partBounds) {
        isPureComposition = false
        break
      }
      const scaleX = (placement.x2 - placement.x1) / 200
      const scaleY = (placement.y2 - placement.y1) / 200
      const box = [
        placement.x1 + partBounds.xMin * scaleX,
        placement.y1 + partBounds.yMin * scaleY,
        placement.x1 + partBounds.xMax * scaleX,
        placement.y1 + partBounds.yMax * scaleY,
      ].map(Math.round)
      parts.push(
        `${part.char}:${box.join(',')}${part.suffix ? `:${part.suffix}` : ''}`
      )
    }

    if (!isPureComposition || parts.length < 2) {
      continue
    }
    lines.push(`${target.char}\t${parts.join('\t')}`)
    candidateCount += 1
  }

  lines.sort()
  writeFileSync(OUTPUT_PATH, `${lines.join('\n')}\n`, 'utf-8')
  console.log(
    `Wrote ${candidateCount.toLocaleString()} compositions to ${OUTPUT_PATH}`
  )
}

await main()
