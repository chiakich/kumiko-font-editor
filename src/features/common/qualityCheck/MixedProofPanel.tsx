import { Box, Button, HStack, Input, Stack, Tag, Text } from '@chakra-ui/react'
import { useMemo } from 'react'
import type { FontData, GlyphData } from 'src/store'
import { ProofLineSvg } from 'src/features/common/qualityCheck/ProofLineSvg'
import {
  buildProofRun,
  buildProofText,
  mixedProofPresets,
} from 'src/features/common/qualityCheck/qualityProof'

interface MixedProofPanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  proofText: string
  onProofTextChange: (value: string) => void
}

const proofSizes = [12, 16, 24, 40]

export function MixedProofPanel({
  fontData,
  scopedGlyphs,
  proofText,
  onProofTextChange,
}: MixedProofPanelProps) {
  const proofTextWithScope = useMemo(
    () => buildProofText(scopedGlyphs, proofText),
    [proofText, scopedGlyphs]
  )
  const proofRuns = useMemo(
    () =>
      proofSizes.map((fontSize) => ({
        fontSize,
        proofRun: buildProofRun(fontData, proofTextWithScope),
      })),
    [fontData, proofTextWithScope]
  )
  const matchedCount = proofRuns[0]?.proofRun.matchedCount ?? 0
  const missingCount = proofRuns[0]?.proofRun.missingCount ?? 0

  return (
    <Stack spacing={4}>
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
        <Tag size="sm">matched {matchedCount}</Tag>
        <Tag size="sm">missing {missingCount}</Tag>
        <Tag size="sm">{proofTextWithScope.length} chars</Tag>
      </HStack>

      <Stack
        spacing={3}
        bg="field.panel"
        borderWidth={1}
        borderColor="field.line"
        p={4}
      >
        {proofRuns.map(({ fontSize, proofRun }) => (
          <Box key={fontSize}>
            <Text fontFamily="mono" fontSize="xs" fontWeight="900" mb={1}>
              {fontSize}px
            </Text>
            <ProofLineSvg proofRun={proofRun} fontSize={fontSize} />
          </Box>
        ))}
      </Stack>
    </Stack>
  )
}
