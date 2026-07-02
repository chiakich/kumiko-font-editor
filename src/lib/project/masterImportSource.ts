import { importBinaryFontFile } from 'src/lib/fontFormats/fontBinaryFormat'
import {
  importGlyphsFile,
  importGlyphsPackage,
} from 'src/lib/fontFormats/adapters/glyphs'
import { importUfoWorkspace } from 'src/lib/fontFormats/ufoFormat'
import { getGlyphMasterLayerForSource } from 'src/font/designspaceLocation'
import type { FontData, GlyphData } from 'src/store'

const NORMALIZED_LAYER_ID = 'public.default'

export interface MasterCandidate {
  // Stable id for selection (source id for multi-master, 'default' for single).
  id: string
  name: string
  glyphs: Record<string, GlyphData>
  location?: Record<string, number>
  lineMetrics?: FontData['lineMetricsHorizontalLayout']
}

export interface ParsedMasterSource {
  formatLabel: string
  candidates: MasterCandidate[]
}

// Flatten one master out of a (possibly multi-master) FontData into glyphs that
// each carry a single default layer, so downstream matching is format-agnostic.
export const extractMasterGlyphs = (
  fontData: Pick<FontData, 'glyphs'>,
  sourceId: string
): Record<string, GlyphData> => {
  const result: Record<string, GlyphData> = {}
  for (const [glyphKey, glyph] of Object.entries(fontData.glyphs ?? {})) {
    const layer = getGlyphMasterLayerForSource(glyph, sourceId)
    if (!layer) {
      continue
    }
    result[glyphKey] = {
      ...glyph,
      activeLayerId: NORMALIZED_LAYER_ID,
      layerOrder: [NORMALIZED_LAYER_ID],
      layers: {
        [NORMALIZED_LAYER_ID]: {
          ...structuredClone(layer),
          id: NORMALIZED_LAYER_ID,
          associatedMasterId: NORMALIZED_LAYER_ID,
          type: 'master',
        },
      },
    }
  }
  return result
}

const multiMasterCandidates = (fontData: FontData): MasterCandidate[] => {
  const sources = Object.values(fontData.sources ?? {})
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    glyphs: extractMasterGlyphs(fontData, source.id),
    location: source.location,
    lineMetrics:
      source.lineMetricsHorizontalLayout ??
      fontData.lineMetricsHorizontalLayout,
  }))
}

const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase()

const isBinaryFile = (file: File) =>
  ['ttf', 'otf', 'woff', 'woff2'].includes(fileExtension(file.name) ?? '')

const relativePath = (file: File) =>
  (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
  file.name

// Parse a picked file (or folder's File[]) into the selectable masters it
// contains: one for binary/single-UFO, several for .glyphs/.designspace.
export const parseMasterCandidates = async (
  files: File[]
): Promise<ParsedMasterSource> => {
  if (files.length === 0) {
    throw new Error('沒有選取任何檔案')
  }

  if (files.length === 1 && isBinaryFile(files[0])) {
    const imported = await importBinaryFontFile(files[0])
    return {
      formatLabel: (fileExtension(files[0].name) ?? 'binary').toUpperCase(),
      candidates: [
        {
          id: 'default',
          name: imported.fontData.fontInfo?.familyName || files[0].name,
          glyphs: imported.fontData.glyphs,
          lineMetrics: imported.fontData.lineMetricsHorizontalLayout,
        },
      ],
    }
  }

  if (files.length === 1 && fileExtension(files[0].name) === 'glyphs') {
    const imported = await importGlyphsFile(files[0])
    return {
      formatLabel: 'Glyphs',
      candidates: multiMasterCandidates(imported.fontData),
    }
  }

  if (files.some((file) => relativePath(file).includes('.glyphspackage/'))) {
    const imported = await importGlyphsPackage(files)
    return {
      formatLabel: 'Glyphs Package',
      candidates: multiMasterCandidates(imported.fontData),
    }
  }

  const imported = await importUfoWorkspace(files, {})
  return {
    formatLabel:
      imported.projectSourceFormat === 'designspace' ? 'Designspace' : 'UFO',
    candidates: multiMasterCandidates(imported.fontData),
  }
}
