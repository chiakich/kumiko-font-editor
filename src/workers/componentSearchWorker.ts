import {
  canonicalizeComponent,
  getGlyphwikiVariantMap,
} from 'src/lib/glyphwikiVariants'

interface ProjectGlyphSummary {
  id: string
  name: string
  unicode: string | null
}

interface SearchComponentsMessage {
  type: 'search-components'
  payload: {
    requestId: string
    character: string
    selectedComponent?: string | null
    currentGlyphId?: string | null
    projectGlyphs: ProjectGlyphSummary[]
  }
}

interface CancelSearchMessage {
  type: 'cancel-search'
  payload: {
    requestId: string
  }
}

type WorkerRequestMessage = SearchComponentsMessage | CancelSearchMessage

interface SearchSuccessMessage {
  type: 'search-success'
  payload: {
    requestId: string
    components: string[]
    activeComponent: string | null
    glyphIds: string[]
  }
}

interface SearchErrorMessage {
  type: 'search-error'
  payload: {
    requestId: string
    message: string
  }
}

type WorkerResponseMessage = SearchSuccessMessage | SearchErrorMessage

const IDS_OPERATOR_MIN = 0x2ff0
// Unicode 15.1 extended the IDC block through U+2FFF.
const IDS_OPERATOR_MAX = 0x2fff
const IDS_OPERATOR_SUBTRACTION = 0x31ef
const IDS_SOURCE_PATH = '/ids/ids_babelstone.txt'
// How many decomposition levels feed the reverse index: with one-level
// source data (煙→火垔), depth 2 lets a search for 土 still find 煙.
const DECOMPOSITION_EXPANSION_DEPTH = 2

let datasetPromise: Promise<{
  decompositionMap: Map<string, string[]>
  variantMap: Map<string, string>
  reverseIndex: Map<string, string[]>
}> | null = null

const cancelledRequests = new Set<string>()

const toCodePointArray = (value: string) =>
  Array.from(value.replace(/^\uFEFF/, ''))

const shouldIgnoreCharacter = (character: string) => {
  const codePoint = character.codePointAt(0)
  return (
    !character ||
    character === '\t' ||
    character === ' ' ||
    character === '\r' ||
    character === '\n' ||
    (typeof codePoint === 'number' &&
      ((codePoint >= IDS_OPERATOR_MIN && codePoint <= IDS_OPERATOR_MAX) ||
        codePoint === IDS_OPERATOR_SUBTRACTION))
  )
}

const isPrivateUseCharacter = (character: string) => {
  const codePoint = character.codePointAt(0)
  return (
    typeof codePoint === 'number' &&
    ((codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
      (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
      (codePoint >= 0x100000 && codePoint <= 0x10fffd))
  )
}

const shouldKeepComponent = (component: string, target: string) =>
  component !== target &&
  !shouldIgnoreCharacter(component) &&
  !isPrivateUseCharacter(component)

const parseIdsSequenceComponents = (sequence: string) => {
  const components: string[] = []
  let metadataDepth = 0

  for (const character of toCodePointArray(sequence)) {
    if (character === '(' || character === '[' || character === '{') {
      metadataDepth += 1
      continue
    }

    if (character === ')' || character === ']' || character === '}') {
      metadataDepth = Math.max(0, metadataDepth - 1)
      continue
    }

    if (metadataDepth > 0) {
      continue
    }

    if (
      character === '#' ||
      character === '?' ||
      character === ':' ||
      character === '.' ||
      shouldIgnoreCharacter(character)
    ) {
      continue
    }

    components.push(character)
  }

  return components
}

const parseIdsColumn = (column: string | undefined, target: string) =>
  (column ?? '')
    .split(';')
    .map((sequence) =>
      parseIdsSequenceComponents(sequence).filter((component) =>
        shouldKeepComponent(component, target)
      )
    )
    .filter((components) => components.length > 0)

const addVariantsToIndexes = (
  target: string,
  variants: string[][],
  decompositionMap: Map<string, string[]>,
  reverseIndex: Map<string, Set<string>>
) => {
  if (variants.length === 0) {
    return
  }

  const existingComponents = decompositionMap.get(target) ?? []
  decompositionMap.set(target, [
    ...new Set([...existingComponents, ...variants.flat()]),
  ])

  const uniqueComponents = new Set(variants.flat())
  for (const component of uniqueComponents) {
    if (!reverseIndex.has(component)) {
      reverseIndex.set(component, new Set())
    }
    reverseIndex.get(component)?.add(target)
  }
}

const buildDataset = async () => {
  const [idsResponse, variantMap] = await Promise.all([
    fetch(IDS_SOURCE_PATH),
    // Variant-form matching is an enhancement; search still works without it.
    getGlyphwikiVariantMap().catch(() => new Map<string, string>()),
  ])

  if (!idsResponse.ok) {
    throw new Error(`無法載入 IDS 拆字資料：${idsResponse.status}`)
  }

  const decompositionMap = new Map<string, string[]>()
  const reverseIndex = new Map<string, Set<string>>()
  const idsText = await idsResponse.text()

  for (const rawLine of idsText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const [target, primaryIds, alternativeIds] = line
      .replace(/^\uFEFF/, '')
      .split('\t')
    if (!target || (!primaryIds && !alternativeIds)) {
      continue
    }

    const variants = [
      ...parseIdsColumn(primaryIds, target),
      ...parseIdsColumn(alternativeIds, target),
    ]
    addVariantsToIndexes(target, variants, decompositionMap, reverseIndex)
  }

  expandDecompositions(decompositionMap, reverseIndex)

  // Index by canonical form so searching 火 also finds chars decomposed
  // with ⺣/灬-style variant components, and vice versa.
  const canonicalReverseIndex = new Map<string, Set<string>>()
  for (const [component, characters] of reverseIndex) {
    const canonical = canonicalizeComponent(variantMap, component)
    const merged = canonicalReverseIndex.get(canonical) ?? new Set<string>()
    for (const character of characters) {
      merged.add(character)
    }
    canonicalReverseIndex.set(canonical, merged)
  }

  return {
    decompositionMap,
    variantMap,
    reverseIndex: new Map(
      [...canonicalReverseIndex.entries()].map(([component, characters]) => [
        component,
        [...characters],
      ])
    ),
  }
}

const expandDecompositions = (
  decompositionMap: Map<string, string[]>,
  reverseIndex: Map<string, Set<string>>
) => {
  const directComponents = new Map(decompositionMap)

  for (const [target, components] of directComponents) {
    const expanded = new Set(components)
    let frontier = components

    for (let depth = 1; depth < DECOMPOSITION_EXPANSION_DEPTH; depth += 1) {
      const nextFrontier: string[] = []
      for (const component of frontier) {
        for (const nested of directComponents.get(component) ?? []) {
          if (nested !== target && !expanded.has(nested)) {
            expanded.add(nested)
            nextFrontier.push(nested)
          }
        }
      }
      if (nextFrontier.length === 0) {
        break
      }
      frontier = nextFrontier
    }

    if (expanded.size === components.length) {
      continue
    }

    decompositionMap.set(target, [...expanded])
    for (const component of expanded) {
      if (!reverseIndex.has(component)) {
        reverseIndex.set(component, new Set())
      }
      reverseIndex.get(component)?.add(target)
    }
  }
}

const getDataset = () => {
  if (!datasetPromise) {
    datasetPromise = buildDataset()
  }
  return datasetPromise
}

const getGlyphCharacter = (glyph: ProjectGlyphSummary) => {
  if (glyph.unicode) {
    const codePoint = Number.parseInt(glyph.unicode, 16)
    if (Number.isFinite(codePoint)) {
      return String.fromCodePoint(codePoint)
    }
  }

  return Array.from(glyph.name ?? '').length === 1 ? glyph.name : null
}

const handleSearch = async (message: SearchComponentsMessage) => {
  const requestId = message.payload.requestId
  const dataset = await getDataset()
  if (cancelledRequests.has(requestId)) {
    cancelledRequests.delete(requestId)
    return
  }

  const components =
    dataset.decompositionMap.get(message.payload.character) ?? []
  const activeComponent =
    message.payload.selectedComponent &&
    components.includes(message.payload.selectedComponent)
      ? message.payload.selectedComponent
      : (components[0] ?? null)

  const matchingCharacters = activeComponent
    ? new Set(
        dataset.reverseIndex.get(
          canonicalizeComponent(dataset.variantMap, activeComponent)
        ) ?? []
      )
    : new Set<string>()

  const glyphIds = message.payload.projectGlyphs
    .filter((glyph) => glyph.id !== message.payload.currentGlyphId)
    .filter((glyph) => {
      const character = getGlyphCharacter(glyph)
      return character ? matchingCharacters.has(character) : false
    })
    .map((glyph) => glyph.id)
    .sort((left, right) => left.localeCompare(right))

  if (cancelledRequests.has(requestId)) {
    cancelledRequests.delete(requestId)
    return
  }

  ;(self as DedicatedWorkerGlobalScope).postMessage({
    type: 'search-success',
    payload: {
      requestId,
      components,
      activeComponent,
      glyphIds,
    },
  } satisfies WorkerResponseMessage)
}

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  if (event.data.type === 'cancel-search') {
    cancelledRequests.add(event.data.payload.requestId)
    return
  }

  void handleSearch(event.data).catch((error) => {
    ;(self as DedicatedWorkerGlobalScope).postMessage({
      type: 'search-error',
      payload: {
        requestId: event.data.payload.requestId,
        message: error instanceof Error ? error.message : '部件搜尋失敗',
      },
    } satisfies WorkerResponseMessage)
  })
}
