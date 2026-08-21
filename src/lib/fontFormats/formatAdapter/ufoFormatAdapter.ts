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
  // Every layer's glyph directory, relative to the .ufo directory. Without it
  // only the default layer is recognised, and a background .glif ends up owned
  // by nobody: invisible in sync reports and resurrected on every commit.
  layerGlyphDirs?: readonly string[]
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
  const glyphDirPaths = [
    ...new Set(
      [layout.glyphDir, ...(layout.layerGlyphDirs ?? [])].map((glyphDir) =>
        joinPath(layout.relativePath, glyphDir)
      )
    ),
  ]
  const ufoPrefix = layout.relativePath ? `${layout.relativePath}/` : ''
  const contents = layout.contents ?? {}
  const knownFileNames = new Set(Object.values(contents))

  const glyphFileName = (glyphName: string) =>
    contents[glyphName] ?? userNameToFileName(glyphName, new Set(), '.glif')

  // The file name, when the path sits directly inside one of this UFO's glyph
  // directories — any layer's, not just the default one. Null otherwise.
  const glyphDirFileName = (path: string) => {
    for (const dirPath of glyphDirPaths) {
      const prefix = `${dirPath}/`
      if (!path.startsWith(prefix)) {
        continue
      }
      const fileName = path.slice(prefix.length)
      // Nested paths are not part of a UFO glyph directory.
      return fileName.includes('/') ? null : fileName
    }
    return null
  }

  return {
    id: 'ufo',

    ignoredPaths: [],

    materialize: (options) => materializeUfoTree(options),

    listPaths: (projectId) => listUfoTreePaths(projectId),

    entityOwning: (path) => {
      if (layout.designspacePath && path === layout.designspacePath) {
        return { kind: 'font', part: 'designspace' }
      }

      const fileName = glyphDirFileName(path)
      if (fileName !== null) {
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

    canRemovePath: (path) => {
      if (layout.designspacePath && path === layout.designspacePath) {
        return true
      }
      const fileName = glyphDirFileName(path)
      if (fileName !== null) {
        // contents.plist is ours to rewrite, and a .glif only if our own
        // contents map named it — that map is the last state we synced, so it
        // covers both a glyph we deleted and the old name of one we renamed.
        return fileName === 'contents.plist' || knownFileNames.has(fileName)
      }
      if (!path.startsWith(ufoPrefix)) {
        return false
      }
      const name = path.slice(ufoPrefix.length)
      return !name.includes('/') && name in FONT_LEVEL_OWNERS
    },

    // A layer that holds no content for the glyph simply has no such file; an
    // ownership query errs towards naming every path the glyph could occupy.
    pathsOwnedBy: (entity) => {
      if (entity.kind === 'glyph') {
        const fileName = glyphFileName(entity.name)
        return glyphDirPaths.map((dirPath) => joinPath(dirPath, fileName))
      }
      if (entity.part === 'designspace') {
        return layout.designspacePath ? [layout.designspacePath] : []
      }
      if (entity.part === 'order') {
        return glyphDirPaths.map((dirPath) =>
          joinPath(dirPath, 'contents.plist')
        )
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
