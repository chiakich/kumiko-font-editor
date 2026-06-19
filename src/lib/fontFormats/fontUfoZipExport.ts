import { strToU8, zipSync } from 'fflate'
import type { FontData, GlyphData, GlyphLayerData } from 'src/store'
import {
  buildUfoLibFromFontData,
  fontInfoToUfoFontInfo,
} from 'src/lib/fontFormats/fontInfoSettings'
import {
  pathToUfoContour,
  serializeGlifRecord,
  serializeXmlPlist,
} from 'src/lib/fontFormats/adapters/ufo'
import { selectUfoFeatureText } from 'src/lib/openTypeFeatures/legacyFeatureText'
import { serializeDesignspace } from 'src/lib/fontFormats/designspace'
import type { UfoGlyphRecord } from 'src/lib/fontFormats/ufoTypes'
import { serializeUfoColor } from 'src/lib/color/kumikoColor'

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
  getExportLayer(glyph, selectedLayerId)?.paths ?? []

const getGlyphMetrics = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.metrics ?? {
    lsb: 0,
    rsb: 0,
    width: 0,
  }

const getGlyphComponents = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.componentRefs ?? []

const getGlyphAnchors = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.anchors ?? []

const getGlyphGuidelines = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.guidelines ?? []

const getGlyphImage = (glyph: GlyphData, selectedLayerId: string | null) =>
  getExportLayer(glyph, selectedLayerId)?.image ?? null

const toGlyphRecord = (
  glyph: GlyphData,
  projectId: string,
  selectedLayerId: string | null,
  fileName: string
): UfoGlyphRecord => {
  const metrics = getGlyphMetrics(glyph, selectedLayerId)
  const image = getGlyphImage(glyph, selectedLayerId)

  return {
    projectId,
    ufoId: 'font-export',
    layerId: DEFAULT_LAYER_ID,
    glyphName: glyph.id,
    fileName,
    sourceHash: null,
    unicodes: glyph.unicodes ?? [],
    advance: {
      width: metrics.width,
      height: null,
    },
    anchors: getGlyphAnchors(glyph, selectedLayerId).map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      name: anchor.name,
      color: serializeUfoColor(anchor.color),
      identifier: anchor.id,
    })),
    guidelines: getGlyphGuidelines(glyph, selectedLayerId).map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
      name: guide.name ?? null,
      color: serializeUfoColor(guide.color),
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
    image: image
      ? {
          ...image,
          color: serializeUfoColor(image.color),
        }
      : null,
    lib: null,
    dirty: false,
    dirtyIndex: 0,
    updatedAt: Date.now(),
  }
}

// Build the file map for one .ufo (under ufoDir), reading each glyph's content
// from the given layer (a source id for multi-master). Shared by the single-ufo
// and multi-master (designspace) exporters.
const buildUfoFileMap = (input: {
  fontData: FontData
  projectId: string
  fontInfoName: string
  selectedLayerId: string | null
  ufoDir: string
}): Record<string, Uint8Array> => {
  const ufoDir = input.ufoDir
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
        input.fontInfoName,
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

  return files
}

const zipFiles = (files: Record<string, Uint8Array>): Blob => {
  const zipBytes = zipSync(files)
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBuffer).set(zipBytes)
  return new Blob([zipBuffer], { type: 'application/zip' })
}

export const exportFontDataAsUfoZip = (input: {
  fontData: FontData
  projectId: string
  projectTitle: string
  selectedLayerId: string | null
}): Blob =>
  zipFiles(
    buildUfoFileMap({
      fontData: input.fontData,
      projectId: input.projectId,
      fontInfoName: input.projectTitle || input.projectId,
      selectedLayerId: input.selectedLayerId,
      ufoDir: `${sanitizeFilePart(input.projectTitle || input.projectId)}.ufo`,
    })
  )

// Multi-master export: one .ufo per font source + a .designspace tying them
// together, all in one zip. Built directly from fontData (each source reads its
// own master layer), so it does not depend on the UFO IndexedDB stores.
export const exportMultiMasterUfoZip = (input: {
  fontData: FontData
  projectId: string
  projectTitle: string
}): Blob => {
  const sources = Object.values(input.fontData.sources ?? {})
  const family = input.projectTitle || input.projectId
  const files: Record<string, Uint8Array> = {}
  const usedDirs = new Set<string>()

  const sourceDirs = sources.map((source) => {
    const base = sanitizeFilePart(source.name || source.id)
    let dir = `${base}.ufo`
    let suffix = 2
    while (usedDirs.has(dir.toLowerCase())) {
      dir = `${base}-${suffix}.ufo`
      suffix += 1
    }
    usedDirs.add(dir.toLowerCase())
    return { source, dir }
  })

  for (const { source, dir } of sourceDirs) {
    Object.assign(
      files,
      buildUfoFileMap({
        fontData: input.fontData,
        projectId: input.projectId,
        fontInfoName: family,
        selectedLayerId: source.id,
        ufoDir: dir,
      })
    )
  }

  files[`${sanitizeFilePart(family)}.designspace`] = strToU8(
    serializeDesignspace(
      input.fontData.axes,
      sourceDirs.map(({ source, dir }) => ({
        filename: dir,
        name: source.name,
        location: source.location,
      }))
    )
  )

  return zipFiles(files)
}
