import { hashString } from '@/lib/hash'
import type {
  KumikoGlyphLayerRecord,
  KumikoGlyphRecord,
  KumikoProjectRecord,
} from '@/lib/project/kumikoProjectTypes'
import {
  buildBoundsResolver,
  glyphRecordToLayerContent,
  isUfoBackgroundLayer,
  pathToUfoContour,
} from '@/lib/fontFormats/ufoFormat'
import type { UfoGlyphRecord, UfoLayerRecord } from '@/lib/fontFormats/ufoTypes'
import { parseUfoColor, serializeUfoColor } from '@/lib/color/kumikoColor'
import {
  getKumikoComponentRefMatrix,
  kumikoGlyphRecordToGlyphData,
} from '@/lib/project/kumikoFontDataAdapter'
import type { GlyphData, GlyphLayerData } from '@/domain'
import {
  getCanonicalLayerIdForUfo,
  getUfoSource,
  readGlyphUfoSource,
  readLayerUfoSource,
  selectLayerForUfo,
  type KumikoProjectUfoSource,
} from '@/lib/github/sync/ufoExportSources'

type KumikoUfoLayerContent = Pick<
  KumikoGlyphLayerRecord,
  'paths' | 'componentRefs' | 'anchors' | 'guidelines' | 'metrics'
>

export const toUfoGlyphRecord = (input: {
  project: KumikoProjectRecord
  glyph: KumikoGlyphRecord
  activeUfoId: string
  fileName: string
  source?: KumikoProjectUfoSource
  layerId?: string
  glyphName?: string
  targetLayer?: UfoLayerRecord
}): UfoGlyphRecord => {
  const { source, defaultLayer } = getUfoSource(
    input.project,
    input.activeUfoId,
    input.source
  )
  const targetLayer = input.targetLayer ?? defaultLayer
  const layer = input.layerId
    ? input.glyph.layers[input.layerId]
    : selectLayerForUfo(
        input.glyph,
        getCanonicalLayerIdForUfo(input.project, source)
      )
  if (!layer) {
    throw new Error(`字圖 ${input.glyph.glyphId} 沒有可寫入 UFO 的 layer`)
  }
  const isSyntheticBraceSource = source.ufoId.startsWith('brace:')
  const isPrimaryDefaultGlyph =
    targetLayer.layerId === defaultLayer.layerId &&
    !input.glyphName &&
    !input.layerId &&
    !isSyntheticBraceSource
  const content: KumikoUfoLayerContent | null =
    targetLayer.layerId === defaultLayer.layerId
      ? {
          paths: layer.paths,
          componentRefs: layer.componentRefs,
          anchors: layer.anchors,
          guidelines: layer.guidelines,
          metrics: layer.metrics,
        }
      : isUfoBackgroundLayer(targetLayer, defaultLayer)
        ? (layer.background ?? null)
        : null
  if (!content) {
    throw new Error(
      `字圖 ${input.glyph.glyphId} 沒有可寫入 UFO layer ${targetLayer.layerId} 的內容`
    )
  }
  const glyphSource = readGlyphUfoSource(input.glyph)
  const layerSource = readLayerUfoSource(layer)

  return {
    projectId: input.project.projectId,
    ufoId: source.ufoId,
    layerId: targetLayer.layerId,
    glyphName: input.glyphName ?? input.glyph.glyphId,
    fileName: input.fileName,
    sourceHash: isPrimaryDefaultGlyph
      ? (glyphSource.sourceHash ?? layerSource.sourceHash ?? null)
      : null,
    remoteBlobSha: isPrimaryDefaultGlyph
      ? (glyphSource.remoteBlobSha ?? layerSource.remoteBlobSha ?? null)
      : null,
    unicodes: isPrimaryDefaultGlyph ? input.glyph.unicodes : [],
    advance: {
      width: content.metrics.width,
      height: isPrimaryDefaultGlyph
        ? (layer.verticalMetrics?.height ?? null)
        : null,
    },
    anchors: content.anchors.map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      name: anchor.name,
      color: serializeUfoColor(anchor.color),
      identifier: anchor.identifier ?? null,
    })),
    guidelines: content.guidelines.map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
      name: guide.name ?? null,
      color: serializeUfoColor(guide.color),
      identifier: guide.identifier ?? null,
    })),
    contours: content.paths.map((path) => pathToUfoContour(path)),
    components: content.componentRefs.map((component) => {
      const matrix = getKumikoComponentRefMatrix(component)
      // Only the parts of the transform that differ from the format's defaults.
      // Writing xScale="1" on an unscaled component put an attribute in every
      // composed glyph that the source never had — and in a CJK font almost
      // every glyph is composed.
      return {
        base: component.glyphId,
        identifier: component.identifier ?? null,
        ...(matrix.a !== 1 ? { xScale: matrix.a } : {}),
        ...(matrix.b !== 0 ? { xyScale: matrix.b } : {}),
        ...(matrix.c !== 0 ? { yxScale: matrix.c } : {}),
        ...(matrix.d !== 1 ? { yScale: matrix.d } : {}),
        ...(matrix.e !== 0 ? { xOffset: matrix.e } : {}),
        ...(matrix.f !== 0 ? { yOffset: matrix.f } : {}),
      }
    }),
    note: isPrimaryDefaultGlyph
      ? (layerSource.note ?? input.glyph.note ?? null)
      : null,
    image:
      isPrimaryDefaultGlyph && layer.image
        ? {
            ...layer.image,
            color: serializeUfoColor(layer.image.color),
          }
        : null,
    lib: isPrimaryDefaultGlyph ? (layerSource.lib ?? null) : null,
    glifStyle: layerSource.glifStyle ?? null,
    dirty: input.glyph.syncDirty === 1,
    dirtyIndex: input.glyph.syncDirty,
    updatedAt: input.glyph.updatedAt,
  }
}

type UfoLayerContent = ReturnType<typeof glyphRecordToLayerContent>
type KumikoLayerContent = Omit<UfoLayerContent, 'components'>

const asPlainRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const omitLegacyLayerComponents = (content: UfoLayerContent) => {
  const layerContent = { ...content } as KumikoLayerContent & {
    components?: unknown
  }
  delete layerContent.components
  return layerContent
}

export const ufoGlyphToGlyphData = (input: {
  project: KumikoProjectRecord
  activeUfoId: string
  record: UfoGlyphRecord
  text: string
  existing?: KumikoGlyphRecord
  remoteBlobSha: string | null
}): GlyphData => {
  const { source, defaultLayer, canonicalLayerId } = getUfoSource(
    input.project,
    input.activeUfoId
  )
  const resolveBounds = buildBoundsResolver([input.record])
  const layerContent = glyphRecordToLayerContent(input.record, resolveBounds)
  const content = omitLegacyLayerComponents(layerContent)
  const existingGlyph = input.existing
    ? kumikoGlyphRecordToGlyphData(input.existing)
    : null
  const sourceHash = hashString(input.text)
  const layer: GlyphLayerData = {
    id: canonicalLayerId,
    name: canonicalLayerId,
    type: 'master',
    associatedMasterId: canonicalLayerId,
    ...content,
    sourceData: {
      ...existingGlyph?.layers?.[canonicalLayerId]?.sourceData,
      ufo: {
        ufoId: source.ufoId,
        layerId: defaultLayer.layerId,
        glyphDir: defaultLayer.glyphDir,
        fileName: input.record.fileName,
        sourceHash,
        remoteBlobSha: input.remoteBlobSha,
        note: input.record.note,
        lib: input.record.lib,
      },
    },
    image: input.record.image
      ? {
          ...input.record.image,
          color: parseUfoColor(input.record.image.color),
        }
      : null,
  }

  return {
    ...(existingGlyph ?? {}),
    id: input.record.glyphName,
    name: existingGlyph?.name ?? input.record.glyphName,
    displayName: existingGlyph?.displayName ?? null,
    activeLayerId: canonicalLayerId,
    layerOrder: [
      canonicalLayerId,
      ...(existingGlyph?.layerOrder ?? []).filter(
        (layerId) => layerId !== canonicalLayerId
      ),
    ],
    layers: {
      ...(existingGlyph?.layers ?? {}),
      [canonicalLayerId]: layer,
    },
    unicodes: input.record.unicodes,
    production: existingGlyph?.production,
    export: existingGlyph?.export ?? true,
    sourceData: {
      ...existingGlyph?.sourceData,
      ufo: {
        ...asPlainRecord(existingGlyph?.sourceData?.ufo),
        fileName: input.record.fileName,
        sourceHash,
        remoteBlobSha: input.remoteBlobSha,
      },
    },
  }
}
