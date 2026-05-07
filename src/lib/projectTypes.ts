import type { FontData } from 'src/store'
import type { GlyphsDocument } from 'src/lib/glyphsDocument'
import type { GlyphsPackageData } from 'src/lib/glyphsPackage'
import type {
  ProjectRoundTripFormat,
  ProjectSourceFormat,
} from 'src/lib/projectFormats'

export type ProjectSourceType = 'local' | 'github'

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
  projectSourceFormat?: ProjectSourceFormat | null
  projectRoundTripFormat?: ProjectRoundTripFormat | null
  projectGlyphsText?: string | null
  projectGlyphsDocument?: GlyphsDocument | null
  projectGlyphsPackage?: GlyphsPackageData | null
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
