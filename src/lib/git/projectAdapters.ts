import { createUfoFormatAdapter } from 'src/lib/fontFormats/formatAdapter/ufoFormatAdapter'
import { listProjectUfoSources } from 'src/lib/github/sync/kumikoUfoSync'
import { loadKumikoProjectRecord } from 'src/lib/project/kumikoProjectPersistence'
import type { FormatAdapter } from 'src/lib/fontFormats/formatAdapter/types'

// One adapter per UFO the project writes, so path questions are answered
// against the project's real layout rather than a guessed one.
export const buildProjectAdapters = async (
  projectId: string
): Promise<FormatAdapter[]> => {
  const project = await loadKumikoProjectRecord(projectId)
  if (!project) {
    return []
  }
  const designspacePath = project.sourceData?.ufo?.designspacePath ?? null
  return listProjectUfoSources(project).map((source) =>
    createUfoFormatAdapter({
      relativePath: source.relativePath,
      glyphDir:
        source.layers.find((layer) => layer.layerId === source.defaultLayerId)
          ?.glyphDir ?? 'glyphs',
      layerGlyphDirs: source.layers.map((layer) => layer.glyphDir),
      designspacePath,
      contents: source.contents,
    })
  )
}

// True only for paths this project's own records account for, so a deletion
// always rests on evidence the file was ours. Note this is deliberately not
// `entityOwning(path) !== null`: that resolves remote-only paths on purpose so a
// report can attribute them, and reading it as permission to delete is what made
// a sync drop another contributor's glyphs — their .glif sits in our glyph
// directory and looks exactly like one of ours.
export const buildRemovalPolicy = async (projectId: string) => {
  const adapters = await buildProjectAdapters(projectId)
  return (path: string) =>
    adapters.some((adapter) => adapter.canRemovePath(path))
}
