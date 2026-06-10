import { Box, Button, HStack, Input, Stack, Tag, Text } from '@chakra-ui/react'
import { useMemo } from 'react'
import type { FontData, GlyphData } from 'src/store'
import { ProofLineSvg } from 'src/features/common/qualityCheck/ProofLineSvg'
import type { QualityCheckMode } from 'src/features/common/qualityCheck/qualityCheckMode'
import {
  buildMixedProofText,
  buildMixedScriptMetrics,
  buildProofRun,
  getGlyphCharacter,
  mixedProofPresets,
} from 'src/features/common/qualityCheck/qualityProof'

interface MixedProofPanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  mode: QualityCheckMode
  proofText: string
  onProofTextChange: (value: string) => void
}

const proofSizes = [12, 16, 24, 40]

const formatRatio = (numerator: number | null, denominator: number | null) =>
  numerator === null || denominator === null || denominator <= 0
    ? null
    : Math.round((numerator / denominator) * 100)

export function MixedProofPanel({
  fontData,
  scopedGlyphs,
  mode,
  proofText,
  onProofTextChange,
}: MixedProofPanelProps) {
  const proofTextWithScope = useMemo(
    () =>
      mode === 'selected'
        ? buildMixedProofText(scopedGlyphs.map(getGlyphCharacter), proofText)
        : proofText,
    [mode, proofText, scopedGlyphs]
  )
  const proofRun = useMemo(
    () => buildProofRun(fontData, proofTextWithScope),
    [fontData, proofTextWithScope]
  )
  const metrics = useMemo(() => buildMixedScriptMetrics(fontData), [fontData])
  const selectedGlyphIdSet = useMemo(
    () =>
      mode === 'selected'
        ? new Set(scopedGlyphs.map((glyph) => glyph.id))
        : undefined,
    [mode, scopedGlyphs]
  )

  const capRatio = formatRatio(metrics.latinCapHeight, metrics.hanFaceHeight)
  const xRatio = formatRatio(metrics.latinXHeight, metrics.hanFaceHeight)
  const digitRatio = formatRatio(metrics.digitHeight, metrics.hanFaceHeight)

  return (
    <Stack spacing={4}>
      <Text fontSize="sm" color="field.muted">
        混排檢查：不同文字系統、語言與數字同時出現在同一段文字時，觀察彼此的大小、
        基線與節奏是否協調。
        {mode === 'selected'
          ? '選取的字已與拉丁字母、數字穿插排列（橘色標示）。'
          : ''}
      </Text>

      <HStack spacing={2} wrap="wrap">
        {mixedProofPresets.map((preset) => (
          <Button
            key={preset}
            size="xs"
            variant={preset === proofText ? 'solid' : 'outline'}
            onClick={() => onProofTextChange(preset)}
          >
            {preset.slice(0, 8)}
          </Button>
        ))}
      </HStack>

      <Input
        value={proofText}
        onChange={(event) => onProofTextChange(event.target.value)}
      />

      <HStack spacing={2} wrap="wrap">
        <Tag size="sm">matched {proofRun.matchedCount}</Tag>
        <Tag size="sm">missing {proofRun.missingCount}</Tag>
        <Tag size="sm">
          大寫高/漢字字面 {capRatio === null ? 'N/A' : `${capRatio}%`}
        </Tag>
        <Tag size="sm">
          x字高/漢字字面 {xRatio === null ? 'N/A' : `${xRatio}%`}
        </Tag>
        <Tag size="sm">
          數字高/漢字字面 {digitRatio === null ? 'N/A' : `${digitRatio}%`}
        </Tag>
      </HStack>

      <Stack
        spacing={3}
        bg="field.panel"
        borderWidth={1}
        borderColor="field.line"
        p={4}
      >
        {proofSizes.map((fontSize) => (
          <Box key={fontSize}>
            <Text fontFamily="mono" fontSize="xs" fontWeight="900" mb={1}>
              {fontSize}px
            </Text>
            <ProofLineSvg
              proofRun={proofRun}
              fontSize={fontSize}
              highlightGlyphIds={selectedGlyphIdSet}
            />
          </Box>
        ))}
      </Stack>
    </Stack>
  )
}
