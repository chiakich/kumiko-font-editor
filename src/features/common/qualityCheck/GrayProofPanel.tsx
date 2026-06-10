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
import { useMemo, useState } from 'react'
import type { FontData, GlyphData } from 'src/store'
import { ProofParagraphSvg } from 'src/features/common/qualityCheck/ProofLineSvg'
import type { QualityCheckMode } from 'src/features/common/qualityCheck/qualityCheckMode'
import {
  GRAY_PROOF_CHARACTER_LIMIT,
  buildGrayProofText,
  buildGrayStats,
  buildProofRun,
  getGlyphCharacter,
  grayArticlePresets,
} from 'src/features/common/qualityCheck/qualityProof'

interface GrayProofPanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  mode: QualityCheckMode
}

const paragraphSizes = [13, 20]

const toPercent = (ratio: number | null) =>
  ratio === null ? null : Math.round(ratio * 1000) / 10

export function GrayProofPanel({
  fontData,
  scopedGlyphs,
  mode,
}: GrayProofPanelProps) {
  const [articleIndex, setArticleIndex] = useState(0)
  const article = grayArticlePresets[articleIndex] ?? grayArticlePresets[0]

  const selectedCharacters = useMemo(
    () => (mode === 'selected' ? scopedGlyphs.map(getGlyphCharacter) : []),
    [mode, scopedGlyphs]
  )
  const selectedGlyphIdSet = useMemo(
    () =>
      mode === 'selected'
        ? new Set(scopedGlyphs.map((glyph) => glyph.id))
        : undefined,
    [mode, scopedGlyphs]
  )

  const proofText = useMemo(
    () =>
      mode === 'selected'
        ? buildGrayProofText(article, selectedCharacters)
        : article,
    [article, mode, selectedCharacters]
  )
  const proofCharacterLimit = useMemo(
    () =>
      mode === 'selected'
        ? Math.max(GRAY_PROOF_CHARACTER_LIMIT, Array.from(proofText).length)
        : GRAY_PROOF_CHARACTER_LIMIT,
    [mode, proofText]
  )

  const proofRun = useMemo(
    () => buildProofRun(fontData, proofText, proofCharacterLimit),
    [fontData, proofCharacterLimit, proofText]
  )
  const grayStats = useMemo(
    () => buildGrayStats(proofRun, fontData),
    [fontData, proofRun]
  )

  const meanPercent = toPercent(grayStats.meanInkRatio)
  const stdPercent = toPercent(grayStats.stdInkRatio)

  const selectedComparisons = useMemo(() => {
    if (mode !== 'selected' || grayStats.meanInkRatio === null) {
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
  }, [grayStats, mode, proofRun.glyphs, selectedGlyphIdSet])

  return (
    <Stack spacing={4}>
      <Text fontSize="sm" color="field.muted">
        {mode === 'selected'
          ? '把選取的字混排進一篇隨機文章，檢查它們的灰度（排版後的明暗密度）是否與其他字不同。選取的字以橘色標示。'
          : '把測試文章整段排出來，檢查整體灰度是否均勻，並找出排版時特別黑或特別淡的字。'}
      </Text>

      <HStack spacing={2} wrap="wrap">
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
        <Tag size="sm">{grayStats.sampleCount} 個漢字樣本</Tag>
        <Tag size="sm">missing {proofRun.missingCount}</Tag>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
        <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={3}>
          <Text fontSize="xs" color="field.muted" fontWeight="800">
            整段平均灰度
          </Text>
          <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
            {meanPercent === null ? 'N/A' : `${meanPercent}%`}
          </Text>
          <Progress value={meanPercent ?? 0} size="xs" colorScheme="yellow" />
        </Box>
        <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={3}>
          <Text fontSize="xs" color="field.muted" fontWeight="800">
            灰度標準差（越小越均勻）
          </Text>
          <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
            {stdPercent === null ? 'N/A' : `${stdPercent}%`}
          </Text>
        </Box>
        <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={3}>
          <Text fontSize="xs" color="field.muted" fontWeight="800">
            灰度離群字
          </Text>
          <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
            {grayStats.outliers.length}
          </Text>
        </Box>
      </SimpleGrid>

      <Stack spacing={3}>
        {paragraphSizes.map((fontSize) => (
          <Box
            key={fontSize}
            borderWidth={1}
            borderColor="field.line"
            bg="field.panel"
            p={4}
            overflowX="auto"
          >
            <Text fontFamily="mono" fontSize="xs" fontWeight="900" mb={2}>
              {fontSize}px
            </Text>
            <ProofParagraphSvg
              proofRun={proofRun}
              fontSize={fontSize}
              highlightGlyphIds={selectedGlyphIdSet}
            />
          </Box>
        ))}
      </Stack>

      {mode === 'selected' ? (
        <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={4}>
          <Text fontSize="sm" fontWeight="900" mb={3}>
            選取字 vs 文章平均灰度
          </Text>
          {selectedComparisons.length === 0 ? (
            <Text fontSize="sm" color="field.muted">
              選取的字沒有可估算灰度的輪廓，或不在文章中。
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              {selectedComparisons.map((comparison) => (
                <HStack key={comparison.glyphId} justify="space-between">
                  <HStack spacing={2} minW={0}>
                    <Text fontFamily="glyph" fontSize="lg" lineHeight={1}>
                      {comparison.character}
                    </Text>
                    <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                      {comparison.glyphName}
                    </Text>
                  </HStack>
                  <HStack spacing={2}>
                    <Text fontFamily="mono" fontSize="xs" color="field.muted">
                      {comparison.inkPercent === null
                        ? 'N/A'
                        : `${comparison.inkPercent}%`}
                      {comparison.deltaPercent === null
                        ? ''
                        : `（${comparison.deltaPercent > 0 ? '+' : ''}${comparison.deltaPercent}）`}
                    </Text>
                    <Badge
                      colorScheme={
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
        <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={4}>
          <Text fontSize="sm" fontWeight="900" mb={3}>
            灰度離群字（與整段平均差異顯著）
          </Text>
          {grayStats.outliers.length === 0 ? (
            <Text fontSize="sm" color="field.muted">
              這段文章中沒有灰度明顯偏離的字。
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              {grayStats.outliers.map((outlier) => (
                <HStack key={outlier.glyphId} justify="space-between">
                  <HStack spacing={2} minW={0}>
                    <Text fontFamily="glyph" fontSize="lg" lineHeight={1}>
                      {outlier.character}
                    </Text>
                    <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                      {outlier.glyphName}
                    </Text>
                  </HStack>
                  <HStack spacing={2}>
                    <Text fontFamily="mono" fontSize="xs" color="field.muted">
                      {outlier.inkRatio === null
                        ? 'N/A'
                        : `${toPercent(outlier.inkRatio)}%`}
                    </Text>
                    <Badge
                      colorScheme={outlier.deviation > 0 ? 'red' : 'orange'}
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
