import {
  UFO_FONT_LEVEL_FILE_NAMES,
  userNameToFileName,
} from 'src/lib/fontFormats/ufoFileNames'
import type {
  EntityId,
  FormatAdapter,
  FormatDetection,
} from 'src/lib/fontFormats/formatAdapter/types'
import {
  listUfoTreePaths,
  materializeUfoTree,
} from 'src/lib/fontFormats/ufoMaterialize'

export interface UfoLayout {
  // The .ufo directory, relative to the repo root.
  relativePath: string
  // The default layer's glyph directory, relative to the .ufo directory.
  glyphDir: string
  // Repo-relative designspace path, when the project has one.
  designspacePath?: string | null
  // glyphId → .glif file name, from the UFO's contents.plist.
  contents?: Record<string, string>
}

const FONT_LEVEL_OWNERS: Record<string, EntityId> = {
  'metainfo.plist': { kind: 'font', part: 'info' },
  'fontinfo.plist': { kind: 'font', part: 'info' },
  'lib.plist': { kind: 'font', part: 'info' },
  'layercontents.plist': { kind: 'font', part: 'info' },
  'groups.plist': { kind: 'font', part: 'kerning' },
  'kerning.plist': { kind: 'font', part: 'kerning' },
  'features.fea': { kind: 'font', part: 'features' },
}

const joinPath = (...parts: Array<string | null | undefined>) =>
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')

export const createUfoFormatAdapter = (layout: UfoLayout): FormatAdapter => {
  const glyphDirPath = joinPath(layout.relativePath, layout.glyphDir)
  const glyphDirPrefix = `${glyphDirPath}/`
  const ufoPrefix = layout.relativePath ? `${layout.relativePath}/` : ''
  const contents = layout.contents ?? {}

  const glyphFileName = (glyphName: string) =>
    contents[glyphName] ?? userNameToFileName(glyphName, new Set(), '.glif')

  return {
    id: 'ufo',

    ignoredPaths: [],

    materialize: (options) => materializeUfoTree(options),

    listPaths: (projectId) => listUfoTreePaths(projectId),

    entityOwning: (path) => {
      if (layout.designspacePath && path === layout.designspacePath) {
        return { kind: 'font', part: 'designspace' }
      }

      if (path.startsWith(glyphDirPrefix)) {
        const fileName = path.slice(glyphDirPrefix.length)
        // Nested paths are not part of a UFO glyph directory.
        if (fileName.includes('/')) {
          return null
        }
        if (fileName === 'contents.plist') {
          return { kind: 'font', part: 'order' }
        }
        if (!fileName.toLowerCase().endsWith('.glif')) {
          return null
        }
        // The contents map is authoritative; fall back to the file stem so a
        // remote-only glyph still resolves to an entity.
        const known = Object.entries(contents).find(
          ([, name]) => name === fileName
        )
        return {
          kind: 'glyph',
          name: known?.[0] ?? fileName.slice(0, -'.glif'.length),
        }
      }

      if (!path.startsWith(ufoPrefix)) {
        return null
      }
      const name = path.slice(ufoPrefix.length)
      if (name.includes('/')) {
        return null
      }
      return FONT_LEVEL_OWNERS[name] ?? null
    },

    // contents.plist is regenerated from whichever glyphs exist, so it never
    // needs a human to resolve it.
    mergePolicy: (entity) =>
      entity.kind === 'font' && entity.part === 'order' ? 'setMerge' : 'atomic',

    pathsOwnedBy: (entity) => {
      if (entity.kind === 'glyph') {
        return [joinPath(glyphDirPath, glyphFileName(entity.name))]
      }
      if (entity.part === 'designspace') {
        return layout.designspacePath ? [layout.designspacePath] : []
      }
      if (entity.part === 'order') {
        return [joinPath(glyphDirPath, 'contents.plist')]
      }
      return UFO_FONT_LEVEL_FILE_NAMES.filter(
        (name) =>
          FONT_LEVEL_OWNERS[name]?.kind === 'font' &&
          (FONT_LEVEL_OWNERS[name] as { part: string }).part === entity.part
      ).map((name) => joinPath(layout.relativePath, name))
    },
  }
}

const UFO_DIR = /(^|\/)([^/]+)\.ufo\//i

// A repo holds a UFO project when it has at least one .ufo directory. The
// designspace, when present, sits beside them rather than inside one.
export const detectUfoSourceTrees = (
  paths: readonly string[]
): FormatDetection[] => {
  const roots = new Set<string>()
  for (const path of paths) {
    const match = UFO_DIR.exec(path)
    if (!match) {
      continue
    }
    roots.add(path.slice(0, match.index))
  }
  return [...roots].sort().map((root) => ({
    id: 'ufo' as const,
    root,
    label: root ? `${root} (UFO)` : 'UFO',
  }))
}
