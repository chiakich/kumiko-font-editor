import 'fake-indexeddb/auto'

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { unzipSync, strFromU8 } from 'fflate'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import { exportFontDataAsUfoZip } from 'src/lib/fontFormats/fontUfoZipExport'
import {
  importUfoWorkspaceEntries,
  parseGlifText,
  serializeGlifRecord,
  type UfoWorkspaceEntry,
} from 'src/lib/fontFormats/ufoFormat'
import type { UfoGlyphRecord } from 'src/lib/fontFormats/ufoTypes'
import type { FontData, GlyphData } from 'src/store'
import { getGlyphLayer } from 'src/store/glyphLayer'
const layerOf = (g: GlyphData) => getGlyphLayer(g, null)!

const testWindow = new Window()
globalThis.DOMParser ??= testWindow.DOMParser as typeof globalThis.DOMParser
globalThis.Node ??= testWindow.Node as typeof globalThis.Node
globalThis.Element ??= testWindow.Element as typeof globalThis.Element

// OpenSourceFont-Light.ufo (OFL) — see test/fixtures/ufo/OFL.txt.
// happy-dom makes import.meta.url an http URL, so resolve from cwd (project
// root under vitest) instead of a file:// URL.
const UFO_ROOT = join(process.cwd(), 'test/fixtures/ufo')
const UFO_NAME = 'OpenSourceFont-Light.ufo'

const TEXT_EXT = /\.(plist|glif|fea)$/

const readUfoEntries = async (): Promise<UfoWorkspaceEntry[]> => {
  const entries: UfoWorkspaceEntry[] = []
  const walk = async (relDir: string) => {
    const absDir = join(UFO_ROOT, relDir)
    for (const dirent of await readdir(absDir, { withFileTypes: true })) {
      const rel = `${relDir}${dirent.name}`
      if (dirent.isDirectory()) {
        await walk(`${rel}/`)
      } else if (TEXT_EXT.test(dirent.name)) {
        const text = await readFile(join(UFO_ROOT, rel), 'utf8')
        entries.push({ relativePath: rel, text })
      }
    }
  }
  await walk(`${UFO_NAME}/`)
  return entries
}

const zipToEntries = (bytes: Uint8Array): UfoWorkspaceEntry[] => {
  const files = unzipSync(bytes)
  return Object.entries(files)
    .filter(([path]) => TEXT_EXT.test(path))
    .map(([path, data]) => ({ relativePath: path, text: strFromU8(data) }))
}

const importWorkspace = (entries: UfoWorkspaceEntry[], folderName: string) =>
  importUfoWorkspaceEntries(entries, {
    title: 'OpenSourceFont',
    sourceFolderName: folderName,
  })

describe('UFO import → export → reimport round-trip', () => {
  it('preserves the full glyph set, order, metrics, and contours', async () => {
    const entries = await readUfoEntries()
    const first = await importWorkspace(entries, UFO_NAME)

    const blob = exportFontDataAsUfoZip({
      fontData: first.fontData,
      projectId: first.project.projectId,
      projectTitle: 'OpenSourceFont',
      selectedLayerId: null,
    })
    const zipBytes = new Uint8Array(await blob.arrayBuffer())
    const reentries = zipToEntries(zipBytes)
    const second = await importWorkspace(reentries, 'OpenSourceFont.ufo')

    const before: FontData = first.fontData
    const after: FontData = second.fontData

    expect(Object.keys(after.glyphs).length).toBe(
      Object.keys(before.glyphs).length
    )
    expect(after.glyphOrder).toEqual(before.glyphOrder)
    expect(after.unitsPerEm).toBe(before.unitsPerEm)

    for (const [id, beforeGlyph] of Object.entries(before.glyphs)) {
      const afterGlyph = after.glyphs[id]
      expect(afterGlyph, `glyph ${id} missing after round-trip`).toBeDefined()
      expect(afterGlyph.unicodes, `unicodes for ${id}`).toEqual(
        beforeGlyph.unicodes
      )
      expect(layerOf(afterGlyph).metrics.width, `advance for ${id}`).toBe(
        layerOf(beforeGlyph).metrics.width
      )
      expect(layerOf(afterGlyph).paths.length, `contour count for ${id}`).toBe(
        layerOf(beforeGlyph).paths.length
      )
      layerOf(beforeGlyph).paths.forEach((path, pathIndex) => {
        const afterPath = layerOf(afterGlyph).paths[pathIndex]
        expect(afterPath.closed, `${id} closed@${pathIndex}`).toBe(path.closed)
        expect(afterPath.nodes, `${id} nodes@${pathIndex}`).toEqual(path.nodes)
      })
    }
  })

  it('keeps kerning and feature sources in the exported UFO', async () => {
    const entries = await readUfoEntries()
    const first = await importWorkspace(entries, UFO_NAME)
    const blob = exportFontDataAsUfoZip({
      fontData: first.fontData,
      projectId: first.project.projectId,
      projectTitle: 'OpenSourceFont',
      selectedLayerId: null,
    })
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const paths = Object.keys(files)
    expect(paths.some((p) => p.endsWith('.ufo/kerning.plist'))).toBe(true)
    expect(paths.some((p) => p.endsWith('.ufo/features.fea'))).toBe(true)
    expect(paths.some((p) => p.endsWith('.ufo/glyphs/contents.plist'))).toBe(
      true
    )
  })
})

// GLIF parse ↔ serialize symmetry for outline shapes the all-straight-line
// fixture font does not exercise: cubic/quadratic curves, smooth flags, open
// contours, components with a 2x2 matrix, and anchors.
describe('GLIF parse ↔ serialize round-trip', () => {
  const SAMPLE_GLIF = `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="sample" format="2">
  <advance width="650"/>
  <unicode hex="0041"/>
  <outline>
    <contour>
      <point x="100" y="0" type="line"/>
      <point x="100" y="200"/>
      <point x="300" y="200"/>
      <point x="300" y="0" type="curve" smooth="yes"/>
      <point x="200" y="-50" type="qcurve"/>
    </contour>
    <contour>
      <point x="0" y="500" type="move"/>
      <point x="100" y="600" type="line"/>
    </contour>
    <component base="acute" xScale="1.0" xyScale="0.2" yxScale="0" yScale="1.0" xOffset="120" yOffset="40"/>
  </outline>
  <anchor x="250" y="700" name="top"/>
</glyph>`

  const augment = (
    parsed: ReturnType<typeof parseGlifText>
  ): UfoGlyphRecord => ({
    ...parsed,
    projectId: 'p',
    ufoId: 'u',
    layerId: 'public.default',
    dirty: false,
    dirtyIndex: 0,
    updatedAt: 0,
  })

  it('preserves contours, curve types, components, and anchors', () => {
    const first = parseGlifText(SAMPLE_GLIF, 'sample.glif')
    const serialized = serializeGlifRecord(augment(first))
    const second = parseGlifText(serialized, 'sample.glif')

    expect(second.unicodes).toEqual(first.unicodes)
    expect(second.advance.width).toBe(first.advance.width)
    expect(second.contours).toEqual(first.contours)
    expect(second.components).toEqual(first.components)
    expect(second.anchors).toEqual(first.anchors)

    // Spot-check the parse itself captured the interesting shapes.
    const [closed, open] = first.contours
    expect(closed.points.map((p) => p.type)).toEqual([
      'line',
      'offcurve',
      'offcurve',
      'curve',
      'qcurve',
    ])
    expect(closed.points[3].smooth).toBe(true)
    expect(open.points[0].type).toBe('move')
    expect(first.components[0]).toMatchObject({
      base: 'acute',
      xyScale: 0.2,
      xOffset: 120,
      yOffset: 40,
    })
    expect(first.anchors[0]).toMatchObject({ x: 250, y: 700, name: 'top' })
  })
})
