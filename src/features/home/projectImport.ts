import { importBinaryFontFile } from 'src/lib/fontAdapters/binary'
import { saveProjectDraft } from 'src/lib/projectRepository'
import type { KumikoProjectSummary } from 'src/lib/projectTypes'
import {
  importUfoWorkspace,
  type ImportedUfoWorkspace,
} from 'src/lib/fontAdapters/ufo'
import type { FontData } from 'src/store'

export interface ImportedKumikoProject {
  id: string
  title: string
  fontData: FontData
  projectMetadata: Record<string, unknown> | null
  projectSourceFormat: KumikoProjectSummary['projectSourceFormat']
  projectRoundTripFormat: KumikoProjectSummary['projectRoundTripFormat']
  summary: KumikoProjectSummary
}

const BINARY_FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2'])

const hasFolderEntries = (files: File[]) =>
  files.some((file) => file.webkitRelativePath.includes('/'))

export const isSingleBinaryFontImport = (files: File[]) => {
  if (hasFolderEntries(files) || files.length !== 1) {
    return false
  }
  const extension = files[0].name.split('.').pop()?.toLowerCase()
  return Boolean(extension && BINARY_FONT_EXTENSIONS.has(extension))
}

export const saveImportedUfoWorkspaceAsProject = async (
  importedProject: ImportedUfoWorkspace
): Promise<ImportedKumikoProject> => {
  const now = Date.now()
  const project = importedProject.project
  const summary = await saveProjectDraft({
    id: project.projectId,
    title: project.title,
    lastModified: now,
    createdAt: project.createdAt,
    updatedAt: now,
    sourceName: project.sourceFolderName,
    sourceType: project.sourceType ?? 'local',
    githubSource: project.githubSource ?? null,
    fontData: importedProject.fontData,
    projectMetadata: importedProject.projectMetadata,
    projectSourceFormat: importedProject.projectSourceFormat,
    projectRoundTripFormat: 'ufo',
    projectGlyphsText: null,
    projectGlyphsDocument: null,
    projectGlyphsPackage: null,
  })

  return {
    id: summary.id,
    title: summary.title,
    fontData: importedProject.fontData,
    projectMetadata: importedProject.projectMetadata,
    projectSourceFormat: importedProject.projectSourceFormat,
    projectRoundTripFormat: 'ufo',
    summary,
  }
}

export const importLocalProjectFiles = async (
  selectedFiles: File[]
): Promise<ImportedKumikoProject | null> => {
  if (selectedFiles.length === 0) {
    return null
  }

  if (isSingleBinaryFontImport(selectedFiles)) {
    const fontFile = selectedFiles[0]
    const extension = fontFile.name.split('.').pop()?.toLowerCase() ?? null
    const importedBinary = await importBinaryFontFile(fontFile)
    if (!importedBinary) {
      throw new Error('字型檔解析失敗')
    }

    const now = Date.now()
    const summary = await saveProjectDraft({
      id: importedBinary.projectId,
      title: importedBinary.projectTitle,
      lastModified: now,
      createdAt: now,
      updatedAt: now,
      sourceName: fontFile.name,
      sourceType: 'local',
      githubSource: null,
      fontData: importedBinary.fontData,
      projectMetadata: { importedFrom: extension },
      projectSourceFormat: importedBinary.sourceFormat,
      projectRoundTripFormat: null,
      projectGlyphsText: null,
      projectGlyphsDocument: null,
      projectGlyphsPackage: null,
    })

    return {
      id: importedBinary.projectId,
      title: importedBinary.projectTitle,
      fontData: importedBinary.fontData,
      projectMetadata: { importedFrom: extension },
      projectSourceFormat: importedBinary.sourceFormat,
      projectRoundTripFormat: null,
      summary,
    }
  }

  const importedUfo = await importUfoWorkspace(selectedFiles)
  return saveImportedUfoWorkspaceAsProject(importedUfo)
}
