import { useEffect, useMemo, useState } from 'react'
import { searchProjectGlyphsByComponent } from '@/lib/components/componentSearchWorkerClient'
import {
  getGlyphCharacter,
  getRelatedGlyphs,
  isCjkCharacter,
} from '@/lib/glyph/glyphRelations'
import { getPrimaryGlyphUnicode } from '@/lib/glyph/glyphUnicode'
import {
  getGlyphwikiCompositionDeep,
  type GlyphwikiPartBox,
} from '@/lib/glyph/glyphwikiComposition'
import {
  canonicalizeComponent,
  getGlyphwikiVariantMap,
} from '@/lib/glyph/glyphwikiVariants'
import { scorePartFit } from '@/lib/components/componentAssembly'
import type { GlyphData } from '@/domain'

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

const GLYPH_SUMMARY_KEY_SEPARATOR = '\u0001'
const GLYPH_SUMMARY_ITEM_SEPARATOR = '\u0002'

interface ProjectGlyphSummary {
  id: string
  name: string
  unicode: string | null
}

interface StableModel<T> {
  key: string
  items: T[]
}

const STABLE_MODEL_CACHE_LIMIT = 24

const projectGlyphSummaryCache = new Map<
  string,
  StableModel<ProjectGlyphSummary>
>()
const partFitGlyphCache = new Map<string, StableModel<GlyphData>>()

const cacheStableModel = <T>(
  cache: Map<string, StableModel<T>>,
  model: StableModel<T>
) => {
  const cached = cache.get(model.key)
  if (cached) {
    return cached
  }

  cache.set(model.key, model)
  if (cache.size > STABLE_MODEL_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) {
      cache.delete(oldestKey)
    }
  }
  return model
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
  const selectedGlyphId = selectedGlyph?.id ?? null
  const isCjkGlyph = isCjkCharacter(selectedCharacter)

  const relatedGlyphs = useMemo(
    () => (isCjkGlyph ? [] : getRelatedGlyphs(selectedGlyph, glyphs)),
    [glyphs, isCjkGlyph, selectedGlyph]
  )

  const projectGlyphSummaries = useMemo(() => {
    const items: ProjectGlyphSummary[] = glyphs.map((glyph) => ({
      id: glyph.id,
      name: glyph.name,
      unicode: getPrimaryGlyphUnicode(glyph),
    }))
    return cacheStableModel(projectGlyphSummaryCache, {
      key: items
        .map((glyph) =>
          [glyph.id, glyph.name, glyph.unicode ?? ''].join(
            GLYPH_SUMMARY_KEY_SEPARATOR
          )
        )
        .join(GLYPH_SUMMARY_ITEM_SEPARATOR),
      items,
    }).items
  }, [glyphs])

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
  const partFitGlyphs = useMemo(
    () =>
      cacheStableModel(partFitGlyphCache, {
        key: unsortedResultGlyphs
          .map((glyph) =>
            [glyph.id, getGlyphCharacter(glyph) ?? ''].join(
              GLYPH_SUMMARY_KEY_SEPARATOR
            )
          )
          .join(GLYPH_SUMMARY_ITEM_SEPARATOR),
        items: unsortedResultGlyphs,
      }).items,
    [unsortedResultGlyphs]
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
          getGlyphwikiCompositionDeep(selectedCharacter),
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
          for (const glyph of partFitGlyphs) {
            const character = getGlyphCharacter(glyph)
            if (!character) {
              continue
            }
            const donorParts = await getGlyphwikiCompositionDeep(character)
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
    partFitGlyphs,
    partFitKey,
    searchComponents,
    selectedCharacter,
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
    if (!selectedGlyphId || !selectedCharacter || !isCjkGlyph) {
      return
    }

    const controller = new AbortController()

    void searchProjectGlyphsByComponent({
      character: selectedCharacter,
      selectedComponent,
      currentGlyphId: selectedGlyphId,
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
    selectedGlyphId,
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
