import { strToU8, zipSync } from 'fflate'
import type { FontData, GlyphData, GlyphLayerData } from 'src/store'
import {
  buildUfoLibFromFontData,
  fontInfoToUfoFontInfo,
} from 'src/lib/fontInfoSettings'
import {
  pathToUfoContour,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontAdapters/ufo'
import { selectUfoFeatureText } from 'src/lib/openTypeFeatures/legacyFeatureText'
import type { UfoGlyphRecord } from 'src/lib/ufoTypes'

const DEFAULT_LAYER_ID = 'public.default'
const DEFAULT_GLYPH_DIR = 'glyphs'

const RESERVED_FILE_NAME_CHARS = new Set([
  '<',
  '>',
  ':',
  '"',
  '/',
  '\\',
  '|',
  '?',
  '*',
])

const sanitizeFilePart = (value: string) =>
  Array.from(value.trim() || 'glyph', (character) =>
    character.charCodeAt(0) < 32 || RESERVED_FILE_NAME_CHARS.has(character)
      ? '_'
      : character
  ).join('')

const getExportLayer = (
  glyph: GlyphData,
  selectedLayerId: string | null
): GlyphLayerData | null => {
  if (!glyph.layers) {
    return null
  }

  if (selectedLayerId && glyph.layers[selectedLayerId]) {
    return glyph.layers[selectedLayerId]
  }

  if (glyph.activeLayerId && glyph.layers[glyph.activeLayerId]) {
    return glyph.layers[glyph.activeLayerId]
  }

  const firstLayerId = glyph.layerOrder?.find(
    (layerId) => glyph.layers?.[layerId]
  )
  return firstLayerId ? (glyph.layers[firstLayerId] ?? null) : null
}

const getGlyphPaths = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.paths ?? glyph.paths

const getGlyphMetrics = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.metrics ?? glyph.metrics

const getGlyphComponents = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.componentRefs ?? glyph.componentRefs

const getGlyphAnchors = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.anchors ?? glyph.anchors ?? []

const getGlyphGuidelines = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.guidelines ?? glyph.guidelines ?? []

const toGlyphRecord = (
  glyph: GlyphData,
  projectId: string,
  selectedLayerId: string | null,
  fileName: string
): UfoGlyphRecord => {
  const metrics = getGlyphMetrics(glyph, selectedLayerId)

  return {
    projectId,
    ufoId: 'font-export',
    layerId: DEFAULT_LAYER_ID,
    glyphName: glyph.id,
    fileName,
    sourceHash: null,
    unicodes: glyph.unicode ? [glyph.unicode] : [],
    advance: {
      width: metrics.width,
      height: null,
    },
    anchors: getGlyphAnchors(glyph, selectedLayerId).map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      name: anchor.name,
      identifier: anchor.id,
    })),
    guidelines: getGlyphGuidelines(glyph, selectedLayerId).map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
      name: guide.name ?? null,
      identifier: guide.id,
    })),
    contours: getGlyphPaths(glyph, selectedLayerId).map(pathToUfoContour),
    components: getGlyphComponents(glyph, selectedLayerId).map((component) => ({
      base: component.glyphId,
      identifier: component.id,
      xScale: component.scaleX,
      yScale: component.scaleY,
      xOffset: component.x,
      yOffset: component.y,
    })),
    note: null,
    image: null,
    lib: null,
    dirty: false,
    dirtyIndex: 0,
    updatedAt: Date.now(),
  }
}

export const exportFontDataAsUfoZip = (input: {
  fontData: FontData
  projectId: string
  projectTitle: string
  selectedLayerId: string | null
}) => {
  const ufoDir = `${sanitizeFilePart(input.projectTitle || input.projectId)}.ufo`
  const files: Record<string, Uint8Array> = {}
  const glyphs = Object.values(input.fontData.glyphs).filter(
    (glyph) => glyph.export !== false
  )
  const usedFileNames = new Set<string>()
  const glyphRecords = glyphs.map((glyph) => {
    const fileBase = sanitizeFilePart(glyph.id)
    let fileName = `${fileBase}.glif`
    let suffix = 2
    while (usedFileNames.has(fileName.toLowerCase())) {
      fileName = `${fileBase}-${suffix}.glif`
      suffix += 1
    }
    usedFileNames.add(fileName.toLowerCase())
    return toGlyphRecord(
      glyph,
      input.projectId,
      input.selectedLayerId,
      fileName
    )
  })

  files[`${ufoDir}/metainfo.plist`] = strToU8(
    serializeXmlPlist({
      creator: 'org.kumiko.fonteditor',
      formatVersion: 3,
      formatVersionMinor: 0,
    })
  )
  files[`${ufoDir}/fontinfo.plist`] = strToU8(
    serializeXmlPlist({
      ...fontInfoToUfoFontInfo(
        input.fontData.fontInfo,
        input.projectTitle || input.projectId,
        input.fontData.unitsPerEm ?? 1000
      ),
      ...(input.fontData.lineMetricsHorizontalLayout?.ascender
        ? {
            ascender: input.fontData.lineMetricsHorizontalLayout.ascender.value,
          }
        : {}),
      ...(input.fontData.lineMetricsHorizontalLayout?.descender
        ? {
            descender:
              input.fontData.lineMetricsHorizontalLayout.descender.value,
          }
        : {}),
      ...(input.fontData.lineMetricsHorizontalLayout?.xHeight
        ? {
            xHeight: input.fontData.lineMetricsHorizontalLayout.xHeight.value,
          }
        : {}),
      ...(input.fontData.lineMetricsHorizontalLayout?.capHeight
        ? {
            capHeight:
              input.fontData.lineMetricsHorizontalLayout.capHeight.value,
          }
        : {}),
    })
  )
  files[`${ufoDir}/lib.plist`] = strToU8(
    serializeXmlPlist(buildUfoLibFromFontData(input.fontData))
  )
  files[`${ufoDir}/groups.plist`] = strToU8(serializeXmlPlist({}))
  files[`${ufoDir}/kerning.plist`] = strToU8(serializeXmlPlist({}))
  const featureText = selectUfoFeatureText(input.fontData)
  if (featureText !== null) {
    files[`${ufoDir}/features.fea`] = strToU8(featureText)
  }
  files[`${ufoDir}/layercontents.plist`] = strToU8(
    serializeXmlPlist([[DEFAULT_LAYER_ID, DEFAULT_GLYPH_DIR]])
  )
  files[`${ufoDir}/${DEFAULT_GLYPH_DIR}/contents.plist`] = strToU8(
    serializeXmlPlist(
      Object.fromEntries(
        glyphRecords.map((glyph) => [glyph.glyphName, glyph.fileName])
      )
    )
  )

  glyphRecords.forEach((glyph) => {
    files[`${ufoDir}/${DEFAULT_GLYPH_DIR}/${glyph.fileName}`] = strToU8(
      serializeGlifRecord(glyph)
    )
  })

  const zipBytes = zipSync(files)
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBuffer).set(zipBytes)
  return new Blob([zipBuffer], { type: 'application/zip' })
}
