import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  exportFontAsBinary,
  importBinaryFontFile,
} from 'src/lib/fontBinaryFormat'
import type { FontData, GlyphData } from 'src/store'

// Public Sans Regular (CFF/OTF, OFL) — see test/fixtures/otf/OFL.txt.
//
// Scope: this verifies the outline + metrics round-trip
// (importBinaryFontFile → exportFontAsBinary → importBinaryFontFile).
// It deliberately does NOT cover OpenType feature (GSUB/GPOS) preservation:
// feature compilation runs in a Web Worker that is unavailable under Node, so
// openTypeFeatures is dropped before export. Treat this as glyph-outline
// fidelity, not full font fidelity.
const FIXTURE_URL = new URL(
  '../fixtures/otf/PublicSans-Regular.otf',
  import.meta.url
)

const loadFixtureFile = async () => {
  const buffer = await readFile(fileURLToPath(FIXTURE_URL))
  return new File([buffer], 'PublicSans-Regular.otf', { type: 'font/otf' })
}

const codePointOf = (unicode: GlyphData['unicode']) =>
  unicode != null ? Number.parseInt(unicode, 16) : undefined

// exportFontAsBinary follows OpenType best practice and does not encode C0
// controls (< U+0020) or U+007F in the cmap; the glyph is kept but unencoded,
// so its unicode comes back null after the round-trip. (Public Sans ships a
// uni0000 control glyph.)
const isControlGlyph = (glyph: GlyphData) => {
  const codePoint = codePointOf(glyph.unicode)
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
}

// Drop openTypeFeatures so export stays a pure opentype.js serialization;
// glyph outlines and metrics are unaffected.
const dropFeatures = (fontData: FontData): FontData => ({
  ...fontData,
  openTypeFeatures: undefined,
})

const reimport = async (blob: Blob, name: string) => {
  const buffer = await blob.arrayBuffer()
  return importBinaryFontFile(new File([buffer], name, { type: 'font/otf' }))
}

const nodeCount = (glyph: GlyphData) =>
  glyph.paths.reduce((sum, path) => sum + path.nodes.length, 0)

describe('OTF import → export round-trip', () => {
  let prepared: FontData
  let result: FontData

  beforeAll(async () => {
    const first = await importBinaryFontFile(await loadFixtureFile())
    prepared = dropFeatures(first.fontData)
    const blob = await exportFontAsBinary(prepared, 'otf')
    result = (await reimport(blob, 'roundtrip.otf')).fontData
  })

  it('preserves the glyph set and order', () => {
    expect(Object.keys(result.glyphs).length).toBe(
      Object.keys(prepared.glyphs).length
    )
    expect(result.glyphOrder?.[0]).toBe('.notdef')
    expect(result.glyphOrder).toEqual(prepared.glyphOrder)
  })

  it('preserves font-level metrics', () => {
    expect(result.unitsPerEm).toBe(prepared.unitsPerEm)
  })

  it('keeps control-character glyphs but drops their cmap mapping', () => {
    // Public Sans ships a uni0000 control glyph. Industry practice (SIL FDBP /
    // fontbakery) is to keep the glyph but not encode it; export must not throw.
    const controls = Object.values(prepared.glyphs).filter(isControlGlyph)
    expect(controls.length).toBeGreaterThan(0)
    for (const before of controls) {
      const after = result.glyphs[before.id]
      expect(after, `control glyph ${before.id} dropped`).toBeDefined()
      expect(after.unicode, `${before.id} should be unencoded`).toBeNull()
    }
  })

  it('preserves unicode, advance width, and node count for every glyph', () => {
    for (const before of Object.values(prepared.glyphs)) {
      const after = result.glyphs[before.id]
      expect(after, `glyph ${before.id} missing after round-trip`).toBeDefined()
      // Control glyphs are intentionally unencoded; their mapping is covered above.
      if (!isControlGlyph(before)) {
        expect(after.unicode, `unicode for ${before.id}`).toBe(before.unicode)
      }
      expect(after.metrics.width, `advance width for ${before.id}`).toBe(
        before.metrics.width
      )
      expect(nodeCount(after), `node count for ${before.id}`).toBe(
        nodeCount(before)
      )
    }
  })

  it('preserves exact contour coordinates for sampled glyphs', () => {
    const samples = ['A', 'V', 'o', 'period', 'eight', 'g', 'Q']
    const present = samples.filter((id) => prepared.glyphs[id])
    expect(present.length).toBeGreaterThan(0)

    for (const id of present) {
      const before = prepared.glyphs[id]
      const after = result.glyphs[id]
      expect(after.paths.length, `contour count for ${id}`).toBe(
        before.paths.length
      )
      before.paths.forEach((path, pathIndex) => {
        const afterPath = after.paths[pathIndex]
        expect(afterPath.closed).toBe(path.closed)
        path.nodes.forEach((node, nodeIndex) => {
          const afterNode = afterPath.nodes[nodeIndex]
          // CFF integer coordinates survive a round-trip exactly; allow a
          // 1-unit slack only as defense against incidental rounding.
          expect(
            Math.abs(afterNode.x - node.x),
            `${id} x@${nodeIndex}`
          ).toBeLessThanOrEqual(1)
          expect(
            Math.abs(afterNode.y - node.y),
            `${id} y@${nodeIndex}`
          ).toBeLessThanOrEqual(1)
          expect(afterNode.type, `${id} type@${nodeIndex}`).toBe(node.type)
        })
      })
    }
  })
})
