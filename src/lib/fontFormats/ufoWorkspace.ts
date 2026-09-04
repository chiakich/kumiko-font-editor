import {
  designspaceDefaultLocation,
  parseDesignspace,
  type Designspace,
} from '@/lib/fontFormats/designspace'
import { parseXmlPlist } from '@/lib/fontFormats/ufoPlist'

export interface ParsedUfoFolder {
  ufoId: string
  relativePath: string
  files: Record<string, string>
}

interface UfoTextEntry {
  relativePath: string
  text: string
}

export interface UfoWorkspaceEntry {
  relativePath: string
  text: string
}

export const normalizePath = (value: string) => value.replace(/\\/g, '/')

// UI-state key: the parsed designspace, persisted so multi-master survives reload
// (UFO projects are rebuilt from the ufo stores, not the draft fontData).
export const UFO_DESIGNSPACE_KEY = 'ufo-designspace'

export const isDesignspaceFile = (relativePath: string) =>
  normalizePath(relativePath).toLowerCase().endsWith('.designspace')

export const isRelevantUfoTextFile = (relativePath: string) => {
  const normalized = normalizePath(relativePath).toLowerCase()
  if (!normalized.includes('.ufo/')) {
    return false
  }

  return (
    normalized.endsWith('.glif') ||
    normalized.endsWith('.plist') ||
    normalized.endsWith('.fea')
  )
}

const findUfoRoot = (relativePath: string) => {
  const normalized = normalizePath(relativePath).replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index]?.toLowerCase().endsWith('.ufo')) {
      return {
        ufoId: segments.slice(0, index + 1).join('/'),
        relativePath: segments.slice(0, index + 1).join('/'),
        innerPath: segments.slice(index + 1).join('/'),
      }
    }
  }
  return null
}

export const getProjectTitleFromFolder = (files: FileList | File[]) => {
  const first = Array.from(files)[0]
  const path = first?.webkitRelativePath || first?.name || 'Untitled'
  return normalizePath(path).split('/')[0] ?? 'Untitled'
}

export const basename = (path: string) =>
  path.split('/').filter(Boolean).pop() ?? path

export const locationsEqual = (
  a: Record<string, number>,
  b: Record<string, number>
): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) {
      return false
    }
  }
  return true
}

export const buildWorkspaceFileMapFromEntries = (
  entries: UfoWorkspaceEntry[]
) => {
  const candidateEntries = entries.filter((entry) =>
    isRelevantUfoTextFile(entry.relativePath)
  )

  if (candidateEntries.length === 0) {
    throw new Error('選到的資料夾裡沒有找到任何可讀的 UFO 文字檔')
  }

  const byUfo = new Map<string, ParsedUfoFolder>()
  for (const entry of candidateEntries) {
    const root = findUfoRoot(entry.relativePath)
    if (!root || !root.innerPath) {
      continue
    }
    const parsed = byUfo.get(root.relativePath) ?? {
      ufoId: root.ufoId,
      relativePath: root.relativePath,
      files: {},
    }
    parsed.files[root.innerPath] = entry.text
    byUfo.set(root.relativePath, parsed)
  }

  return [...byUfo.values()].sort((left, right) =>
    left.ufoId.localeCompare(right.ufoId)
  )
}

const dirname = (path: string) => {
  const normalized = normalizePath(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : ''
}

const joinRelativePath = (baseDir: string, path: string) => {
  const parts = normalizePath(`${baseDir ? `${baseDir}/` : ''}${path}`)
    .split('/')
    .filter(Boolean)
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '.') {
      continue
    }
    if (part === '..') {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }
  return resolved.join('/')
}

const normalizedNameKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.designspace$/i, '')
    .replace(/[^a-z0-9]+/g, '')

const sourceFolderNameKeys = (sourceFolderName?: string) => {
  if (!sourceFolderName) {
    return new Set<string>()
  }
  const normalized = normalizePath(sourceFolderName)
  const lastSegment = basename(normalized)
  return new Set(
    [normalized, lastSegment]
      .flatMap((value) => [
        value,
        value.replace(/\.git$/i, ''),
        value.replace(/-\d+$/i, ''),
        value.replace(/-main$/i, ''),
        value.replace(/-master$/i, ''),
      ])
      .map(normalizedNameKey)
      .filter(Boolean)
  )
}

const discouragedDesignspaceNamePenalty = (relativePath: string) => {
  const name = basename(relativePath).toLowerCase()
  const penalties: Array<[RegExp, number]> = [
    [/missing/, 400],
    [/no[-_ ]?default/, 320],
    [/open[-_ ]?nodes?/, 180],
    [/weight[-_ ]only|width[-_ ]only|[-_ ]only/, 120],
    [/extrapolat/, 100],
    [/anisotropic/, 80],
    [/test|debug|experiment|partial/, 40],
  ]
  return penalties.reduce(
    (total, [pattern, penalty]) => total + (pattern.test(name) ? penalty : 0),
    0
  )
}

export interface DesignspaceCandidate {
  relativePath: string
  fileName: string
  axes: Array<{ name: string; tag: string }>
  sourceCount: number
  matchedSourceCount: number
  missingSourceCount: number
  missingSourceFilenames: string[]
  hasDefaultSource: boolean
  score: number
  recommended: boolean
  parseError?: string
}

const scoreDesignspaceCandidate = (input: {
  relativePath: string
  designspace: Designspace
  matchedSourceCount: number
  missingSourceCount: number
  hasDefaultSource: boolean
  sourceFolderKeys: Set<string>
}) => {
  const candidateKey = normalizedNameKey(basename(input.relativePath))
  const exactFolderNameMatch = input.sourceFolderKeys.has(candidateKey)
  const partialFolderNameMatch = [...input.sourceFolderKeys].some(
    (key) =>
      key && (candidateKey.startsWith(key) || key.startsWith(candidateKey))
  )
  const completeSources =
    input.designspace.sources.length > 0 && input.missingSourceCount === 0

  return (
    input.matchedSourceCount * 30 +
    input.designspace.axes.length * 12 +
    input.designspace.sources.length +
    (completeSources ? 140 : 0) +
    (input.hasDefaultSource ? 30 : 0) +
    (exactFolderNameMatch ? 360 : partialFolderNameMatch ? 80 : 0) +
    (basename(input.relativePath).toLowerCase().includes('variable') ? 20 : 0) -
    input.missingSourceCount * 260 -
    dirname(input.relativePath).split('/').filter(Boolean).length * 8 -
    discouragedDesignspaceNamePenalty(input.relativePath)
  )
}

export const listDesignspaceCandidates = (
  entries: UfoWorkspaceEntry[],
  options: { sourceFolderName?: string } = {}
): DesignspaceCandidate[] => {
  const designspaceEntries = entries.filter((entry) =>
    isDesignspaceFile(entry.relativePath)
  )
  if (designspaceEntries.length === 0) {
    return []
  }

  let parsedUfos: ParsedUfoFolder[] = []
  try {
    parsedUfos = buildWorkspaceFileMapFromEntries(entries)
  } catch {
    parsedUfos = []
  }

  const ufoPaths = new Set(parsedUfos.map((ufo) => normalizePath(ufo.ufoId)))
  const ufoBasenames = new Set(parsedUfos.map((ufo) => basename(ufo.ufoId)))
  const layerIdsByUfoPath = new Map<string, Set<string>>()
  const layerIdsByUfoBasename = new Map<string, Set<string>>()
  for (const ufo of parsedUfos) {
    const rawLayercontents = ufo.files['layercontents.plist']
      ? (parseXmlPlist(ufo.files['layercontents.plist']) as unknown[])
      : [['public.default', 'glyphs']]
    const layerIds = new Set(
      Array.isArray(rawLayercontents)
        ? rawLayercontents
            .map((entry) => (Array.isArray(entry) ? String(entry[0]) : null))
            .filter((entry): entry is string => Boolean(entry))
        : ['public.default']
    )
    layerIdsByUfoPath.set(normalizePath(ufo.ufoId), layerIds)
    layerIdsByUfoBasename.set(basename(ufo.ufoId), layerIds)
  }
  const sourceFolderKeys = sourceFolderNameKeys(options.sourceFolderName)

  const candidates = designspaceEntries.map((entry): DesignspaceCandidate => {
    try {
      const designspace = parseDesignspace(entry.text, entry.relativePath)
      const baseDir = dirname(entry.relativePath)
      const missingSourceFilenames = designspace.sources
        .filter((source) => {
          const resolved = joinRelativePath(baseDir, source.filename)
          const sourceBasename = basename(source.filename)
          const hasUfo =
            ufoPaths.has(resolved) || ufoBasenames.has(sourceBasename)
          if (!hasUfo) {
            return true
          }
          if (!source.layer) {
            return false
          }
          const layerIds =
            layerIdsByUfoPath.get(resolved) ??
            layerIdsByUfoBasename.get(sourceBasename)
          return !layerIds?.has(source.layer)
        })
        .map((source) =>
          source.layer ? `${source.filename}#${source.layer}` : source.filename
        )
      const missingSourceCount = missingSourceFilenames.length
      const matchedSourceCount = Math.max(
        0,
        designspace.sources.length - missingSourceCount
      )
      const defaultLocation = designspaceDefaultLocation(designspace)
      const hasDefaultSource = designspace.sources.some((source) =>
        locationsEqual(source.location, defaultLocation)
      )
      const score = scoreDesignspaceCandidate({
        relativePath: entry.relativePath,
        designspace,
        matchedSourceCount,
        missingSourceCount,
        hasDefaultSource,
        sourceFolderKeys,
      })
      return {
        relativePath: entry.relativePath,
        fileName: basename(entry.relativePath),
        axes: designspace.axes.map((axis) => ({
          name: axis.name,
          tag: axis.tag,
        })),
        sourceCount: designspace.sources.length,
        matchedSourceCount,
        missingSourceCount,
        missingSourceFilenames,
        hasDefaultSource,
        score,
        recommended: false,
      }
    } catch (error) {
      return {
        relativePath: entry.relativePath,
        fileName: basename(entry.relativePath),
        axes: [],
        sourceCount: 0,
        matchedSourceCount: 0,
        missingSourceCount: 0,
        missingSourceFilenames: [],
        hasDefaultSource: false,
        score: Number.NEGATIVE_INFINITY,
        recommended: false,
        parseError:
          error instanceof Error ? error.message : 'Invalid designspace',
      }
    }
  })

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.relativePath.localeCompare(right.relativePath)
  )
  const recommended = candidates.find((candidate) => !candidate.parseError)
  if (recommended) {
    recommended.recommended = true
  }
  return candidates
}

export const pickDesignspaceEntry = (
  entries: UfoWorkspaceEntry[],
  options: { sourceFolderName?: string; designspacePath?: string | null }
) => {
  if (options.designspacePath) {
    const requested = normalizePath(options.designspacePath)
    return entries.find(
      (entry) =>
        isDesignspaceFile(entry.relativePath) &&
        normalizePath(entry.relativePath) === requested
    )
  }

  const recommendedPath = listDesignspaceCandidates(entries, {
    sourceFolderName: options.sourceFolderName,
  }).find((candidate) => candidate.recommended)?.relativePath
  return recommendedPath
    ? entries.find(
        (entry) => normalizePath(entry.relativePath) === recommendedPath
      )
    : entries.find((entry) => isDesignspaceFile(entry.relativePath))
}

export const buildWorkspaceEntriesFromFiles = async (
  inputFiles: FileList | File[]
) => {
  const candidateFiles = Array.from(inputFiles).filter((file) => {
    const path = file.webkitRelativePath || file.name
    return isRelevantUfoTextFile(path) || isDesignspaceFile(path)
  })

  const entries: UfoTextEntry[] = []
  for (const file of candidateFiles) {
    const relativePath = normalizePath(file.webkitRelativePath || file.name)
    try {
      entries.push({
        relativePath,
        text: await file.text(),
      })
    } catch (error) {
      throw new Error(
        `無法讀取 UFO 檔案：${relativePath}。${error instanceof Error ? error.message : '未知讀取錯誤'}`
      )
    }
  }

  return entries
}
