import { Textarea, Text, Field } from '@chakra-ui/react'
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
    <Field.Root>
      <Field.Label textStyle="label">
        {t('projectControl.generatedDisposableFea')}
      </Field.Label>
      <Textarea minH="280px" fontFamily="mono" value={feaText} readOnly />
      <Text mt={2} fontSize="xs" color="mutedForeground">
        {sourceMap.entries.length} {t('projectControl.sourceMapEntries')}
      </Text>
    </Field.Root>
  )
}
