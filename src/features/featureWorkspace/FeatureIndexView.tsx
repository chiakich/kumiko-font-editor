import {
  Badge,
  Box,
  HStack,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import type {
  AutoFeatureSuggestion,
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'
import { AutoFeatureSuggestions } from 'src/features/common/projectControl/fontSettings/features/components/AutoFeatureSuggestions'
import { ShapedRunSvg } from 'src/features/common/projectControl/fontSettings/features/components/ShapedRunSvg'
import { setFeatureTagEnabled } from 'src/features/common/projectControl/fontSettings/features/utils/featureEnablement'
import { listWorkspaceFeatures } from 'src/features/featureWorkspace/workspaceFeatureModel'
import { useFeatureSpecimens } from 'src/features/featureWorkspace/useFeatureSpecimens'

interface FeatureIndexViewProps {
  state: OpenTypeFeaturesState
  fontData: FontData
  diagnostics: FeatureDiagnostic[]
  suggestions: AutoFeatureSuggestion[]
  onStateChange: (next: OpenTypeFeaturesState) => void
  onOpenFeature: (featureId: string) => void
  onOpenKern: () => void
  onAcceptSuggestion: (suggestion: AutoFeatureSuggestion) => void
  onIgnoreSuggestion: (suggestion: AutoFeatureSuggestion) => void
  onScanSuggestions: () => void
}

const SPECIMEN_SIZE = 34

// The specimen sheet: every feature demonstrates itself with a sample shaped
// from its own rules, so scanning the page answers "what does each feature do".
export function FeatureIndexView({
  state,
  fontData,
  diagnostics,
  suggestions,
  onStateChange,
  onOpenFeature,
  onOpenKern,
  onAcceptSuggestion,
  onIgnoreSuggestion,
  onScanSuggestions,
}: FeatureIndexViewProps) {
  const { t } = useTranslation()
  const rows = listWorkspaceFeatures(state, diagnostics, {
    projectKerningPairCount: fontData.kerningPairs?.length ?? 0,
  })
  const specimens = useFeatureSpecimens({
    fontData,
    openTypeFeatures: state,
    enabled: rows.length > 0,
  })

  return (
    <Stack flex={1} minH={0} overflow="auto" p={5} gap={2.5} maxW="1080px">
      <HStack gap={2} color="mutedForeground">
        <Text fontSize="xs">{t('featureWorkspace.indexHint')}</Text>
        {specimens.isLoading ? <Spinner size="xs" /> : null}
      </HStack>
      {rows.length === 0 ? (
        <Text fontSize="sm" color="mutedForeground">
          {t('featureWorkspace.indexEmpty')}
        </Text>
      ) : null}
      {rows.map((row) => {
        const specimen = specimens.byTag?.get(row.tag) ?? null
        return (
          <HStack
            key={row.tag}
            gap={4}
            px={4}
            py={3}
            borderWidth="1px"
            borderColor="controlBorder"
            borderRadius="lg"
            bg="card"
            opacity={row.enabled ? 1 : 0.55}
            cursor={
              row.featureId || row.isProjectKerning ? 'pointer' : 'default'
            }
            onClick={() =>
              row.isProjectKerning
                ? onOpenKern()
                : row.featureId && onOpenFeature(row.featureId)
            }
            _hover={
              row.featureId || row.isProjectKerning
                ? { borderColor: 'controlBorderHover' }
                : {}
            }
          >
            <Switch.Root
              size="sm"
              checked={row.enabled}
              onCheckedChange={(event) =>
                onStateChange(
                  setFeatureTagEnabled(state, row.tag, event.checked)
                )
              }
              onClick={(event) => event.stopPropagation()}
            >
              <Switch.HiddenInput />
              <Switch.Control />
            </Switch.Root>
            <Stack gap={0} width="130px" flexShrink={0}>
              <Text fontFamily="mono" fontWeight={700} fontSize="14px">
                {row.tag}
              </Text>
              <Text fontSize="10px" color="mutedForeground">
                {t('featureWorkspace.ruleCount', { count: row.ruleCount })}
              </Text>
            </Stack>
            <HStack gap={1} flexShrink={0}>
              {row.origins.map((origin) => (
                <Badge key={origin} size="sm" variant="outline">
                  {origin}
                </Badge>
              ))}
              {row.diagnosticsCount > 0 ? (
                <Badge size="sm" colorPalette="yellow">
                  {row.diagnosticsCount}
                </Badge>
              ) : null}
            </HStack>
            <Box flex={1} />
            {specimen ? (
              <HStack gap={3} flexShrink={0}>
                <Box opacity={0.4}>
                  <ShapedRunSvg
                    glyphs={specimen.before.glyphs}
                    unitsPerEm={specimen.before.unitsPerEm}
                    size={SPECIMEN_SIZE}
                  />
                </Box>
                <Text color="mutedForeground">→</Text>
                <Box
                  color={specimen.changed ? 'foreground' : 'mutedForeground'}
                >
                  <ShapedRunSvg
                    glyphs={specimen.after.glyphs}
                    unitsPerEm={specimen.after.unitsPerEm}
                    size={SPECIMEN_SIZE}
                  />
                </Box>
                {!specimen.changed ? (
                  <Text fontSize="10px" color="mutedForeground">
                    {t('featureWorkspace.specimenNoChange')}
                  </Text>
                ) : null}
              </HStack>
            ) : (
              <Text fontSize="10px" color="mutedForeground" flexShrink={0}>
                {t('featureWorkspace.specimenUnavailable')}
              </Text>
            )}
            <Text color="mutedForeground" flexShrink={0}>
              ›
            </Text>
          </HStack>
        )
      })}
      {suggestions.length > 0 ? (
        <Box pt={2}>
          <AutoFeatureSuggestions
            suggestions={suggestions}
            onAccept={onAcceptSuggestion}
            onIgnore={onIgnoreSuggestion}
            onScan={onScanSuggestions}
          />
        </Box>
      ) : null}
    </Stack>
  )
}
