import type { FontData } from 'src/store'
import type { GlyphsPackageData } from 'src/lib/fontFormats/glyphsPackage'
import type { KumikoProjectSourceData } from 'src/lib/project/kumikoProjectTypes'
import type {
  ProjectRoundTripFormat,
  ProjectSourceFormat,
} from 'src/lib/project/projectFormats'

export type ProjectSourceType = 'local' | 'github'

export interface KumikoProjectUiState {
  selectedGlyphId?: string | null
  selectedLayerId?: string | null
  activeMasterId?: string | null
  editLocation?: Record<string, number> | null
  overviewSectionId?: string | null
  overviewTopGlyphId?: string | null
  overviewGridState?: unknown | null
}

export interface GitHubProjectSource {
  owner: string
  repo: string
  ref: string
  defaultBranch: string
  repoUrl: string
  zipballUrl: string
  archiveRoot: string
  commitSha?: string | null
}

export interface KumikoProjectDraft {
  id: string
  title: string
  lastModified: number
  createdAt?: number
  updatedAt?: number
  sourceName?: string | null
  sourceType?: ProjectSourceType
  githubSource?: GitHubProjectSource | null
  fontData?: FontData
  projectMetadata?: Record<string, unknown> | null
  projectSourceData?: KumikoProjectSourceData | null
  projectSourceFormat?: ProjectSourceFormat | null
  projectRoundTripFormat?: ProjectRoundTripFormat | null
  projectGlyphsPackage?: GlyphsPackageData | null
  projectUiState?: KumikoProjectUiState | null
  projectExportDirty?: boolean
  projectSyncDirty?: boolean
  exportDirtyGlyphIds?: Iterable<string>
  syncDirtyGlyphIds?: Iterable<string>
}

export interface KumikoProjectSummary {
  id: string
  title: string
  lastModified: number
  createdAt: number
  updatedAt: number
  sourceName: string | null
  sourceType: ProjectSourceType
  githubSource: GitHubProjectSource | null
  projectSourceFormat: ProjectSourceFormat | null
  projectRoundTripFormat: ProjectRoundTripFormat | null
}

export const toProjectSummary = (
  project: KumikoProjectDraft
): KumikoProjectSummary => ({
  id: project.id,
  title: project.title,
  lastModified: project.lastModified,
  createdAt: project.createdAt ?? project.lastModified,
  updatedAt: project.updatedAt ?? project.lastModified,
  sourceName: project.sourceName ?? null,
  sourceType: project.sourceType ?? 'local',
  githubSource: project.githubSource ?? null,
  projectSourceFormat: project.projectSourceFormat ?? null,
  projectRoundTripFormat: project.projectRoundTripFormat ?? null,
})
