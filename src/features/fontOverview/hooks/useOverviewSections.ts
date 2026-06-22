import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  flattenGlyphOverviewTree,
  getGlyphOverviewTree,
  type OverviewCustomFilter,
} from 'src/lib/glyph/glyphOverview'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import type { GlyphData } from 'src/store'

interface UseOverviewSectionsOptions {
  filteredGlyphList: GlyphData[]
  glyphEditTimes: GlyphEditTimes
  overviewCustomFilters: OverviewCustomFilter[]
  selectedSectionId: string
  onSelectedSectionChange: (sectionId: string) => void
}

export function useOverviewSections({
  filteredGlyphList,
  glyphEditTimes,
  overviewCustomFilters,
  selectedSectionId,
  onSelectedSectionChange,
}: UseOverviewSectionsOptions) {
  const { t } = useTranslation()

  const overviewGlyphs = filteredGlyphList

  const treeNodes = useMemo(
    () =>
      getGlyphOverviewTree(
        overviewGlyphs,
        glyphEditTimes,
        overviewCustomFilters
      ),
    [glyphEditTimes, overviewCustomFilters, overviewGlyphs]
  )

  const sections = useMemo(
    () => flattenGlyphOverviewTree(treeNodes),
    [treeNodes]
  )

  const translateSection = useMemo(
    () => (section: (typeof sections)[number]) => ({
      ...section,
      label: section.labelKey ? t(section.labelKey) : section.label,
    }),
    [t]
  )

  const visibleSections = useMemo(() => {
    const selectedSection = sections.find(
      (section) => section.id === selectedSectionId
    )
    return selectedSection?.glyphs.length
      ? [translateSection(selectedSection)]
      : []
  }, [sections, selectedSectionId, translateSection])

  const activeSection = useMemo(() => {
    if (selectedSectionId === 'all') {
      const allSection = sections.find((section) => section.id === 'all')
      return {
        id: 'all',
        label: t('fontOverview.allGlyphs'),
        glyphs: allSection?.glyphs ?? overviewGlyphs,
      }
    }

    const selectedSection = sections.find(
      (section) => section.id === selectedSectionId
    )
    return selectedSection
      ? translateSection(selectedSection)
      : {
          id: 'all',
          label: t('fontOverview.allGlyphs'),
          glyphs: overviewGlyphs,
        }
  }, [overviewGlyphs, sections, selectedSectionId, t, translateSection])

  useEffect(() => {
    if (
      selectedSectionId !== 'all' &&
      !sections.some((section) => section.id === selectedSectionId)
    ) {
      onSelectedSectionChange('all')
    }
  }, [onSelectedSectionChange, sections, selectedSectionId])

  return {
    activeSection,
    overviewGlyphs,
    sections,
    treeNodes,
    visibleSections,
  }
}
