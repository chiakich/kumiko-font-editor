import { FormControl, FormLabel, Textarea, Text } from '@chakra-ui/react'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures'

interface GeneratedFeaPreviewProps {
  feaText: string
  sourceMap: GeneratedFeaSourceMap
}

export function GeneratedFeaPreview({
  feaText,
  sourceMap,
}: GeneratedFeaPreviewProps) {
  return (
    <FormControl>
      <FormLabel fontSize="sm">Generated disposable FEA</FormLabel>
      <Textarea minH="280px" fontFamily="mono" value={feaText} isReadOnly />
      <Text mt={2} fontSize="xs" color="field.muted">
        {sourceMap.entries.length} source map entries.
      </Text>
    </FormControl>
  )
}
