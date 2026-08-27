import { Badge, Button, HStack, Stack, Switch, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import type {
  FeatureRecord,
  GeneratedFeaSourceMap,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'
import { FeatureDocument } from 'src/features/common/projectControl/fontSettings/features/components/OpenTypeRecordDocuments'
import {
  isFeatureTagEnabled,
  setFeatureTagEnabled,
} from 'src/features/common/projectControl/fontSettings/features/utils/featureEnablement'

interface FeatureDetailViewProps {
  feature: FeatureRecord
  state: OpenTypeFeaturesState
  fontData: FontData
  generatedFea: { sourceMap: GeneratedFeaSourceMap; text: string }
  onStateChange: (next: OpenTypeFeaturesState) => void
  onBack: () => void
}

// One feature's editing surface: the shared dual-mode document (rule cards or
// FEA code) under a workspace-flavoured header.
export function FeatureDetailView({
  feature,
  state,
  fontData,
  generatedFea,
  onStateChange,
  onBack,
}: FeatureDetailViewProps) {
  const { t } = useTranslation()
  const enabled = isFeatureTagEnabled(state, feature.tag)

  return (
    <Stack flex={1} minH={0} overflow="auto" p={5} gap={4} maxW="1080px">
      <HStack gap={3}>
        <Button size="xs" variant="ghost" onClick={onBack}>
          ← {t('featureWorkspace.backToIndex')}
        </Button>
        <Text fontFamily="mono" fontWeight={800} fontSize="17px">
          {feature.tag}
        </Text>
        <Badge size="sm" variant="outline">
          {feature.origin}
        </Badge>
        <Switch.Root
          size="sm"
          checked={enabled}
          onCheckedChange={(event) =>
            onStateChange(
              setFeatureTagEnabled(state, feature.tag, event.checked)
            )
          }
        >
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label fontSize="xs" color="mutedForeground">
            {enabled
              ? t('featureWorkspace.featureEnabled')
              : t('featureWorkspace.featureDisabled')}
          </Switch.Label>
        </Switch.Root>
      </HStack>
      <FeatureDocument
        feature={feature}
        generatedFea={generatedFea}
        state={state}
        fontData={fontData}
        onStateChange={onStateChange}
      />
    </Stack>
  )
}
