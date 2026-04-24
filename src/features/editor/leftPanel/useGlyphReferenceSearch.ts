import { useEffect, useMemo, useState } from 'react'
import { searchProjectGlyphsByComponent } from '../../../lib/componentSearchWorkerClient'
import {
  getGlyphCharacter,
  getRelatedGlyphs,
  isCjkCharacter,
} from '../../../lib/glyphRelations'
import type { GlyphData } from '../../../store'

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

  const resultGlyphs = useMemo(
    () =>
      (isCjkGlyph
        ? (searchState?.resultGlyphIds ?? [])
        : relatedGlyphs.map((glyph) => glyph.id)
      )
        .map((glyphId) => glyphMap[glyphId])
        .filter((glyph): glyph is GlyphData => Boolean(glyph)),
    [glyphMap, isCjkGlyph, relatedGlyphs, searchState]
  )

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
    setPreviewGlyphId: setManualPreviewGlyphId,
    setSelectedComponent: handleSelectComponent,
  }
}
