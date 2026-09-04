import {
  listGlyphsPackagePaths,
  materializeGlyphsPackage,
} from '@/lib/fontFormats/glyphsPackageMaterialize'
import type {
  EntityId,
  FormatAdapter,
  FormatDetection,
} from '@/lib/fontFormats/formatAdapter/types'

export interface GlyphsPackageLayout {
  // The .glyphspackage directory, relative to the repo root.
  root: string
  // glyphId → .glyph file name, from the package's order and contents.
  fileNames?: Record<string, string>
}

const joinPath = (...parts: Array<string | null | undefined>) =>
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')

export const createGlyphsPackageFormatAdapter = (
  layout: GlyphsPackageLayout
): FormatAdapter => {
  const rootPrefix = layout.root ? `${layout.root}/` : ''
  const glyphDirPrefix = `${joinPath(layout.root, 'glyphs')}/`
  const fileNames = layout.fileNames ?? {}
  const knownFileNames = new Set(Object.values(fileNames))

  return {
    id: 'glyphspackage',

    // Glyphs writes UI state beside the source; it is not part of the design.
    ignoredPaths: [joinPath(layout.root, 'UIState.plist')],

    materialize: (options) => materializeGlyphsPackage(options),

    listPaths: (projectId) => listGlyphsPackagePaths(projectId),

    // A .glyph file carries every master, so one file is the whole glyph.
    mergePolicy: (entity) =>
      entity.kind === 'font' && entity.part === 'order' ? 'setMerge' : 'atomic',

    entityOwning: (path) => {
      if (path === joinPath(layout.root, 'UIState.plist')) {
        return null
      }
      if (path.startsWith(glyphDirPrefix)) {
        const fileName = path.slice(glyphDirPrefix.length)
        if (
          fileName.includes('/') ||
          !fileName.toLowerCase().endsWith('.glyph')
        ) {
          return null
        }
        const known = Object.entries(fileNames).find(
          ([, name]) => name === fileName
        )
        return {
          kind: 'glyph',
          name: known?.[0] ?? fileName.slice(0, -'.glyph'.length),
        }
      }
      if (!path.startsWith(rootPrefix)) {
        return null
      }
      const name = path.slice(rootPrefix.length)
      if (name === 'fontinfo.plist') {
        return { kind: 'font', part: 'info' }
      }
      if (name === 'order.plist') {
        return { kind: 'font', part: 'order' }
      }
      return null
    },

    canRemovePath: (path) => {
      const inGlyphDir = path.startsWith(glyphDirPrefix)
      if (inGlyphDir) {
        // Only a .glyph our own file-name map named: anything else under the
        // directory is a glyph this project has never known about.
        return knownFileNames.has(path.slice(glyphDirPrefix.length))
      }
      if (!path.startsWith(rootPrefix)) {
        return false
      }
      const name = path.slice(rootPrefix.length)
      return name === 'fontinfo.plist' || name === 'order.plist'
    },

    pathsOwnedBy: (entity: EntityId) => {
      if (entity.kind === 'glyph') {
        const fileName = fileNames[entity.name] ?? `${entity.name}.glyph`
        return [joinPath(layout.root, 'glyphs', fileName)]
      }
      if (entity.part === 'info') {
        return [joinPath(layout.root, 'fontinfo.plist')]
      }
      if (entity.part === 'order') {
        return [joinPath(layout.root, 'order.plist')]
      }
      // A .glyphspackage keeps kerning and features inside fontinfo.plist and
      // has no designspace of its own.
      return []
    },
  }
}

const PACKAGE_DIR = /(^|\/)([^/]+\.glyphspackage)\//i

export const detectGlyphsPackageSourceTrees = (
  paths: readonly string[]
): FormatDetection[] => {
  const roots = new Set<string>()
  for (const path of paths) {
    const match = PACKAGE_DIR.exec(path)
    if (!match) {
      continue
    }
    roots.add(path.slice(0, match.index + match[0].length - 1))
  }
  return [...roots].sort().map((root) => ({
    id: 'glyphspackage' as const,
    root,
    label: `${root} (Glyphs package)`,
  }))
}
