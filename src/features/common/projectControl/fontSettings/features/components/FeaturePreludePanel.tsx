import {
  Badge,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeaturePreludePanelProps {
  rawFeatureText: string
  state: OpenTypeFeaturesState
  onRawFeatureTextChange: (value: string) => void
}

export function FeaturePreludePanel({
  rawFeatureText,
  state,
  onRawFeatureTextChange,
}: FeaturePreludePanelProps) {
  const { t } = useTranslation()

  return (
    <Stack spacing={4}>
      <Stack spacing={2}>
        <Text fontWeight="semibold">{t('projectControl.prelude')}</Text>
        <Text fontSize="sm" color="field.muted">
          {t('projectControl.featurePreludeDataFlow')}
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
          {t('projectControl.rawFeatureText')}
        </FormLabel>
        <Textarea
          minH="180px"
          fontFamily="mono"
          value={rawFeatureText}
          onChange={(event) => onRawFeatureTextChange(event.target.value)}
          placeholder={t('projectControl.rawFeatureTextPlaceholder')}
        />
        <FormHelperText fontSize="xs">
          {t('projectControl.rawFeatureTextHelp')}
        </FormHelperText>
      </FormControl>
    </Stack>
  )
}
