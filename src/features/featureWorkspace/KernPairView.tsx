import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import {
  shapeTextWithHarfBuzz,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'
import { useStore, type FontData, type KerningPair } from 'src/store'
import { ShapedRunSvg } from 'src/features/common/projectControl/fontSettings/features/components/ShapedRunSvg'
import { getShapingPreviewFontBuffer } from 'src/features/common/projectControl/fontSettings/features/utils/shapingPreviewFont'
import { PREVIEW_GLYPH_PLACEHOLDER } from 'src/features/common/projectControl/fontSettings/features/utils/shapingPreviewTokens'
import type { ShapingPreviewRun } from 'src/features/common/projectControl/fontSettings/features/hooks/useShapingPreview'

interface KernPairViewProps {
  fontData: FontData
  state: OpenTypeFeaturesState
  onOpenIrKern: (featureId: string) => void
}

// Group references are stored as ids or names; both display as @name.
const selectorLabel = (selector: GlyphSelector, fontData: FontData) => {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const group = (fontData.kerningGroups ?? []).find(
    (candidate) =>
      candidate.id === selector.classId ||
      candidate.name === selector.classId ||
      `@${candidate.name}` === selector.classId
  )
  return `@${(group?.name ?? selector.classId).replace(/^@/, '')}`
}

// A concrete glyph that can stand in for the selector in the pair preview.
const selectorSampleGlyph = (selector: GlyphSelector, fontData: FontData) => {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const group = (fontData.kerningGroups ?? []).find(
    (candidate) =>
      candidate.id === selector.classId ||
      candidate.name === selector.classId ||
      `@${candidate.name}` === selector.classId
  )
  return group?.glyphs.find((glyphId) => fontData.glyphs[glyphId]) ?? null
}

const pairKey = (pair: KerningPair, fontData: FontData) =>
  `${selectorLabel(pair.left, fontData)}|${selectorLabel(pair.right, fontData)}`

function PairPreview({
  fontData,
  state,
  pair,
}: {
  fontData: FontData
  state: OpenTypeFeaturesState
  pair: KerningPair
}) {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<{
    key: string
    before: ShapingPreviewRun
    after: ShapingPreviewRun
  } | null>(null)
  const leftGlyph = selectorSampleGlyph(pair.left, fontData)
  const rightGlyph = selectorSampleGlyph(pair.right, fontData)
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
      const shape = (features: string[]) =>
        shapeTextWithHarfBuzz(buffer, shapedText, {
          features,
          includeGlyphShapes: true,
          glyphTokens,
        })
      const [before, after] = await Promise.all([
        shape(['-kern']),
        shape(['+kern']),
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
  }, [fontData, state, leftGlyph, rightGlyph, key])

  if (!leftGlyph || !rightGlyph) {
    return (
      <Text fontSize="xs" color="mutedForeground">
        {t('featureWorkspace.kernPreviewUnavailable')}
      </Text>
    )
  }

  const current = runs && runs.key === key ? runs : null
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
}: KernPairViewProps) {
  const { t } = useTranslation()
  const upsertKerningPair = useStore((store) => store.upsertKerningPair)
  const deleteKerningPair = useStore((store) => store.deleteKerningPair)
  const [filter, setFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const pairs = useMemo(() => {
    const all = fontData.kerningPairs ?? []
    const query = filter.trim().toLowerCase()
    if (!query) {
      return all
    }
    return all.filter((pair) =>
      pairKey(pair, fontData).toLowerCase().includes(query)
    )
  }, [fontData, filter])

  const selectedPair =
    pairs.find((pair) => pairKey(pair, fontData) === selectedKey) ?? null
  const irKernFeature = state.features.find((feature) => feature.tag === 'kern')

  return (
    <Stack flex={1} minH={0} overflow="hidden" p={5} gap={3} maxW="1080px">
      <HStack gap={3} wrap="wrap">
        <Text fontSize="sm" fontWeight={800}>
          {t('featureWorkspace.kernTitle')}
        </Text>
        <Badge size="sm" variant="outline">
          {t('featureWorkspace.kernPairCount', {
            count: (fontData.kerningPairs ?? []).length,
          })}
        </Badge>
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
            const key = pairKey(pair, fontData)
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
                  {selectorLabel(pair.left, fontData)}
                </Text>
                <Text flex={1} minW={0} lineClamp={1}>
                  {selectorLabel(pair.right, fontData)}
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
                      upsertKerningPair(pair.left, pair.right, parsed)
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
                    deleteKerningPair(pair.left, pair.right)
                  }}
                >
                  ×
                </Button>
              </HStack>
            )
          }}
        />
      </Box>

      <Box borderTopWidth="1px" borderColor="controlBorder" pt={3} minH="96px">
        {selectedPair ? (
          <PairPreview fontData={fontData} state={state} pair={selectedPair} />
        ) : (
          <Text fontSize="xs" color="mutedForeground">
            {t('featureWorkspace.kernSelectHint')}
          </Text>
        )}
      </Box>
    </Stack>
  )
}
