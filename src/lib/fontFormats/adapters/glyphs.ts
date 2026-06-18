import {
  extractGlyphsMetadata,
  type GlyphsDocument,
} from 'src/lib/fontFormats/glyphsDocument'
import { buildFontDataFromGlyphsDocument } from 'src/lib/fontFormats/glyphsImport'
import {
  readGlyphsPackageFromFiles,
  type GlyphsPackageData,
} from 'src/lib/fontFormats/glyphsPackage'
import { parseOpenStep } from 'src/lib/fontFormats/openstepParser'
import type { ProjectSourceFormat } from 'src/lib/project/projectFormats'
import type { KumikoProjectSourceData } from 'src/lib/project/kumikoProjectTypes'
import type { FontData } from 'src/store'

export interface ImportedGlyphsProject {
  projectId: string
  title: string
  fontData: FontData
  projectMetadata: Record<string, unknown>
  projectSourceData: KumikoProjectSourceData
  projectSourceFormat: ProjectSourceFormat
  projectGlyphsPackage: GlyphsPackageData | null
}

const stripExtension = (fileName: string) =>
  fileName.replace(/\.(glyphs|glyphspackage)$/i, '')

const familyTitle = (document: GlyphsDocument, fallback: string) =>
  typeof document.familyName === 'string' && document.familyName.length > 0
    ? document.familyName
    : fallback

// Single-file .glyphs: parse the OpenStep document, then keep only Kumiko's
// canonical FontData plus compact non-vector metadata.
export const importGlyphsFile = async (
  file: File
): Promise<ImportedGlyphsProject> => {
  const text = await file.text()
  const document = parseOpenStep(text) as GlyphsDocument
  if (!document || typeof document !== 'object') {
    throw new Error('無法解析 .glyphs 檔案')
  }

  return {
    projectId: `glyphs-${Date.now()}`,
    title: familyTitle(document, stripExtension(file.name)),
    fontData: buildFontDataFromGlyphsDocument(document),
    projectMetadata: extractGlyphsMetadata(document) ?? {},
    projectSourceData: {
      glyphs: {
        formatVersion: document.formatVersion === 3 ? 3 : 2,
        packageName: null,
        repoPath: null,
        documentFields: extractGlyphsMetadata(document) ?? {},
      },
    },
    projectSourceFormat: 'glyphs',
    projectGlyphsPackage: null,
  }
}

// .glyphspackage folder: readGlyphsPackageFromFiles already assembles the
// document (fontinfo.plist + per-glyph .glyph files in order). Persist only the
// internal FontData, extracted metadata, and package naming hint.
export const importGlyphsPackage = async (
  files: FileList | File[]
): Promise<ImportedGlyphsProject> => {
  const { document, packageData, projectMetadata } =
    await readGlyphsPackageFromFiles(files)

  return {
    projectId: `glyphs-${Date.now()}`,
    title: familyTitle(document, stripExtension(packageData.packageName)),
    fontData: buildFontDataFromGlyphsDocument(document),
    projectMetadata,
    projectSourceData: {
      glyphs: {
        formatVersion: document.formatVersion === 3 ? 3 : 2,
        packageName: packageData.packageName,
        repoPath: null,
        documentFields: projectMetadata,
      },
    },
    projectSourceFormat: 'glyphspackage',
    projectGlyphsPackage: packageData,
  }
}
