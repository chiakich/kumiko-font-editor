import { FormControl, FormLabel, Textarea, Text } from '@chakra-ui/react'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface GeneratedFeaPreviewProps {
  feaText: string
  sourceMap: GeneratedFeaSourceMap
}

export function GeneratedFeaPreview({
  feaText,
  sourceMap,
}: GeneratedFeaPreviewProps) {
  const { t } = useTranslation()

  return (
    <FormControl>
      <FormLabel fontSize="sm">
        {t('projectControl.generatedDisposableFea')}
      </FormLabel>
      <Textarea minH="280px" fontFamily="mono" value={feaText} isReadOnly />
      <Text mt={2} fontSize="xs" color="field.muted">
        {sourceMap.entries.length} {t('projectControl.sourceMapEntries')}
      </Text>
    </FormControl>
  )
}
