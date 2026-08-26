import { Text, Field } from '@chakra-ui/react'
import { FeaCodeEditor } from 'src/features/common/projectControl/fontSettings/features/components/FeaCodeEditor'
import type {
  CompilerErrorLocation,
  GeneratedFeaSourceMap,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface GeneratedFeaPreviewProps {
  compileErrorLocations?: CompilerErrorLocation[]
  feaText: string
  sourceMap: GeneratedFeaSourceMap
}

export function GeneratedFeaPreview({
  compileErrorLocations = [],
  feaText,
  sourceMap,
}: GeneratedFeaPreviewProps) {
  const { t } = useTranslation()

  return (
    <Field.Root>
      <Field.Label textStyle="label">
        {t('projectControl.generatedDisposableFea')}
      </Field.Label>
      <FeaCodeEditor
        value={feaText}
        readOnly
        minHeight="280px"
        diagnostics={compileErrorLocations.map((location) => ({
          line: location.line,
          message: location.message,
          severity: 'error' as const,
        }))}
        aria-label={t('projectControl.generatedDisposableFea')}
      />
      <Text mt={2} fontSize="xs" color="mutedForeground">
        {sourceMap.entries.length} {t('projectControl.sourceMapEntries')}
      </Text>
    </Field.Root>
  )
}
