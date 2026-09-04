import {
  Badge,
  Box,
  Button,
  HStack,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  classifyRawFeatureTextSource,
  getRawFeatureText,
  setRawFeatureTextSource,
  type AutoFeatureSuggestion,
  type FeatureDiagnostic,
  type OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures'
import type { FontData } from '@/domain'
import { useStore } from '@/store'
import { getMasterKerningPairs } from '@/lib/kerning/resolveKerning'
import { AutoFeatureSuggestions } from '@/features/common/openTypeFeatures/components/AutoFeatureSuggestions'
import { ShapedRunSvg } from '@/features/common/openTypeFeatures/components/ShapedRunSvg'
import { setFeatureTagEnabled } from '@/features/common/openTypeFeatures/utils/featureEnablement'
import { listWorkspaceFeatures } from '@/features/featureWorkspace/workspaceFeatureModel'
import { useFeatureSpecimens } from '@/features/featureWorkspace/useFeatureSpecimens'

interface FeatureIndexViewProps {
  state: OpenTypeFeaturesState
  fontData: FontData
  diagnostics: FeatureDiagnostic[]
  suggestions: AutoFeatureSuggestion[]
  onStateChange: (next: OpenTypeFeaturesState) => void
  onOpenFeature: (featureId: string) => void
  onOpenKern: (orientation: 'horizontal' | 'vertical') => void
  onAcceptSuggestion: (suggestion: AutoFeatureSuggestion) => void
  onIgnoreSuggestion: (suggestion: AutoFeatureSuggestion) => void
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
}: FeatureIndexViewProps) {
  const { t } = useTranslation()
  const activeMasterId = useStore((store) => store.activeMasterId)
  const feaFileInputRef = useRef<HTMLInputElement | null>(null)
  const attachFeaFile = async (file: File) => {
    const text = await file.text()
    if (!text.trim()) {
      return
    }
    // Appended manual FEA joins the raw snippet source: parseable blocks are
    // classified into the IR, the rest compiles verbatim.
    const existing = getRawFeatureText(state) ?? ''
    const joined = existing
      ? `${existing.replace(/\s+$/, '')}\n\n${text}`
      : text
    onStateChange(
      classifyRawFeatureTextSource(
        setRawFeatureTextSource(state, joined, { origin: 'manual-input' }),
        { origin: 'manual-input' }
      )
    )
  }
  const rows = listWorkspaceFeatures(state, diagnostics, {
    // The count next to the synthesized kern row follows the active master,
    // like the kern workbench it opens.
    projectKerningPairCount: getMasterKerningPairs(fontData, activeMasterId)
      .length,
    projectVerticalKerningPairCount: getMasterKerningPairs(
      fontData,
      activeMasterId,
      'vertical'
    ).length,
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
        <Box flex={1} />
        <input
          ref={feaFileInputRef}
          type="file"
          accept=".fea,text/plain"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              void attachFeaFile(file)
            }
          }}
        />
        <Button
          size="2xs"
          variant="outline"
          onClick={() => feaFileInputRef.current?.click()}
        >
          {t('featureWorkspace.attachFeaFile')}
        </Button>
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
                ? onOpenKern(row.tag === 'vkrn' ? 'vertical' : 'horizontal')
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
              disabled={row.isProjectKerning}
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
          {(state.featureVariations ?? []).length > 0 ? (
            <Stack
              gap={2}
              p={3}
              borderWidth="1px"
              borderColor="controlBorder"
              borderRadius="md"
              bg="card"
            >
              <HStack gap={2}>
                <Text fontSize="xs" fontWeight={700}>
                  {t('featureWorkspace.featureVariationsTitle')}
                </Text>
                <Badge size="sm" colorPalette="orange">
                  {t('featureWorkspace.featureVariationsReadOnly')}
                </Badge>
              </HStack>
              <Text fontSize="10px" color="mutedForeground">
                {t('featureWorkspace.featureVariationsHint')}
              </Text>
              {(state.featureVariations ?? []).flatMap((summary) =>
                summary.records.map((record, recordIndex) => (
                  <HStack
                    key={`${summary.table}_${recordIndex}`}
                    gap={2}
                    wrap="wrap"
                    fontFamily="mono"
                    fontSize="11px"
                  >
                    <Badge size="sm" variant="outline">
                      {summary.table}
                    </Badge>
                    {record.conditions.length === 0 ? (
                      <Text color="mutedForeground">
                        {t('featureWorkspace.featureVariationsAlways')}
                      </Text>
                    ) : (
                      record.conditions.map((condition, conditionIndex) => (
                        <Text key={conditionIndex}>
                          {condition.axisTag ?? `axis#${condition.axisIndex}`} [
                          {condition.min.toFixed(2)} …{' '}
                          {condition.max.toFixed(2)}]
                        </Text>
                      ))
                    )}
                    <Text color="mutedForeground">→</Text>
                    {record.substitutions.map((substitution, subIndex) => (
                      <Text key={subIndex}>
                        {substitution.featureTag ??
                          `feature#${substitution.featureIndex}`}{' '}
                        ({substitution.alternateLookupCount} lookups)
                      </Text>
                    ))}
                  </HStack>
                ))
              )}
            </Stack>
          ) : null}

          <AutoFeatureSuggestions
            suggestions={suggestions}
            onAccept={onAcceptSuggestion}
            onIgnore={onIgnoreSuggestion}
          />
        </Box>
      ) : null}
    </Stack>
  )
}
