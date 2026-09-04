import type { FontData, GlyphData } from '@/domain'
import { parseUfoColor } from '@/lib/color/kumikoColor'
import {
  KUMIKO_VERTICAL_KERNING_LIB_KEY,
  defaultFontSource,
  fontInfoFromUfoFontInfo,
  fontAxesFromLib,
  fontSourcesFromLib,
  exportInstancesFromLib,
  statusDefinitionsFromLib,
  settingsFromLib,
} from '@/lib/fontFormats/fontInfoSettings'
import { createEmptyOpenTypeFeaturesState } from '@/lib/openTypeFeatures/defaults'
import {
  parseUfoKerning,
  parseVerticalKerningLib,
} from '@/lib/fontFormats/ufoKerning'
import { classifyRawFeatureTextSource } from '@/lib/openTypeFeatures/classifyRawFeatureText'
import { setRawFeatureTextSource } from '@/lib/openTypeFeatures/featureSourceSections'
import {
  buildBoundsResolver,
  glyphRecordToLayerContent,
} from '@/lib/fontFormats/ufoGlif'
import type {
  UfoGlyphRecord,
  UfoLayerRecord,
  UfoMetadataRecord,
} from '@/lib/fontFormats/ufoTypes'

const buildLineMetrics = (
  fontinfo: Record<string, unknown> | null | undefined
) => {
  if (!fontinfo) {
    return undefined
  }

  const metricKeys = [
    ['ascender', 'ascender'],
    ['descender', 'descender'],
    ['xHeight', 'xHeight'],
    ['capHeight', 'capHeight'],
  ] as const

  const result: Record<string, { value: number }> = {}
  for (const [sourceKey, targetKey] of metricKeys) {
    const value = fontinfo[sourceKey]
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[targetKey] = { value }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

const getUnitsPerEm = (fontinfo: Record<string, unknown> | null | undefined) =>
  typeof fontinfo?.unitsPerEm === 'number' &&
  Number.isFinite(fontinfo.unitsPerEm)
    ? fontinfo.unitsPerEm
    : undefined

// Third-party UFOs carry no Kumiko settings, so the project outline type has to
// be read back from the outlines — otherwise a TrueType source imports as cubic.
// Real sources mix kinds (a mostly-quadratic font with a few converted cubic
// glyphs), so the dominant kind wins rather than giving up on a tie-breaker.
const inferOutlineTypeFromRecords = (
  glyphRecords: UfoGlyphRecord[]
): 'cubic' | 'quadratic' | undefined => {
  let quadraticPoints = 0
  let cubicPoints = 0
  for (const record of glyphRecords) {
    for (const contour of record.contours) {
      for (const point of contour.points) {
        if (point.type === 'qcurve') {
          quadraticPoints += 1
        } else if (point.type === 'curve') {
          cubicPoints += 1
        }
      }
    }
  }
  if (quadraticPoints === 0 && cubicPoints === 0) {
    return undefined
  }
  return quadraticPoints > cubicPoints ? 'quadratic' : 'cubic'
}

export const buildFontDataFromUfoGlyphs = (
  glyphRecords: UfoGlyphRecord[],
  metadata: UfoMetadataRecord,
  allLayerGlyphRecords: UfoGlyphRecord[] = glyphRecords
): FontData => {
  const resolveBounds = buildBoundsResolver(glyphRecords)
  const defaultLayer = pickDefaultLayer(metadata)
  const backgroundLayers = metadata.layers.filter((layer) =>
    isUfoBackgroundLayer(layer, defaultLayer)
  )
  const backgroundGlyphRecords = allLayerGlyphRecords.filter(
    (record) =>
      record.ufoId === metadata.ufoId &&
      backgroundLayers.some((layer) => layer.layerId === record.layerId)
  )
  const backgroundBounds = buildBoundsResolver([
    ...glyphRecords,
    ...backgroundGlyphRecords,
  ])
  const backgroundByGlyphName = new Map(
    backgroundGlyphRecords.map((record) => [
      record.glyphName,
      glyphRecordToLayerContent(record, backgroundBounds),
    ])
  )

  const axes = fontAxesFromLib(metadata.lib)
  const fontInfo = fontInfoFromUfoFontInfo(metadata.fontinfo)
  if (
    fontInfo &&
    metadata.lib?.['com.kumiko.fontEditor.openTypeNameRecords'] &&
    typeof metadata.lib['com.kumiko.fontEditor.openTypeNameRecords'] ===
      'object'
  ) {
    fontInfo.openTypeNameRecords = metadata.lib[
      'com.kumiko.fontEditor.openTypeNameRecords'
    ] as NonNullable<FontData['fontInfo']>['openTypeNameRecords']
  }
  if (
    fontInfo &&
    metadata.lib?.['com.kumiko.fontEditor.localizedNames'] &&
    typeof metadata.lib['com.kumiko.fontEditor.localizedNames'] === 'object'
  ) {
    fontInfo.localizedNames = metadata.lib[
      'com.kumiko.fontEditor.localizedNames'
    ] as NonNullable<FontData['fontInfo']>['localizedNames']
  }
  const postscriptNames =
    metadata.lib?.['public.postscriptNames'] &&
    typeof metadata.lib['public.postscriptNames'] === 'object'
      ? (metadata.lib['public.postscriptNames'] as Record<string, string>)
      : {}
  const masterName =
    typeof metadata.fontinfo?.styleName === 'string' &&
    metadata.fontinfo.styleName
      ? metadata.fontinfo.styleName
      : 'Regular'
  const masterId = metadata.ufoId
  const ufoKerning = parseUfoKerning(metadata.groups, metadata.kerning)
  const verticalKerningPairs = parseVerticalKerningLib(
    metadata.lib?.[KUMIKO_VERTICAL_KERNING_LIB_KEY]
  )
  return {
    kerningGroups: ufoKerning.kerningGroups,
    kerningPairs: ufoKerning.kerningPairs,
    ...(verticalKerningPairs.length > 0 ? { verticalKerningPairs } : {}),
    glyphs: Object.fromEntries(
      glyphRecords.map((record) => {
        const glyphId = record.glyphName

        return [
          glyphId,
          {
            id: glyphId,
            name: glyphId,
            activeLayerId: masterId,
            layerOrder: [masterId],
            layers: {
              [masterId]: {
                id: masterId,
                name: masterName,
                type: 'master',
                associatedMasterId: masterId,
                sourceData: {
                  ufo: {
                    ufoId: record.ufoId,
                    layerId: record.layerId,
                    glyphDir: getGlyphDirForLayer(metadata, record.layerId),
                    fileName: record.fileName,
                    sourceHash: record.sourceHash,
                    remoteBlobSha: record.remoteBlobSha ?? null,
                    note: record.note,
                    lib: record.lib,
                    glifStyle: record.glifStyle ?? null,
                  },
                },
                image: record.image
                  ? {
                      ...record.image,
                      color: parseUfoColor(record.image.color),
                    }
                  : null,
                background: backgroundByGlyphName.get(record.glyphName) ?? null,
                ...glyphRecordToLayerContent(record, resolveBounds),
              },
            },
            unicodes: record.unicodes,
            production: postscriptNames[glyphId] ?? null,
            export: true,
            sourceData: {
              ufo: {
                fileName: record.fileName,
                sourceHash: record.sourceHash,
                remoteBlobSha: record.remoteBlobSha ?? null,
              },
            },
          } satisfies GlyphData,
        ]
      })
    ),
    fontInfo,
    axes,
    sources: fontSourcesFromLib(metadata.lib) ?? {
      [metadata.ufoId]: defaultFontSource(
        metadata.ufoId,
        typeof metadata.fontinfo?.styleName === 'string'
          ? metadata.fontinfo.styleName
          : 'Regular',
        { lineMetricsHorizontalLayout: buildLineMetrics(metadata.fontinfo) }
      ),
    },
    exportInstances: exportInstancesFromLib(metadata.lib) ?? [],
    statusDefinitions: statusDefinitionsFromLib(metadata.lib) ?? [],
    settings: settingsFromLib(
      metadata.lib,
      axes,
      inferOutlineTypeFromRecords(glyphRecords)
    ),
    glyphOrder: metadata.glyphOrder,
    unitsPerEm: getUnitsPerEm(metadata.fontinfo),
    lineMetricsHorizontalLayout: buildLineMetrics(metadata.fontinfo),
    openTypeFeatures: metadata.featuresText
      ? classifyRawFeatureTextSource(
          setRawFeatureTextSource(
            createEmptyOpenTypeFeaturesState(),
            metadata.featuresText,
            {
              origin: 'ufo-import',
              path: 'features.fea',
              title: 'UFO features.fea',
            }
          ),
          {
            origin: 'ufo-import',
          }
        )
      : createEmptyOpenTypeFeaturesState(),
  }
}

export const pickDefaultLayer = (metadata: UfoMetadataRecord) =>
  metadata.layers.find((layer) => layer.layerId === 'public.default') ??
  metadata.layers[0] ?? {
    layerId: 'public.default',
    glyphDir: 'glyphs',
  }

export const isUfoBackgroundLayer = (
  layer: UfoLayerRecord,
  defaultLayer: UfoLayerRecord
) =>
  layer.layerId !== defaultLayer.layerId &&
  (layer.layerId.toLowerCase().includes('background') ||
    layer.glyphDir.toLowerCase().includes('background'))

export const getLayerById = (metadata: UfoMetadataRecord, layerId: string) =>
  metadata.layers.find((layer) => layer.layerId === layerId)

export const getGlyphDirForLayer = (
  metadata: UfoMetadataRecord,
  layerId: string
) =>
  getLayerById(metadata, layerId)?.glyphDir ??
  pickDefaultLayer(metadata).glyphDir
