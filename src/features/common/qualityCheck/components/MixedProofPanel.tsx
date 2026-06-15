import {
  Box,
  Button,
  HStack,
  Input,
  Stack,
  Switch,
  Tag,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import type { FontData, GlyphData } from 'src/store'
import { ProofLineSvg } from 'src/features/common/qualityCheck/components/ProofLineSvg'
import {
  buildMixedProofText,
  buildMixedScriptMetrics,
  buildProofRun,
  getGlyphCharacter,
  mixedProofPresets,
} from 'src/features/common/qualityCheck/utils/qualityProof'
import type { QualityScope } from 'src/features/common/qualityCheck/utils/qualityLint'
import { useTranslation } from 'react-i18next'

interface MixedProofPanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  scope: QualityScope
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
  scope,
  proofText,
  onProofTextChange,
}: MixedProofPanelProps) {
  const { t } = useTranslation()
  const [showHighlight, setShowHighlight] = useState(false)
  const isFocusedScope = scope !== 'font'
  const proofTextWithScope = useMemo(
    () =>
      isFocusedScope
        ? buildMixedProofText(scopedGlyphs.map(getGlyphCharacter), proofText)
        : proofText,
    [isFocusedScope, proofText, scopedGlyphs]
  )
  const proofRun = useMemo(
    () => buildProofRun(fontData, proofTextWithScope),
    [fontData, proofTextWithScope]
  )
  const metrics = useMemo(() => buildMixedScriptMetrics(fontData), [fontData])
  const selectedGlyphIdSet = useMemo(
    () =>
      isFocusedScope
        ? new Set(scopedGlyphs.map((glyph) => glyph.id))
        : undefined,
    [isFocusedScope, scopedGlyphs]
  )
  const highlightedGlyphIds =
    isFocusedScope && showHighlight ? selectedGlyphIdSet : undefined

  const capRatio = formatRatio(metrics.latinCapHeight, metrics.hanFaceHeight)
  const xRatio = formatRatio(metrics.latinXHeight, metrics.hanFaceHeight)
  const digitRatio = formatRatio(metrics.digitHeight, metrics.hanFaceHeight)

  return (
    <Stack spacing={4}>
      <Text fontSize="sm" color="field.muted">
        {isFocusedScope
          ? t('qualityCheck.mixedProof.focusedDescription')
          : t('qualityCheck.mixedProof.description')}
      </Text>

      <HStack spacing={3} wrap="wrap" justify="space-between">
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
        {isFocusedScope ? (
          <HStack spacing={2} ml="auto">
            <Switch
              size="sm"
              aria-label={t('qualityCheck.highlightScopedGlyphs')}
              isChecked={showHighlight}
              onChange={(event) => setShowHighlight(event.target.checked)}
            />
            <Text fontSize="xs" color="field.muted" fontWeight="800">
              {t('qualityCheck.highlightScopedGlyphs')}
            </Text>
          </HStack>
        ) : null}
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
          <Box key={fontSize} overflowX="auto">
            <Text fontFamily="mono" fontSize="xs" fontWeight="900" mb={1}>
              {fontSize}px
            </Text>
            <ProofLineSvg
              proofRun={proofRun}
              fontSize={fontSize}
              highlightGlyphIds={highlightedGlyphIds}
            />
          </Box>
        ))}
      </Stack>
    </Stack>
  )
}
