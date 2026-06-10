import { useEffect, useMemo, useState } from 'react'
import { searchProjectGlyphsByComponent } from 'src/lib/componentSearchWorkerClient'
import {
  getGlyphCharacter,
  getRelatedGlyphs,
  isCjkCharacter,
} from 'src/lib/glyphRelations'
import {
  getGlyphwikiComposition,
  type GlyphwikiPartBox,
} from 'src/lib/glyphwikiComposition'
import {
  canonicalizeComponent,
  getGlyphwikiVariantMap,
} from 'src/lib/glyphwikiVariants'
import { scorePartFit } from 'src/lib/componentAssembly'
import type { GlyphData } from 'src/store'

interface SearchState {
  components: string[]
  activeComponent: string | null
  resultGlyphIds: string[]
  error: string | null
}

const EMPTY_SEARCH_STATE: SearchState = {
  components: [],
  activeComponent: null,
  resultGlyphIds: [],
  error: null,
}

interface UseGlyphReferenceSearchOptions {
  glyphs: GlyphData[]
  glyphMap: Record<string, GlyphData>
  selectedGlyph: GlyphData | null
}

export function useGlyphReferenceSearch({
  glyphs,
  glyphMap,
  selectedGlyph,
}: UseGlyphReferenceSearchOptions) {
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null
  )
  const [manualPreviewGlyphId, setManualPreviewGlyphId] = useState<
    string | null
  >(null)
  const [searchState, setSearchState] = useState<SearchState | null>(null)

  const selectedCharacter = getGlyphCharacter(selectedGlyph)
  const isCjkGlyph = isCjkCharacter(selectedCharacter)

  const relatedGlyphs = useMemo(
    () => (isCjkGlyph ? [] : getRelatedGlyphs(selectedGlyph, glyphs)),
    [glyphs, isCjkGlyph, selectedGlyph]
  )

  const projectGlyphSummaries = useMemo(
    () =>
      glyphs.map((glyph) => ({
        id: glyph.id,
        name: glyph.name,
        unicode: glyph.unicode ?? null,
      })),
    [glyphs]
  )

  const unsortedResultGlyphs = useMemo(
    () =>
      (isCjkGlyph
        ? (searchState?.resultGlyphIds ?? [])
        : relatedGlyphs.map((glyph) => glyph.id)
      )
        .map((glyphId) => glyphMap[glyphId])
        .filter((glyph): glyph is GlyphData => Boolean(glyph)),
    [glyphMap, isCjkGlyph, relatedGlyphs, searchState]
  )

  const activeComponentForRanking =
    selectedComponent ?? searchState?.activeComponent ?? null
  const partFitKey =
    isCjkGlyph && selectedCharacter && activeComponentForRanking
      ? `${selectedCharacter}:${activeComponentForRanking}`
      : null
  const searchComponents = searchState?.components ?? null
  const [partFitState, setPartFitState] = useState<{
    key: string
    targetPartBox: GlyphwikiPartBox | null
    partBoxesByComponent: Map<string, GlyphwikiPartBox[]>
    scoreByGlyphId: Map<string, number>
  } | null>(null)
  // Stale results are filtered by key instead of being reset synchronously.
  const partFit =
    partFitState && partFitState.key === partFitKey ? partFitState : null

  useEffect(() => {
    if (!partFitKey || !selectedCharacter || !activeComponentForRanking) {
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const [targetParts, variantMap] = await Promise.all([
          getGlyphwikiComposition(selectedCharacter),
          getGlyphwikiVariantMap().catch(() => new Map<string, string>()),
        ])
        // Datasets may name the same radical differently (⺣ vs 灬);
        // compare canonical forms on both sides.
        const canon = (character: string) =>
          canonicalizeComponent(variantMap, character)
        const activeCanonical = canon(activeComponentForRanking)

        const partBoxesByComponent = new Map<string, GlyphwikiPartBox[]>()
        for (const component of searchComponents ?? []) {
          const boxes = (targetParts ?? [])
            .filter((part) => canon(part.char) === canon(component))
            .map((part) => part.box)
          if (boxes.length > 0) {
            partBoxesByComponent.set(component, boxes)
          }
        }

        const targetPartBox =
          targetParts?.find((part) => canon(part.char) === activeCanonical)
            ?.box ?? null
        const scoreByGlyphId = new Map<string, number>()
        if (targetPartBox) {
          for (const glyph of unsortedResultGlyphs) {
            const character = getGlyphCharacter(glyph)
            if (!character) {
              continue
            }
            const donorParts = await getGlyphwikiComposition(character)
            const donorBox = donorParts?.find(
              (part) => canon(part.char) === activeCanonical
            )?.box
            if (donorBox) {
              scoreByGlyphId.set(
                glyph.id,
                scorePartFit(donorBox, targetPartBox)
              )
            }
          }
        }
        if (!cancelled) {
          setPartFitState({
            key: partFitKey,
            targetPartBox,
            partBoxesByComponent,
            scoreByGlyphId,
          })
        }
      } catch {
        if (!cancelled) {
          setPartFitState(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    activeComponentForRanking,
    partFitKey,
    searchComponents,
    selectedCharacter,
    unsortedResultGlyphs,
  ])

  // Donors whose part proportions best match the target placement first;
  // glyphs without GlyphWiki data keep their original relative order.
  const resultGlyphs = useMemo(() => {
    if (!partFit || partFit.scoreByGlyphId.size === 0) {
      return unsortedResultGlyphs
    }
    return [...unsortedResultGlyphs].sort(
      (left, right) =>
        (partFit.scoreByGlyphId.get(left.id) ?? Number.POSITIVE_INFINITY) -
        (partFit.scoreByGlyphId.get(right.id) ?? Number.POSITIVE_INFINITY)
    )
  }, [partFit, unsortedResultGlyphs])

  const previewGlyph =
    (manualPreviewGlyphId &&
    resultGlyphs.some((glyph) => glyph.id === manualPreviewGlyphId)
      ? glyphMap[manualPreviewGlyphId]
      : null) ??
    resultGlyphs[0] ??
    null
  const activeComponent = selectedComponent ?? searchState?.activeComponent

  useEffect(() => {
    if (!selectedGlyph || !selectedCharacter || !isCjkGlyph) {
      return
    }

    const controller = new AbortController()

    void searchProjectGlyphsByComponent({
      character: selectedCharacter,
      selectedComponent,
      currentGlyphId: selectedGlyph.id,
      projectGlyphs: projectGlyphSummaries,
      signal: controller.signal,
    })
      .then((result) => {
        setSearchState({
          components: result.components,
          activeComponent: result.activeComponent,
          resultGlyphIds: result.glyphIds,
          error: null,
        })

        if (
          result.activeComponent &&
          result.activeComponent !== selectedComponent
        ) {
          setSelectedComponent(result.activeComponent)
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setSearchState({
          components: [],
          activeComponent: null,
          resultGlyphIds: [],
          error: error instanceof Error ? error.message : '部件搜尋失敗',
        })
      })

    return () => controller.abort()
  }, [
    isCjkGlyph,
    projectGlyphSummaries,
    selectedCharacter,
    selectedComponent,
    selectedGlyph,
  ])

  const handleSelectComponent = (component: string) => {
    if (component === activeComponent) {
      return
    }

    setSelectedComponent(component)
    setManualPreviewGlyphId(null)
    setSearchState(null)
  }

  return {
    isCjkGlyph,
    loading: isCjkGlyph && Boolean(selectedGlyph) && searchState === null,
    previewGlyph,
    resultGlyphs,
    searchState: searchState ?? EMPTY_SEARCH_STATE,
    selectedCharacter,
    selectedComponent: activeComponent,
    targetPartBox: partFit?.targetPartBox ?? null,
    partBoxesByComponent: partFit?.partBoxesByComponent ?? null,
    setPreviewGlyphId: setManualPreviewGlyphId,
    setSelectedComponent: handleSelectComponent,
  }
}
