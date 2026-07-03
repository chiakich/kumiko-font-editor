import {
  Badge,
  Box,
  Button,
  HStack,
  Progress,
  SimpleGrid,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import { Switch } from '@/components/ui/switch'
import { useMemo, useState } from 'react'
import type { FontData, GlyphData } from 'src/store'
import { ProofParagraphSvg } from 'src/features/common/qualityCheck/components/ProofLineSvg'
import {
  GRAY_PROOF_CHARACTER_LIMIT,
  buildGrayProofText,
  buildGrayStats,
  buildProofRun,
  getGlyphCharacter,
  grayArticlePresets,
} from 'src/lib/qualityCheck/qualityProof'
import type { QualityScope } from 'src/lib/qualityCheck/qualityLint'
import { useTranslation } from 'react-i18next'

interface GrayProofPanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  scope: QualityScope
}

const paragraphSizes = [13, 20]

const toPercent = (ratio: number | null) =>
  ratio === null ? null : Math.round(ratio * 1000) / 10

export function GrayProofPanel({
  fontData,
  scopedGlyphs,
  scope,
}: GrayProofPanelProps) {
  const { t } = useTranslation()
  const [articleIndex, setArticleIndex] = useState(0)
  const [showHighlight, setShowHighlight] = useState(false)
  const article = grayArticlePresets[articleIndex] ?? grayArticlePresets[0]
  const isFocusedScope = scope !== 'font'

  const selectedCharacters = useMemo(
    () => (isFocusedScope ? scopedGlyphs.map(getGlyphCharacter) : []),
    [isFocusedScope, scopedGlyphs]
  )
  const selectedGlyphIdSet = useMemo(
    () =>
      isFocusedScope
        ? new Set(scopedGlyphs.map((glyph) => glyph.id))
        : undefined,
    [isFocusedScope, scopedGlyphs]
  )

  const proofText = useMemo(
    () =>
      isFocusedScope
        ? buildGrayProofText(article, selectedCharacters)
        : article,
    [article, isFocusedScope, selectedCharacters]
  )
  const proofCharacterLimit = useMemo(
    () =>
      isFocusedScope
        ? Math.max(GRAY_PROOF_CHARACTER_LIMIT, Array.from(proofText).length)
        : GRAY_PROOF_CHARACTER_LIMIT,
    [isFocusedScope, proofText]
  )

  const proofRun = useMemo(
    () => buildProofRun(fontData, proofText, proofCharacterLimit),
    [fontData, proofCharacterLimit, proofText]
  )
  const grayStats = useMemo(() => buildGrayStats(proofRun), [proofRun])
  const highlightedGlyphIds =
    isFocusedScope && showHighlight ? selectedGlyphIdSet : undefined

  const meanPercent = toPercent(grayStats.meanInkRatio)
  const stdPercent = toPercent(grayStats.stdInkRatio)

  const selectedComparisons = useMemo(() => {
    if (!isFocusedScope || grayStats.meanInkRatio === null) {
      return []
    }
    const mean = grayStats.meanInkRatio
    const std = grayStats.stdInkRatio ?? 0
    const threshold = Math.max(std * 2, 0.03)
    const seen = new Set<string>()
    const comparisons: Array<{
      glyphId: string
      glyphName: string
      character: string
      inkPercent: number | null
      deltaPercent: number | null
      tone: 'ok' | 'dark' | 'light' | 'unknown'
    }> = []
    for (const proofGlyph of proofRun.glyphs) {
      if (
        !proofGlyph.glyphId ||
        !selectedGlyphIdSet?.has(proofGlyph.glyphId) ||
        seen.has(proofGlyph.glyphId)
      ) {
        continue
      }
      seen.add(proofGlyph.glyphId)
      const ratio = proofGlyph.inkRatio
      comparisons.push({
        glyphId: proofGlyph.glyphId,
        glyphName: proofGlyph.glyphName ?? proofGlyph.character,
        character: proofGlyph.character,
        inkPercent: toPercent(ratio),
        deltaPercent: ratio === null ? null : toPercent(ratio - mean),
        tone:
          ratio === null
            ? 'unknown'
            : ratio - mean > threshold
              ? 'dark'
              : mean - ratio > threshold
                ? 'light'
                : 'ok',
      })
    }
    return comparisons
  }, [grayStats, isFocusedScope, proofRun.glyphs, selectedGlyphIdSet])

  return (
    <Stack gap={4}>
      <Text fontSize="sm" color="mutedForeground">
        {isFocusedScope
          ? t('qualityCheck.grayProof.focusedDescription')
          : t('qualityCheck.grayProof.description')}
      </Text>
      <HStack gap={3} wrap="wrap" justify="space-between">
        <HStack gap={2} wrap="wrap">
          {grayArticlePresets.map((preset, index) => (
            <Button
              key={preset.slice(0, 8)}
              size="xs"
              variant={index === articleIndex ? 'solid' : 'outline'}
              onClick={() => setArticleIndex(index)}
            >
              文章 {index + 1}
            </Button>
          ))}
          <Tag.Root size="sm">{grayStats.sampleCount} 個漢字樣本</Tag.Root>
          <Tag.Root size="sm">missing {proofRun.missingCount}</Tag.Root>
        </HStack>
        {isFocusedScope ? (
          <HStack gap={2} ml="auto">
            <Switch
              size="sm"
              aria-label={t('qualityCheck.highlightScopedGlyphs')}
              checked={showHighlight}
              onCheckedChange={(details) => setShowHighlight(details.checked)}
            />
            <Text fontSize="xs" color="mutedForeground" fontWeight="800">
              {t('qualityCheck.highlightScopedGlyphs')}
            </Text>
          </HStack>
        ) : null}
      </HStack>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
        <Box borderWidth={1} borderColor="border" bg="card" p={3}>
          <Text fontSize="xs" color="mutedForeground" fontWeight="800">
            整段平均灰度
          </Text>
          <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
            {meanPercent === null ? 'N/A' : `${meanPercent}%`}
          </Text>
          <Progress.Root
            value={meanPercent ?? 0}
            size="xs"
            colorPalette="yellow"
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
        </Box>
        <Box borderWidth={1} borderColor="border" bg="card" p={3}>
          <Text fontSize="xs" color="mutedForeground" fontWeight="800">
            灰度標準差（越小越均勻）
          </Text>
          <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
            {stdPercent === null ? 'N/A' : `${stdPercent}%`}
          </Text>
        </Box>
        <Box borderWidth={1} borderColor="border" bg="card" p={3}>
          <Text fontSize="xs" color="mutedForeground" fontWeight="800">
            灰度離群字
          </Text>
          <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
            {grayStats.outliers.length}
          </Text>
        </Box>
      </SimpleGrid>
      <Stack gap={3}>
        {paragraphSizes.map((fontSize) => (
          <Box
            key={fontSize}
            borderWidth={1}
            borderColor="border"
            bg="card"
            p={4}
            overflowX="auto"
          >
            <Text fontFamily="mono" fontSize="xs" fontWeight="900" mb={2}>
              {fontSize}px
            </Text>
            <ProofParagraphSvg
              proofRun={proofRun}
              fontSize={fontSize}
              highlightGlyphIds={highlightedGlyphIds}
            />
          </Box>
        ))}
      </Stack>
      {isFocusedScope ? (
        <Box borderWidth={1} borderColor="border" bg="card" p={4}>
          <Text fontSize="sm" fontWeight="900" mb={3}>
            範圍內字 vs 文章平均灰度
          </Text>
          {selectedComparisons.length === 0 ? (
            <Text fontSize="sm" color="mutedForeground">
              檢查範圍內沒有可估算灰度的輪廓，或不在文章中。
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
              {selectedComparisons.map((comparison) => (
                <HStack key={comparison.glyphId} justify="space-between">
                  <HStack gap={2} minW={0}>
                    <Text fontFamily="glyph" fontSize="lg" lineHeight={1}>
                      {comparison.character}
                    </Text>
                    <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                      {comparison.glyphName}
                    </Text>
                  </HStack>
                  <HStack gap={2}>
                    <Text
                      fontFamily="mono"
                      fontSize="xs"
                      color="mutedForeground"
                    >
                      {comparison.inkPercent === null
                        ? 'N/A'
                        : `${comparison.inkPercent}%`}
                      {comparison.deltaPercent === null
                        ? ''
                        : `（${comparison.deltaPercent > 0 ? '+' : ''}${comparison.deltaPercent}）`}
                    </Text>
                    <Badge
                      colorPalette={
                        comparison.tone === 'ok'
                          ? 'green'
                          : comparison.tone === 'dark'
                            ? 'red'
                            : comparison.tone === 'light'
                              ? 'orange'
                              : 'gray'
                      }
                    >
                      {comparison.tone === 'ok'
                        ? '灰度一致'
                        : comparison.tone === 'dark'
                          ? '偏黑'
                          : comparison.tone === 'light'
                            ? '偏淡'
                            : 'N/A'}
                    </Badge>
                  </HStack>
                </HStack>
              ))}
            </SimpleGrid>
          )}
        </Box>
      ) : (
        <Box borderWidth={1} borderColor="border" bg="card" p={4}>
          <Text fontSize="sm" fontWeight="900" mb={3}>
            灰度離群字（與整段平均差異顯著）
          </Text>
          {grayStats.outliers.length === 0 ? (
            <Text fontSize="sm" color="mutedForeground">
              這段文章中沒有灰度明顯偏離的字。
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
              {grayStats.outliers.map((outlier) => (
                <HStack key={outlier.glyphId} justify="space-between">
                  <HStack gap={2} minW={0}>
                    <Text fontFamily="glyph" fontSize="lg" lineHeight={1}>
                      {outlier.character}
                    </Text>
                    <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                      {outlier.glyphName}
                    </Text>
                  </HStack>
                  <HStack gap={2}>
                    <Text
                      fontFamily="mono"
                      fontSize="xs"
                      color="mutedForeground"
                    >
                      {outlier.inkRatio === null
                        ? 'N/A'
                        : `${toPercent(outlier.inkRatio)}%`}
                    </Text>
                    <Badge
                      colorPalette={outlier.deviation > 0 ? 'red' : 'orange'}
                    >
                      {outlier.deviation > 0 ? '偏黑' : '偏淡'}
                    </Badge>
                  </HStack>
                </HStack>
              ))}
            </SimpleGrid>
          )}
        </Box>
      )}
    </Stack>
  )
}
