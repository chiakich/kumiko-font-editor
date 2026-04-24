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
const IDS_OPERATOR_MAX = 0x2ffb
const IDS_SOURCE_PATH = '/ids/ids_lv2.txt'
const HANSEEKER_DATA_PATH = '/hanseeker/data_nosupp.txt'
const HANSEEKER_VARIANT_PATH = '/hanseeker/data_vt.txt'

let datasetPromise: Promise<{
  decompositionMap: Map<string, string[]>
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
      codePoint >= IDS_OPERATOR_MIN &&
      codePoint <= IDS_OPERATOR_MAX)
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

const parseHanseekerVariants = (
  payload: string,
  target: string,
  variantMap: Map<string, string>
) => {
  const variants: string[][] = []
  let current = ''

  for (const character of toCodePointArray(payload)) {
    if (character === '@' || character === '!') {
      if (current) {
        variants.push(
          toCodePointArray(current)
            .map((item) => variantMap.get(item) ?? item)
            .filter((item) => shouldKeepComponent(item, target))
        )
      }
      current = ''
      continue
    }

    current += character
  }

  if (current) {
    variants.push(
      toCodePointArray(current)
        .map((item) => variantMap.get(item) ?? item)
        .filter((item) => shouldKeepComponent(item, target))
    )
  }

  return variants.filter((variant) => variant.length > 0)
}

const loadHanseekerVariantMap = async () => {
  const response = await fetch(HANSEEKER_VARIANT_PATH)
  if (!response.ok) {
    throw new Error(`無法載入 Hanseeker 異體資料：${response.status}`)
  }

  const text = await response.text()
  const variantMap = new Map<string, string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const [variant, canonical] = line.replace(/^\uFEFF/, '').split('\t')
    if (
      variant &&
      canonical &&
      !isPrivateUseCharacter(variant) &&
      !isPrivateUseCharacter(canonical)
    ) {
      variantMap.set(variant, canonical)
    }
  }

  return variantMap
}

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
  const [idsResponse, hanseekerVariantMap, hanseekerResponse] =
    await Promise.all([
      fetch(IDS_SOURCE_PATH),
      loadHanseekerVariantMap(),
      fetch(HANSEEKER_DATA_PATH),
    ])

  if (!idsResponse.ok) {
    throw new Error(`無法載入 IDS 拆字資料：${idsResponse.status}`)
  }

  if (!hanseekerResponse.ok) {
    throw new Error(`無法載入 Hanseeker 拆字資料：${hanseekerResponse.status}`)
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

  const hanseekerText = await hanseekerResponse.text()
  for (const rawLine of hanseekerText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const characters = toCodePointArray(line)
    const target = characters[0]
    const payload = characters.slice(1).join('')
    if (!target || !payload || isPrivateUseCharacter(target)) {
      continue
    }

    const variants = parseHanseekerVariants(
      payload,
      target,
      hanseekerVariantMap
    )
    addVariantsToIndexes(target, variants, decompositionMap, reverseIndex)
  }

  return {
    decompositionMap,
    reverseIndex: new Map(
      [...reverseIndex.entries()].map(([component, characters]) => [
        component,
        [...characters],
      ])
    ),
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
    ? new Set(dataset.reverseIndex.get(activeComponent) ?? [])
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
