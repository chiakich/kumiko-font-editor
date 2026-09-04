import {
  extractGlyphsMetadata,
  extractGlyphsDocumentFields,
  extractGlyphsFontMasterFields,
  getGlyphsFormatVersion,
  type GlyphsDocument,
} from '@/lib/fontFormats/glyphsDocument'
import { buildFontDataFromGlyphsDocument } from '@/lib/fontFormats/glyphsImport'
import {
  readGlyphsPackageFromFiles,
  type GlyphsPackageData,
} from '@/lib/fontFormats/glyphsPackage'
import { parseOpenStep } from '@/lib/fontFormats/openstepParser'
import type { ProjectSourceFormat } from '@/lib/project/projectFormats'
import type { KumikoProjectSourceData } from '@/lib/project/kumikoProjectTypes'
import type { FontData } from '@/domain'

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

const glyphsSourceData = (input: {
  document: GlyphsDocument
  packageName: string | null
  repoPath: string | null
}): KumikoProjectSourceData => ({
  glyphs: {
    formatVersion: getGlyphsFormatVersion(input.document),
    packageName: input.packageName,
    repoPath: input.repoPath,
    documentFields: extractGlyphsDocumentFields(input.document),
    fontMasterFields: extractGlyphsFontMasterFields(input.document),
  },
})

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
    projectSourceData: glyphsSourceData({
      document,
      packageName: null,
      repoPath: null,
    }),
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
    projectSourceData: glyphsSourceData({
      document,
      packageName: packageData.packageName,
      repoPath: null,
    }),
    projectSourceFormat: 'glyphspackage',
    projectGlyphsPackage: packageData,
  }
}
