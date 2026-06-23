import { importBinaryFontFile } from 'src/lib/fontFormats/adapters/binary'
import {
  loadProjectDraftMetadata,
  saveProjectDraft,
} from 'src/lib/project/projectRepository'
import type { KumikoProjectSummary } from 'src/lib/project/projectTypes'
import {
  buildWorkspaceEntriesFromFiles,
  importUfoWorkspace,
  listDesignspaceCandidates,
  type ImportedUfoWorkspace,
  type DesignspaceCandidate,
} from 'src/lib/fontFormats/adapters/ufo'
import {
  importGlyphsFile,
  importGlyphsPackage,
  type ImportedGlyphsProject,
} from 'src/lib/fontFormats/adapters/glyphs'
import type { FontData } from 'src/store'
import type { KumikoProjectSourceData } from 'src/lib/project/kumikoProjectTypes'

export interface ImportedKumikoProject {
  id: string
  title: string
  fontData: FontData
  projectMetadata: Record<string, unknown> | null
  projectSourceData: KumikoProjectSourceData | null
  projectSourceFormat: KumikoProjectSummary['projectSourceFormat']
  projectRoundTripFormat: KumikoProjectSummary['projectRoundTripFormat']
  summary: KumikoProjectSummary
}

const BINARY_FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2'])

const hasFolderEntries = (files: File[]) =>
  files.some((file) => file.webkitRelativePath.includes('/'))

const getProjectTitleFromFiles = (files: File[]) => {
  const path = files[0]?.webkitRelativePath || files[0]?.name || 'Untitled'
  return path.replace(/\\/g, '/').split('/')[0] ?? 'Untitled'
}

export const isSingleBinaryFontImport = (files: File[]) => {
  if (hasFolderEntries(files) || files.length !== 1) {
    return false
  }
  const extension = files[0].name.split('.').pop()?.toLowerCase()
  return Boolean(extension && BINARY_FONT_EXTENSIONS.has(extension))
}

const isSingleGlyphsFileImport = (files: File[]) =>
  !hasFolderEntries(files) &&
  files.length === 1 &&
  files[0].name.toLowerCase().endsWith('.glyphs')

const isGlyphsPackageImport = (files: File[]) =>
  files.some((file) =>
    (file.webkitRelativePath || file.name)
      .toLowerCase()
      .includes('.glyphspackage/')
  )

const loadSavedImportedProject = async (
  summary: KumikoProjectSummary
): Promise<ImportedKumikoProject> => {
  const draft = await loadProjectDraftMetadata(summary.id)
  if (!draft?.fontData) {
    throw new Error('匯入後無法載入專案 metadata')
  }

  return {
    id: summary.id,
    title: summary.title,
    fontData: draft.fontData,
    projectMetadata: draft.projectMetadata ?? null,
    projectSourceData: draft.projectSourceData ?? null,
    projectSourceFormat: draft.projectSourceFormat ?? null,
    projectRoundTripFormat: draft.projectRoundTripFormat ?? null,
    summary,
  }
}

const saveImportedGlyphsProject = async (
  imported: ImportedGlyphsProject,
  sourceName: string
): Promise<ImportedKumikoProject> => {
  const now = Date.now()
  const summary = await saveProjectDraft({
    id: imported.projectId,
    title: imported.title,
    lastModified: now,
    createdAt: now,
    updatedAt: now,
    sourceName,
    sourceType: 'local',
    githubSource: null,
    fontData: imported.fontData,
    projectMetadata: imported.projectMetadata,
    projectSourceData: imported.projectSourceData,
    projectSourceFormat: imported.projectSourceFormat,
    // Glyphs projects reload straight from the draft fontData (no per-source
    // rebuild like UFO), so there is no separate round-trip format.
    projectRoundTripFormat: null,
    projectGlyphsPackage: imported.projectGlyphsPackage,
  })

  return loadSavedImportedProject(summary)
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
    projectSourceData: importedProject.projectSourceData,
    projectSourceFormat: importedProject.projectSourceFormat,
    projectRoundTripFormat: 'ufo',
    projectGlyphsPackage: null,
  })

  return loadSavedImportedProject(summary)
}

export const importLocalProjectFiles = async (
  selectedFiles: File[],
  options: { designspacePath?: string | null } = {}
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
      projectSourceData: importedBinary.projectSourceData,
      projectSourceFormat: importedBinary.sourceFormat,
      projectRoundTripFormat: null,
      projectGlyphsPackage: null,
    })

    return loadSavedImportedProject(summary)
  }

  if (isSingleGlyphsFileImport(selectedFiles)) {
    const imported = await importGlyphsFile(selectedFiles[0])
    return saveImportedGlyphsProject(imported, selectedFiles[0].name)
  }

  if (isGlyphsPackageImport(selectedFiles)) {
    const imported = await importGlyphsPackage(selectedFiles)
    return saveImportedGlyphsProject(imported, imported.title)
  }

  const importedUfo = await importUfoWorkspace(selectedFiles, {
    designspacePath: options.designspacePath,
  })
  return saveImportedUfoWorkspaceAsProject(importedUfo)
}

export const listLocalUfoDesignspaceCandidates = async (
  selectedFiles: File[]
): Promise<DesignspaceCandidate[]> => {
  if (
    selectedFiles.length === 0 ||
    isSingleBinaryFontImport(selectedFiles) ||
    isSingleGlyphsFileImport(selectedFiles) ||
    isGlyphsPackageImport(selectedFiles)
  ) {
    return []
  }

  const entries = await buildWorkspaceEntriesFromFiles(selectedFiles)
  return listDesignspaceCandidates(entries, {
    sourceFolderName: getProjectTitleFromFiles(selectedFiles),
  })
}
