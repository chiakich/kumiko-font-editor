import {
  Box,
  HStack,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useMemo } from 'react'
import type { FontData, GlyphData } from 'src/store'
import { ProofLineSvg } from 'src/features/common/qualityCheck/ProofLineSvg'
import {
  buildGlyphInkSamples,
  buildGrayProofRows,
  buildProofText,
} from 'src/features/common/qualityCheck/qualityProof'

interface GrayProofPanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  proofText: string
}

export function GrayProofPanel({
  fontData,
  scopedGlyphs,
  proofText,
}: GrayProofPanelProps) {
  const proofTextWithScope = useMemo(
    () => buildProofText(scopedGlyphs, proofText),
    [proofText, scopedGlyphs]
  )
  const rows = useMemo(
    () => buildGrayProofRows(fontData, proofTextWithScope),
    [fontData, proofTextWithScope]
  )
  const samples = useMemo(
    () => buildGlyphInkSamples(scopedGlyphs, fontData),
    [fontData, scopedGlyphs]
  )

  return (
    <Stack spacing={4}>
      <Stack spacing={3}>
        {rows.map((row) => (
          <Box
            key={row.fontSize}
            borderWidth={1}
            borderColor="field.line"
            bg="field.panel"
            p={3}
          >
            <HStack justify="space-between" mb={2}>
              <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                {row.fontSize}px
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="field.muted">
                estimated ink{' '}
                {row.densityPercent === null ? 'N/A' : `${row.densityPercent}%`}
              </Text>
            </HStack>
            <Progress
              value={row.densityPercent ?? 0}
              size="xs"
              colorScheme="yellow"
              mb={3}
            />
            <ProofLineSvg proofRun={row.proofRun} fontSize={row.fontSize} />
          </Box>
        ))}
      </Stack>

      <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={4}>
        <Text fontSize="sm" fontWeight="900" mb={3}>
          本範圍 glyph 黑度估算
        </Text>
        {samples.length === 0 ? (
          <Text fontSize="sm" color="field.muted">
            沒有可估算黑度的 glyph。
          </Text>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
            {samples.map((sample) => {
              const percent =
                sample.inkRatio === null
                  ? null
                  : Math.round(sample.inkRatio * 100)
              return (
                <Box key={sample.glyphId}>
                  <HStack justify="space-between" mb={1}>
                    <HStack spacing={2}>
                      <Text fontFamily="glyph" fontSize="lg" lineHeight={1}>
                        {sample.character}
                      </Text>
                      <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                        {sample.glyphName}
                      </Text>
                    </HStack>
                    <Text fontFamily="mono" fontSize="xs" color="field.muted">
                      {percent === null ? 'N/A' : `${percent}%`}
                    </Text>
                  </HStack>
                  <Progress
                    value={percent ?? 0}
                    size="xs"
                    colorScheme="yellow"
                  />
                </Box>
              )
            })}
          </SimpleGrid>
        )}
      </Box>
    </Stack>
  )
}
