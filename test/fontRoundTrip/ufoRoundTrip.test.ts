import 'fake-indexeddb/auto'

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { unzipSync, strFromU8 } from 'fflate'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import {
  importUfoWorkspaceEntries,
  glyphRecordToLayerContent,
  pathToUfoContour,
  parseGlifText,
  serializeGlifRecord,
  serializeXmlPlist,
  type UfoWorkspaceEntry,
} from 'src/lib/fontFormats/ufoFormat'
import type { UfoGlyphRecord } from 'src/lib/fontFormats/ufoTypes'
import { getRawFeatureText } from 'src/lib/openTypeFeatures/rawFeatureSnippets'
import type { FontData, GlyphData } from 'src/store'
import { getGlyphLayer } from 'src/store/glyphLayer'
import { exportCanonicalFontDataAsUfoZip } from './canonicalUfoExportTestUtils'
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

    const blob = await exportCanonicalFontDataAsUfoZip({
      fontData: first.fontData,
      projectId: 'canonical-ufo-roundtrip-full',
      projectTitle: 'OpenSourceFont',
      projectSourceData: first.projectSourceData,
      projectSourceFormat: first.projectSourceFormat,
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
    const originalFeatureText = entries.find((entry) =>
      entry.relativePath.endsWith('/features.fea')
    )?.text
    expect(
      first.fontData.openTypeFeatures
        ? getRawFeatureText(first.fontData.openTypeFeatures)
        : undefined
    ).toBe(originalFeatureText?.trim())
    expect(first.fontData.openTypeFeatures?.sourceSections).toMatchObject([
      {
        id: 'source_raw_feature_text',
        kind: 'ufo-fea',
        origin: 'ufo-import',
        format: 'fea',
        stage: 'classified',
        status: 'classified',
        path: 'features.fea',
        textRef: 'rawFeatureText',
        preservationPolicy: 'editable-rebuild',
      },
    ])

    const blob = await exportCanonicalFontDataAsUfoZip({
      fontData: first.fontData,
      projectId: 'canonical-ufo-roundtrip-metadata',
      projectTitle: 'OpenSourceFont',
      projectSourceData: first.projectSourceData,
      projectSourceFormat: first.projectSourceFormat,
    })
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const paths = Object.keys(files)
    const exportedFeaturePath = paths.find((path) =>
      path.endsWith('.ufo/features.fea')
    )
    expect(paths.some((p) => p.endsWith('.ufo/kerning.plist'))).toBe(true)
    expect(exportedFeaturePath).toBeDefined()
    const exportedFeatureText = strFromU8(files[exportedFeaturePath!])
    expect(exportedFeatureText).toContain('Generated by Kumiko Font Editor.')
    expect(exportedFeatureText).not.toContain(
      '# OpenType features for Open Source Font - Light Master'
    )
    expect(exportedFeatureText).toContain('feature kern')
    expect(exportedFeatureText).toContain('pos A V -80;')
    expect(paths.some((p) => p.endsWith('.ufo/glyphs/contents.plist'))).toBe(
      true
    )
  })

  it('imports GLIF images as canonical layer data', async () => {
    let injected = false
    const entries = (await readUfoEntries()).map((entry) => {
      if (injected || !entry.relativePath.endsWith('.glif')) {
        return entry
      }
      injected = true
      return {
        ...entry,
        text: entry.text.replace(
          '<outline>',
          '<image fileName="sketch.png" xScale="1.2" yScale="0.8" xOffset="12" yOffset="34" color="0.1,0.2,0.3,0.4"/>\n  <anchor x="1" y="2" name="colorAnchor" color="0.2,0.3,0.4,0.5"/>\n  <outline>'
        ),
      }
    })
    const imported = await importWorkspace(entries, UFO_NAME)
    const glyphWithImage = Object.values(imported.fontData.glyphs).find(
      (glyph) => layerOf(glyph).image
    )

    expect(glyphWithImage).toBeDefined()
    expect(layerOf(glyphWithImage!).image).toMatchObject({
      fileName: 'sketch.png',
      xScale: 1.2,
      yScale: 0.8,
      xOffset: 12,
      yOffset: 34,
      color: [0.1, 0.2, 0.3, 0.4],
    })
    expect(
      layerOf(glyphWithImage!).anchors.find(
        (anchor) => anchor.name === 'colorAnchor'
      )?.color
    ).toEqual([0.2, 0.3, 0.4, 0.5])
    expect(layerOf(glyphWithImage!).sourceData?.ufo).not.toHaveProperty('image')
  })

  it('folds UFO background layers into canonical layer background and re-emits them', async () => {
    const entries = await readUfoEntries()
    const firstGlif = entries.find((entry) =>
      entry.relativePath.endsWith('.glif')
    )
    expect(firstGlif).toBeDefined()
    const fileName = firstGlif!.relativePath.split('/').pop() ?? 'A.glif'
    const glyphName = parseGlifText(firstGlif!.text, fileName).glyphName
    const backgroundGlif = `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="${glyphName}" format="2">
  <advance width="500"/>
  <outline>
    <contour>
      <point x="10" y="20" type="move"/>
      <point x="110" y="20" type="line"/>
      <point x="110" y="120" type="line"/>
    </contour>
  </outline>
</glyph>`
    const withBackground = entries.filter(
      (entry) =>
        !entry.relativePath.endsWith('layercontents.plist') &&
        !entry.relativePath.includes('/glyphs.background/')
    )
    withBackground.push({
      relativePath: `${UFO_NAME}/layercontents.plist`,
      text: serializeXmlPlist([
        ['public.default', 'glyphs'],
        ['public.background', 'glyphs.background'],
      ]),
    })
    withBackground.push({
      relativePath: `${UFO_NAME}/glyphs.background/contents.plist`,
      text: serializeXmlPlist({ [glyphName]: fileName }),
    })
    withBackground.push({
      relativePath: `${UFO_NAME}/glyphs.background/${fileName}`,
      text: backgroundGlif,
    })

    const imported = await importWorkspace(withBackground, UFO_NAME)
    const importedBackground = layerOf(
      imported.fontData.glyphs[glyphName]
    ).background

    expect(importedBackground?.paths).toHaveLength(1)
    expect(importedBackground?.paths[0]?.nodes[0]).toMatchObject({
      x: 10,
      y: 20,
    })

    const blob = await exportCanonicalFontDataAsUfoZip({
      fontData: imported.fontData,
      projectId: 'canonical-ufo-roundtrip-background',
      projectTitle: 'OpenSourceFont',
      projectSourceData: imported.projectSourceData,
      projectSourceFormat: imported.projectSourceFormat,
    })
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(
      Object.keys(files).some((path) =>
        path.endsWith('.ufo/glyphs.background/contents.plist')
      )
    ).toBe(true)
    expect(
      Object.keys(files).some((path) =>
        /^.+\.ufo\/glyphs\.background\/.+\.glif$/.test(path)
      )
    ).toBe(true)

    const reimported = await importWorkspace(
      zipToEntries(new Uint8Array(await blob.arrayBuffer())),
      'OpenSourceFont.ufo'
    )
    expect(
      layerOf(reimported.fontData.glyphs[glyphName]).background?.paths[0]
        ?.nodes[0]
    ).toMatchObject({ x: 10, y: 20 })
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
  <image fileName="sketch.png" xScale="1.2" yScale="0.8" xOffset="12" yOffset="34" color="0.1,0.2,0.3,0.4"/>
  <outline>
    <contour>
      <point x="100" y="0" type="line" name="start" identifier="pt-start" color="0.6,0.5,0.4,0.3"/>
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
  <anchor x="250" y="700" name="top" color="0.2,0.3,0.4,0.5"/>
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
    expect(second.image).toEqual(first.image)

    // Spot-check the parse itself captured the interesting shapes.
    const [closed, open] = first.contours
    expect(closed.points.map((p) => p.type)).toEqual([
      'line',
      'offcurve',
      'offcurve',
      'curve',
      'qcurve',
    ])
    expect(closed.points[0]).toMatchObject({
      name: 'start',
      identifier: 'pt-start',
      color: '0.6,0.5,0.4,0.3',
    })
    expect(closed.points[3].smooth).toBe(true)
    expect(open.points[0].type).toBe('move')
    expect(first.components[0]).toMatchObject({
      base: 'acute',
      xyScale: 0.2,
      xOffset: 120,
      yOffset: 40,
    })
    expect(first.anchors[0]).toMatchObject({
      x: 250,
      y: 700,
      name: 'top',
      color: '0.2,0.3,0.4,0.5',
    })
    expect(first.image).toMatchObject({
      fileName: 'sketch.png',
      xScale: 1.2,
      yScale: 0.8,
      xOffset: 12,
      yOffset: 34,
      color: '0.1,0.2,0.3,0.4',
    })

    const canonical = glyphRecordToLayerContent(augment(first), () => ({
      xMin: 0,
      xMax: 300,
      yMin: -50,
      yMax: 700,
    }))
    expect(canonical.paths[0].nodes[0]).toMatchObject({
      id: 'pt-start',
      identifier: 'pt-start',
      name: 'start',
      color: [0.6, 0.5, 0.4, 0.3],
    })
    expect(pathToUfoContour(canonical.paths[0]).points[0]).toMatchObject({
      identifier: 'pt-start',
      name: 'start',
      color: '0.6,0.5,0.4,0.3',
    })
  })
})
