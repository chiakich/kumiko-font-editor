import { UFO_FONT_LEVEL_FILE_NAMES } from '@/lib/fontFormats/ufoFileNames'
import { createUfoFormatAdapter } from '@/lib/fontFormats/formatAdapter/ufoFormatAdapter'
import {
  buildSyncReport,
  computeFontLevelSyncEntries,
  computeGlyphSyncEntries,
  joinRepoPath,
} from '@/lib/github/sync/computeSyncReport'
import { fetchRemoteTree } from '@/lib/github/sync/remoteTree'
import type { GlyphSyncEntry, ProjectSyncReport } from '@/lib/github/sync/types'
import {
  listKumikoGlyphSyncMetadataForProject,
  loadKumikoProjectRecord,
} from '@/lib/project/kumikoProjectPersistence'
import {
  getUfoSource,
  listLocalUfoFontLevelFileNames,
  listProjectUfoSources,
  makeContents,
  readGlyphBaselineFor,
  resolveDesignspacePath,
  resolveKumikoSyncTarget,
} from '@/lib/github/sync/ufoExportSources'

export const buildKumikoProjectSyncReport = async (input: {
  projectId: string
}): Promise<ProjectSyncReport | null> => {
  const project = await loadKumikoProjectRecord(input.projectId)
  if (!project) {
    return null
  }
  const target = resolveKumikoSyncTarget(project)
  if (!target) {
    return null
  }

  const glyphs = await listKumikoGlyphSyncMetadataForProject(input.projectId)
  const remote = await fetchRemoteTree({
    repo: `${target.owner}/${target.repo}`,
    ref: target.ref,
  })
  const liveGlyphIds = new Set(glyphs.map((glyph) => glyph.glyphId))
  const designspacePath = resolveDesignspacePath(project)
  const ufoSources = listProjectUfoSources(project)
  const primaryUfoId = ufoSources[0]?.ufoId ?? ''
  const entries: GlyphSyncEntry[] = []

  for (const source of ufoSources) {
    const contents = makeContents(project, glyphs, source.ufoId, source)
    const { defaultLayer } = getUfoSource(project, source.ufoId, source)
    const adapter = createUfoFormatAdapter({
      relativePath: source.relativePath,
      glyphDir: defaultLayer.glyphDir,
      designspacePath,
      contents,
    })
    const locallyDeletedFiles = Object.fromEntries(
      Object.entries(source.contents).filter(
        ([glyphId]) => !liveGlyphIds.has(glyphId)
      )
    )

    entries.push(
      ...computeGlyphSyncEntries({
        glyphs: glyphs.map((glyph) => {
          const fileName = contents[glyph.glyphId] ?? `${glyph.glyphId}.glif`
          const path = joinRepoPath(
            source.relativePath,
            defaultLayer.glyphDir,
            fileName
          )
          const baseline = readGlyphBaselineFor(
            glyph,
            source.ufoId,
            primaryUfoId
          )
          return {
            glyphName: glyph.glyphId,
            fileName,
            dirty: glyph.syncDirty === 1,
            // Records written before baselines went per-master have nothing to
            // compare on secondary masters. Adopting the remote SHA keeps the
            // first report after the upgrade from proposing a pull that would
            // overwrite local layers; the next commit writes a real baseline.
            remoteBlobSha:
              baseline ??
              (source.ufoId === primaryUfoId
                ? null
                : (remote.blobShaByPath.get(path) ?? null)),
          }
        }),
        locallyDeletedFiles,
        glyphDirPath: joinRepoPath(source.relativePath, defaultLayer.glyphDir),
        adapter,
        remote,
      })
    )

    const localFontLevelNames = listLocalUfoFontLevelFileNames(project, source)
    entries.push(
      ...computeFontLevelSyncEntries({
        candidatePaths: UFO_FONT_LEVEL_FILE_NAMES.map((name) =>
          joinRepoPath(source.relativePath, name)
        ),
        localPaths: new Set(
          localFontLevelNames.map((name) =>
            joinRepoPath(source.relativePath, name)
          )
        ),
        dirty: project.syncDirty === 1,
        baseline: source.remoteBlobShaByPath ?? {},
        remote,
      })
    )
  }

  // The designspace sits outside every .ufo, so it is tracked once.
  if (designspacePath) {
    entries.push(
      ...computeFontLevelSyncEntries({
        candidatePaths: [designspacePath],
        localPaths: new Set([designspacePath]),
        dirty: project.syncDirty === 1,
        baseline: ufoSources[0]?.remoteBlobShaByPath ?? {},
        remote,
      })
    )
  }

  return buildSyncReport({
    target: { owner: target.owner, repo: target.repo, ref: target.ref },
    remote,
    entries,
  })
}
