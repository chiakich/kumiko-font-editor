import { useToast } from '@/components/ui/toast'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  isCjkDefaultFullWidthCodePoint,
  parseGlyphAdditionInput,
} from 'src/features/fontOverview/utils/glyphInput'
import {
  getExistingGlyphLookupKeys,
  hasGlyphCandidate,
} from 'src/features/fontOverview/utils/glyphLookup'
import { getGlyphNameInfoMap } from 'src/lib/glyph/glyphNameInfo'
import { useStore, type FontData, type GlyphData } from 'src/store'

interface UseAddGlyphsFlowOptions {
  fontData: FontData | null
  glyphMap: Record<string, GlyphData>
  onGlyphsAdded: (glyphIds: string[]) => void
}

export function useAddGlyphsFlow({
  fontData,
  glyphMap,
  onGlyphsAdded,
}: UseAddGlyphsFlowOptions) {
  const { t } = useTranslation()
  const toast = useToast()
  const addGlyphs = useStore((state) => state.addGlyphs)
  const [isAddingGlyphs, setIsAddingGlyphs] = useState(false)
  const [glyphInputValue, setGlyphInputValue] = useState('')
  const existingGlyphKeys = useMemo(
    () => getExistingGlyphLookupKeys(glyphMap),
    [glyphMap]
  )

  const closeAddGlyphModal = () => {
    setGlyphInputValue('')
    setIsAddingGlyphs(false)
  }

  const openAddGlyphModal = () => {
    setIsAddingGlyphs(true)
  }

  const addGlyphsFromInput = async (inputValue = glyphInputValue) => {
    // Fall back to regex-only resolution if the lookup table fails to load.
    const infoMap = await getGlyphNameInfoMap().catch(() => undefined)
    const candidates = parseGlyphAdditionInput(inputValue, infoMap)
    if (candidates.length === 0) {
      toast({
        title: t('fontOverview.noGlyphsToAdd'),
        description: t('fontOverview.addGlyphEmptyWarningDescription'),
        status: 'warning',
        duration: 2200,
        isClosable: true,
      })
      return
    }

    const defaultCjkWidth = fontData?.unitsPerEm ?? 1000
    const missingCandidates = candidates
      .filter((candidate) => !hasGlyphCandidate(existingGlyphKeys, candidate))
      .map((candidate) => {
        const codePoint = candidate.unicode
          ? Number.parseInt(candidate.unicode, 16)
          : null
        if (
          codePoint !== null &&
          Number.isFinite(codePoint) &&
          isCjkDefaultFullWidthCodePoint(codePoint)
        ) {
          return { ...candidate, width: defaultCjkWidth }
        }

        return candidate
      })
    const addedGlyphIds = addGlyphs(missingCandidates)
    if (addedGlyphIds.length > 0) {
      onGlyphsAdded(addedGlyphIds)
      closeAddGlyphModal()
    }

    const skippedCount = candidates.length - addedGlyphIds.length
    toast({
      title: addedGlyphIds.length > 0 ? '已新增字符' : '沒有新增字符',
      description:
        addedGlyphIds.length > 0
          ? `新增 ${addedGlyphIds.length} 個字符${skippedCount > 0 ? `，略過 ${skippedCount} 個已存在字符` : ''}。`
          : '輸入的字符都已經存在於專案中。',
      status: addedGlyphIds.length > 0 ? 'success' : 'info',
      duration: 2600,
      isClosable: true,
    })
  }

  const addGlyphNames = (glyphNames: string[]) => {
    void addGlyphsFromInput(glyphNames.join('\n'))
  }

  return {
    addGlyphNames,
    addGlyphsFromInput,
    closeAddGlyphModal,
    glyphInputValue,
    isAddingGlyphs,
    openAddGlyphModal,
    setGlyphInputValue,
  }
}
