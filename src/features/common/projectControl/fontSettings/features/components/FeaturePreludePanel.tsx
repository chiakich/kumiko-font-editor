import {
  Badge,
  FormControl,
  FormLabel,
  HStack,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeaturePreludePanelProps {
  featuresText: string
  state: OpenTypeFeaturesState
  onFeaturesTextChange: (value: string) => void
}

export function FeaturePreludePanel({
  featuresText,
  state,
  onFeaturesTextChange,
}: FeaturePreludePanelProps) {
  const { t } = useTranslation()

  return (
    <Stack spacing={4}>
      <Stack spacing={2}>
        <Text fontWeight="semibold">{t('projectControl.prelude')}</Text>
        <Text fontSize="sm" color="field.muted">
          {t('projectControl.languageSystemsAndImportedFeatureSource')}
        </Text>
      </Stack>

      <Stack spacing={2}>
        <Text fontSize="xs" color="field.muted">
          {t('projectControl.languageSystems')}
        </Text>
        <HStack wrap="wrap">
          {state.languagesystems.map((languageSystem) => (
            <Badge key={languageSystem.id} fontFamily="mono">
              {languageSystem.script} {languageSystem.language}
            </Badge>
          ))}
        </HStack>
      </Stack>

      <FormControl>
        <FormLabel fontSize="sm">
          {t('projectControl.importedOrLegacyFeatureText')}
        </FormLabel>
        <Textarea
          minH="220px"
          fontFamily="mono"
          value={featuresText}
          onChange={(event) => onFeaturesTextChange(event.target.value)}
          placeholder={t('projectControl.languagesystemDfltDfltFeatureLigaSub')}
        />
      </FormControl>
    </Stack>
  )
}
