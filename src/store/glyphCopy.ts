import type {
  GlyphComponentRef,
  GlyphData,
  GlyphLayerContent,
  GlyphLayerData,
} from 'src/store/types'

const copySuffix = (copyIndex: number) =>
  copyIndex === 1 ? '.copy' : `.copy${copyIndex}`

export const createGlyphCopyId = (
  sourceGlyphId: string,
  reservedGlyphIds: Set<string>
) => {
  let copyIndex = 1
  let copyId = `${sourceGlyphId}${copySuffix(copyIndex)}`

  while (reservedGlyphIds.has(copyId)) {
    copyIndex += 1
    copyId = `${sourceGlyphId}${copySuffix(copyIndex)}`
  }

  return copyId
}

const uniqueGlyphsById = (glyphs: GlyphData[]) => {
  const seenGlyphIds = new Set<string>()
  return glyphs.filter((glyph) => {
    if (!glyph.id || seenGlyphIds.has(glyph.id)) {
      return false
    }
    seenGlyphIds.add(glyph.id)
    return true
  })
}

const retargetComponentRefs = (
  componentRefs: GlyphComponentRef[] | undefined,
  copyIdBySourceId: Map<string, string>
) => {
  for (const componentRef of componentRefs ?? []) {
    componentRef.glyphId =
      copyIdBySourceId.get(componentRef.glyphId) ?? componentRef.glyphId
  }
}

const retargetLayerContent = (
  layer: (GlyphLayerData | GlyphLayerContent | null | undefined) & {
    background?: GlyphLayerContent | null
  },
  copyIdBySourceId: Map<string, string>
) => {
  if (!layer) {
    return
  }

  retargetComponentRefs(layer.componentRefs, copyIdBySourceId)
  retargetComponentRefs(layer.background?.componentRefs, copyIdBySourceId)
}

export const createGlyphCopies = (
  sourceGlyphs: GlyphData[],
  existingGlyphIds: Iterable<string>
) => {
  const reservedGlyphIds = new Set(existingGlyphIds)
  const uniqueSourceGlyphs = uniqueGlyphsById(sourceGlyphs)
  const copyIdBySourceId = new Map<string, string>()

  for (const sourceGlyph of uniqueSourceGlyphs) {
    const copyId = createGlyphCopyId(sourceGlyph.id, reservedGlyphIds)
    reservedGlyphIds.add(copyId)
    copyIdBySourceId.set(sourceGlyph.id, copyId)
  }

  return uniqueSourceGlyphs.map((sourceGlyph) => {
    const copyId = copyIdBySourceId.get(sourceGlyph.id) ?? sourceGlyph.id
    const glyphCopy = structuredClone(sourceGlyph)

    glyphCopy.id = copyId
    glyphCopy.name = copyId
    glyphCopy.unicodes = []
    glyphCopy.production = null
    glyphCopy.componentGlyphIds = glyphCopy.componentGlyphIds?.map(
      (componentGlyphId) =>
        copyIdBySourceId.get(componentGlyphId) ?? componentGlyphId
    )

    for (const layer of Object.values(glyphCopy.layers ?? {})) {
      retargetLayerContent(layer, copyIdBySourceId)
    }

    return glyphCopy
  })
}

export const insertGlyphIdsAfter = (
  glyphOrder: string[],
  glyphIds: string[],
  afterGlyphId: string | null | undefined
) => {
  const glyphIdsToInsert = [...new Set(glyphIds)]
  const insertedGlyphIdSet = new Set(glyphIdsToInsert)
  const nextGlyphOrder = glyphOrder.filter(
    (glyphId) => !insertedGlyphIdSet.has(glyphId)
  )
  const insertIndex = afterGlyphId ? nextGlyphOrder.indexOf(afterGlyphId) : -1

  if (insertIndex < 0) {
    return [...nextGlyphOrder, ...glyphIdsToInsert]
  }

  return [
    ...nextGlyphOrder.slice(0, insertIndex + 1),
    ...glyphIdsToInsert,
    ...nextGlyphOrder.slice(insertIndex + 1),
  ]
}
