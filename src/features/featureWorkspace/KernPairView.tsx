import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import {
  shapeTextWithHarfBuzz,
  type OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures'
import type { GlyphSelector } from '@/lib/openTypeFeatures'
import {
  useStore,
  type FontData,
  type KerningGroup,
  type KerningPair,
} from '@/store'
import {
  getMasterKerningPairs,
  orientedKerning,
} from '@/lib/kerning/resolveKerning'
import { ShapedRunSvg } from '@/features/common/projectControl/fontSettings/features/components/ShapedRunSvg'
import { GlyphPickerPopover } from '@/features/common/projectControl/fontSettings/features/components/GlyphPickerPopover'
import { useOpenSpacingPairInEditor } from '@/features/editor/rightPanel/behaviors/useOpenBehaviorGlyphs'
import { EDITOR_RIGHT_PANEL_KERNING_TAB } from '@/features/editor/rightPanel/rightPanelTabs'
import { getShapingPreviewFontBuffer } from '@/features/common/projectControl/fontSettings/features/utils/shapingPreviewFont'
import { PREVIEW_GLYPH_PLACEHOLDER } from '@/features/common/projectControl/fontSettings/features/utils/shapingPreviewTokens'
import type { ShapingPreviewRun } from '@/features/common/projectControl/fontSettings/features/hooks/useShapingPreview'

interface KernPairViewProps {
  fontData: FontData
  state: OpenTypeFeaturesState
  onOpenIrKern: (featureId: string) => void
  // Load a word-list line into the workspace preview (jumps to home).
  onPreviewText: (text: string) => void
  // Which pair set to open on (the vkrn rail row opens the vertical tab).
  initialOrientation?: 'horizontal' | 'vertical'
}

// Group references are stored as ids or names (with or without '@'): one
// index resolves all three forms so pair rows never scan the group list.
type GroupIndex = ReadonlyMap<string, KerningGroup>

const buildGroupIndex = (fontData: FontData): GroupIndex => {
  const index = new Map<string, KerningGroup>()
  for (const group of fontData.kerningGroups ?? []) {
    index.set(group.id, group)
    index.set(group.name, group)
    index.set(`@${group.name}`, group)
  }
  return index
}

const selectorLabel = (selector: GlyphSelector, groups: GroupIndex) => {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const group = groups.get(selector.classId)
  return `@${(group?.name ?? selector.classId).replace(/^@/, '')}`
}

// A concrete glyph that can stand in for the selector in the pair preview.
const selectorSampleGlyph = (
  selector: GlyphSelector,
  groups: GroupIndex,
  fontData: FontData
) => {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const group = groups.get(selector.classId)
  return group?.glyphs.find((glyphId) => fontData.glyphs[glyphId]) ?? null
}

// Text form of one pair side: '@name' names a kerning group, anything else a
// glyph. Returns null when nothing in the project matches.
const parseKernSideText = (
  text: string,
  fontData: FontData,
  groups: GroupIndex
): GlyphSelector | null => {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('@')) {
    const name = trimmed.slice(1)
    const group = groups.get(name) ?? groups.get(trimmed)
    return group ? { kind: 'class', classId: group.id } : null
  }
  return fontData.glyphs[trimmed] ? { kind: 'glyph', glyph: trimmed } : null
}

function KernSideField({
  fontData,
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  fontData: FontData
  value: string
  onChange: (next: string) => void
  'aria-label': string
}) {
  const { t } = useTranslation()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  return (
    <HStack gap={0.5}>
      <Input
        size="2xs"
        width="140px"
        fontFamily="mono"
        value={value}
        aria-label={ariaLabel}
        placeholder={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        size="2xs"
        variant="ghost"
        aria-label={t('projectControl.glyphPickerOpen')}
        onClick={() => setIsPickerOpen(true)}
      >
        ⌕
      </Button>
      {isPickerOpen ? (
        <GlyphPickerPopover
          fontData={fontData}
          isOpen={isPickerOpen}
          initialQuery={value.startsWith('@') ? '' : value}
          onClose={() => setIsPickerOpen(false)}
          onPick={(glyphId) => onChange(glyphId)}
        />
      ) : null}
    </HStack>
  )
}

const pairKey = (pair: KerningPair, groups: GroupIndex) =>
  `${selectorLabel(pair.left, groups)}|${selectorLabel(pair.right, groups)}`

function PairPreview({
  fontData,
  state,
  pair,
  orientation,
}: {
  fontData: FontData
  state: OpenTypeFeaturesState
  pair: KerningPair
  orientation: 'horizontal' | 'vertical'
}) {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<{
    key: string
    before: ShapingPreviewRun
    after: ShapingPreviewRun
  } | null>(null)
  const groups = useMemo(() => buildGroupIndex(fontData), [fontData])
  const leftGlyph = selectorSampleGlyph(pair.left, groups, fontData)
  const rightGlyph = selectorSampleGlyph(pair.right, groups, fontData)
  const key = `${leftGlyph}|${rightGlyph}|${pair.value}`

  useEffect(() => {
    if (!leftGlyph || !rightGlyph) {
      return
    }
    let cancelled = false
    const run = async () => {
      const buffer = await getShapingPreviewFontBuffer(
        fontData,
        fontData.openTypeFeatures
      )
      const text = PREVIEW_GLYPH_PLACEHOLDER.repeat(2)
      // Tokens sit outside GPOS, so the pair is shaped as real characters
      // when encoded; unencoded members fall back to tokens (no kern shown).
      const leftChar = fontData.glyphs[leftGlyph]?.unicodes?.[0]
      const rightChar = fontData.glyphs[rightGlyph]?.unicodes?.[0]
      const usable =
        leftChar &&
        rightChar &&
        Number.isFinite(Number.parseInt(leftChar, 16)) &&
        Number.isFinite(Number.parseInt(rightChar, 16))
      const shapedText = usable
        ? String.fromCodePoint(Number.parseInt(leftChar, 16)) +
          String.fromCodePoint(Number.parseInt(rightChar, 16))
        : text
      const glyphTokens = usable
        ? new Map<number, string>()
        : new Map([
            [0, leftGlyph],
            [1, rightGlyph],
          ])
      const tag = orientation === 'vertical' ? 'vkrn' : 'kern'
      const shape = (features: string[]) =>
        shapeTextWithHarfBuzz(buffer, shapedText, {
          features,
          includeGlyphShapes: true,
          glyphTokens,
          ...(orientation === 'vertical' ? { direction: 'ttb' as const } : {}),
        })
      const [before, after] = await Promise.all([
        shape([`-${tag}`]),
        shape([`+${tag}`]),
      ])
      if (cancelled || !before.ok || !after.ok) {
        return
      }
      const unitsPerEm = after.unitsPerEm ?? 1000
      setRuns({
        key,
        before: { glyphs: before.glyphs, unitsPerEm },
        after: { glyphs: after.glyphs, unitsPerEm },
      })
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [fontData, state, leftGlyph, rightGlyph, key, orientation])

  if (!leftGlyph || !rightGlyph) {
    return (
      <Text fontSize="xs" color="mutedForeground">
        {t('featureWorkspace.kernPreviewUnavailable')}
      </Text>
    )
  }

  const current = runs && runs.key === key ? runs : null
  const runDirection = orientation === 'vertical' ? 'ttb' : 'ltr'
  return (
    <HStack gap={5} align="center" minH="72px">
      {current ? (
        <>
          <Stack gap={1} align="center">
            <Text fontSize="9px" fontFamily="mono" color="mutedForeground">
              {t('projectControl.shapingBefore')}
            </Text>
            <Box opacity={0.45}>
              <ShapedRunSvg
                glyphs={current.before.glyphs}
                unitsPerEm={current.before.unitsPerEm}
                direction={runDirection}
                size={52}
              />
            </Box>
          </Stack>
          <Stack gap={1} align="center">
            <Text fontSize="9px" fontFamily="mono" color="mutedForeground">
              {t('projectControl.shapingAfter')}
            </Text>
            <ShapedRunSvg
              glyphs={current.after.glyphs}
              unitsPerEm={current.after.unitsPerEm}
              direction={runDirection}
              size={52}
            />
          </Stack>
          <Text fontSize="xs" fontFamily="mono" color="yellow.600">
            {pair.value}
          </Text>
        </>
      ) : (
        <Spinner size="xs" color="mutedForeground" />
      )}
    </HStack>
  )
}

// The kern feature's own workbench: a projection of the project's kerning
// pairs (the single source of truth the compiler synthesizes from), not of the
// IR — with an escape hatch to any imported GPOS kern rules.
export function KernPairView({
  fontData,
  state,
  onOpenIrKern,
  onPreviewText,
  initialOrientation,
}: KernPairViewProps) {
  const { t } = useTranslation()
  const upsertKerningPair = useStore((store) => store.upsertKerningPair)
  const deleteKerningPair = useStore((store) => store.deleteKerningPair)
  const requestEditorRightPanelTab = useStore(
    (store) => store.requestEditorRightPanelTab
  )
  const openSpacingPairInEditor = useOpenSpacingPairInEditor()
  const activeMasterId = useStore((store) => store.activeMasterId)
  // Horizontal (kern) and vertical (vkrn) pair sets share this workbench.
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(
    initialOrientation ?? 'horizontal'
  )
  // Non-default masters carry their own pair sets; edits below go through the
  // kerning actions, which target the same active master and orientation.
  const masterPairs = getMasterKerningPairs(
    fontData,
    activeMasterId,
    orientation
  )
  const activeMasterName =
    activeMasterId &&
    orientedKerning(fontData, orientation).kerningPairsByMaster?.[
      activeMasterId
    ]
      ? (fontData.sources?.[activeMasterId]?.name ?? activeMasterId)
      : null
  const [filter, setFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [wordListText, setWordListText] = useState('')
  const [draftLeft, setDraftLeft] = useState('')
  const [draftRight, setDraftRight] = useState('')
  const [draftValue, setDraftValue] = useState('')

  const groups = useMemo(() => buildGroupIndex(fontData), [fontData])
  const draftLeftSelector = parseKernSideText(draftLeft, fontData, groups)
  const draftRightSelector = parseKernSideText(draftRight, fontData, groups)
  const draftValueNumber = Number(draftValue.trim())
  const canAddPair =
    Boolean(draftLeftSelector && draftRightSelector) &&
    draftValue.trim() !== '' &&
    Number.isFinite(draftValueNumber)
  const commitNewPair = () => {
    if (!canAddPair || !draftLeftSelector || !draftRightSelector) {
      return
    }
    upsertKerningPair(
      draftLeftSelector,
      draftRightSelector,
      draftValueNumber,
      orientation
    )
    setDraftLeft('')
    setDraftRight('')
    setDraftValue('')
  }

  const pairs = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) {
      return masterPairs
    }
    return masterPairs.filter((pair) =>
      pairKey(pair, groups).toLowerCase().includes(query)
    )
  }, [masterPairs, filter, groups])

  const selectedPair =
    pairs.find((pair) => pairKey(pair, groups) === selectedKey) ?? null
  const irKernFeature = state.features.find(
    (feature) => feature.tag === (orientation === 'vertical' ? 'vkrn' : 'kern')
  )

  return (
    <Stack flex={1} minH={0} overflow="hidden" p={5} gap={3} maxW="1080px">
      <HStack gap={3} wrap="wrap">
        <Text fontSize="sm" fontWeight={800}>
          {t('featureWorkspace.kernTitle')}
        </Text>
        <HStack gap={0.5} bg="muted" borderRadius="md" p="2px">
          <Button
            size="2xs"
            variant={orientation === 'horizontal' ? 'solid' : 'ghost'}
            onClick={() => {
              setOrientation('horizontal')
              setSelectedKey(null)
            }}
          >
            {t('featureWorkspace.kernHorizontal')}
          </Button>
          <Button
            size="2xs"
            variant={orientation === 'vertical' ? 'solid' : 'ghost'}
            onClick={() => {
              setOrientation('vertical')
              setSelectedKey(null)
            }}
          >
            {t('featureWorkspace.kernVertical')}
          </Button>
        </HStack>
        <Badge size="sm" variant="outline">
          {t('featureWorkspace.kernPairCount', {
            count: masterPairs.length,
          })}
        </Badge>
        {activeMasterName ? (
          <Badge size="sm" variant="subtle" fontFamily="mono">
            {t('featureWorkspace.kernMaster', { master: activeMasterName })}
          </Badge>
        ) : null}
        <Input
          size="xs"
          maxW="260px"
          fontFamily="mono"
          value={filter}
          placeholder={t('projectControl.ruleTableFilter')}
          onChange={(event) => setFilter(event.target.value)}
        />
        <Box flex={1} />
        <Text fontSize="xs" color="mutedForeground">
          {t('featureWorkspace.kernSourceHint')}
        </Text>
      </HStack>

      <HStack gap={2} wrap="wrap">
        <KernSideField
          fontData={fontData}
          value={draftLeft}
          onChange={setDraftLeft}
          aria-label={t('featureWorkspace.kernNewLeft')}
        />
        <KernSideField
          fontData={fontData}
          value={draftRight}
          onChange={setDraftRight}
          aria-label={t('featureWorkspace.kernNewRight')}
        />
        <Input
          size="2xs"
          width="72px"
          textAlign="right"
          fontFamily="mono"
          value={draftValue}
          aria-label={t('featureWorkspace.kernValue')}
          placeholder="-40"
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitNewPair()
            }
          }}
        />
        <Button
          size="2xs"
          variant="outline"
          disabled={!canAddPair}
          onClick={commitNewPair}
        >
          {t('featureWorkspace.kernAddPair')}
        </Button>
      </HStack>

      {irKernFeature ? (
        <HStack
          gap={3}
          px={3}
          py={2}
          borderWidth="1px"
          borderColor="controlBorder"
          borderRadius="md"
          bg="card"
        >
          <Text fontSize="xs" color="mutedForeground">
            {t('featureWorkspace.kernIrNote')}
          </Text>
          <Button
            size="2xs"
            variant="outline"
            onClick={() => onOpenIrKern(irKernFeature.id)}
          >
            {t('featureWorkspace.kernIrOpen')}
          </Button>
        </HStack>
      ) : null}

      <Box
        borderWidth="1px"
        borderColor="controlBorder"
        borderRadius="md"
        overflow="hidden"
        flex={1}
        minH="240px"
      >
        <Virtuoso
          style={{ height: '100%' }}
          totalCount={pairs.length}
          itemContent={(index) => {
            const pair = pairs[index]
            if (!pair) {
              return null
            }
            const key = pairKey(pair, groups)
            const isSelected = key === selectedKey
            return (
              <HStack
                gap={3}
                px={3}
                py={1.5}
                borderBottomWidth="1px"
                borderColor="controlBorder"
                fontFamily="mono"
                fontSize="12px"
                bg={isSelected ? 'muted' : undefined}
                cursor="pointer"
                onClick={() => setSelectedKey(isSelected ? null : key)}
              >
                <Text flex={1} minW={0} lineClamp={1}>
                  {selectorLabel(pair.left, groups)}
                </Text>
                <Text flex={1} minW={0} lineClamp={1}>
                  {selectorLabel(pair.right, groups)}
                </Text>
                <Input
                  size="2xs"
                  width="72px"
                  textAlign="right"
                  fontFamily="mono"
                  aria-label={t('featureWorkspace.kernValue')}
                  key={`${key}:${pair.value}`}
                  defaultValue={String(pair.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={(event) => {
                    const parsed = Number(event.target.value.trim())
                    if (Number.isFinite(parsed) && parsed !== pair.value) {
                      upsertKerningPair(
                        pair.left,
                        pair.right,
                        parsed,
                        orientation
                      )
                    } else {
                      event.target.value = String(pair.value)
                    }
                  }}
                />
                <Button
                  size="2xs"
                  variant="ghost"
                  color="mutedForeground"
                  aria-label={t('featureWorkspace.kernDelete')}
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteKerningPair(pair.left, pair.right, orientation)
                  }}
                >
                  ×
                </Button>
              </HStack>
            )
          }}
        />
      </Box>

      <Stack gap={1.5}>
        <HStack gap={2}>
          <Text fontSize="xs" fontWeight={700}>
            {t('featureWorkspace.kernWordList')}
          </Text>
          <Text fontSize="10px" color="mutedForeground">
            {t('featureWorkspace.kernWordListHint')}
          </Text>
        </HStack>
        <Textarea
          size="xs"
          fontFamily="glyph"
          rows={2}
          value={wordListText}
          placeholder={t('featureWorkspace.kernWordListPlaceholder')}
          aria-label={t('featureWorkspace.kernWordList')}
          onChange={(event) => setWordListText(event.target.value)}
        />
        <HStack gap={1} wrap="wrap">
          {wordListText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => (
              <Button
                key={`${index}_${line}`}
                size="2xs"
                variant="outline"
                fontFamily="glyph"
                onClick={() => onPreviewText(line)}
              >
                {line}
              </Button>
            ))}
        </HStack>
      </Stack>

      <Box borderTopWidth="1px" borderColor="controlBorder" pt={3} minH="96px">
        {selectedPair ? (
          <HStack gap={4} align="center">
            <PairPreview
              fontData={fontData}
              state={state}
              pair={selectedPair}
              orientation={orientation}
            />
            {(() => {
              const left = selectorSampleGlyph(
                selectedPair.left,
                groups,
                fontData
              )
              const right = selectorSampleGlyph(
                selectedPair.right,
                groups,
                fontData
              )
              // The editor's Kerning panel edits horizontal pairs only.
              return left && right && orientation === 'horizontal' ? (
                <Button
                  size="2xs"
                  variant="outline"
                  onClick={() => {
                    requestEditorRightPanelTab(EDITOR_RIGHT_PANEL_KERNING_TAB)
                    openSpacingPairInEditor(left, right)
                  }}
                >
                  {t('featureWorkspace.kernOpenInEditor')}
                </Button>
              ) : null
            })()}
          </HStack>
        ) : (
          <Text fontSize="xs" color="mutedForeground">
            {t('featureWorkspace.kernSelectHint')}
          </Text>
        )}
      </Box>
    </Stack>
  )
}
