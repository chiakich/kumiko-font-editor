import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { ArrowLeft } from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildAutoFeatureSuggestions,
  applyAutoFeatureSuggestion,
  createEmptyOpenTypeFeaturesState,
  createFontFingerprint,
  generateFea,
  ignoreAutoFeatureSuggestion,
  mergeFeatureDiagnostics,
  validateFeatures,
  type AutoFeatureSuggestion,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useStore } from 'src/store'
import { useShapingPreview } from 'src/features/common/projectControl/fontSettings/features/hooks/useShapingPreview'
import { setFeatureTagEnabled } from 'src/features/common/projectControl/fontSettings/features/utils/featureEnablement'
import { listWorkspaceFeatures } from 'src/features/featureWorkspace/workspaceFeatureModel'
import { WorkspacePreviewHome } from 'src/features/featureWorkspace/WorkspacePreviewHome'
import { KernPairView } from 'src/features/featureWorkspace/KernPairView'
import { FeatureIndexView } from 'src/features/featureWorkspace/FeatureIndexView'
import { FeatureDetailView } from 'src/features/featureWorkspace/FeatureDetailView'

type WorkspaceView =
  | { kind: 'home' }
  | { kind: 'index' }
  | { kind: 'feature'; featureId: string }
  | { kind: 'kern' }

// The OpenType feature workspace, preview first: the home view is a live
// shaped run with a per-glyph rule trace; the specimen index and per-feature
// editors sit one step behind it. Edits write straight into the project
// (dirty + auto draft save).
export function FeatureWorkspaceScreen() {
  const { t } = useTranslation()
  const fontData = useStore((state) => state.fontData)
  const projectTitle = useStore((state) => state.projectTitle)
  const updateFontSettings = useStore((state) => state.updateFontSettings)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const [view, setView] = useState<WorkspaceView>({ kind: 'home' })

  const openTypeFeatures = useMemo(
    () =>
      fontData?.openTypeFeatures ??
      (fontData
        ? createEmptyOpenTypeFeaturesState(createFontFingerprint(fontData))
        : undefined),
    [fontData]
  )

  const preview = useShapingPreview({
    fontData,
    openTypeFeatures,
  })

  const diagnostics = useMemo(
    () =>
      fontData && openTypeFeatures
        ? mergeFeatureDiagnostics(
            openTypeFeatures.diagnostics,
            validateFeatures(openTypeFeatures, fontData)
          )
        : (openTypeFeatures?.diagnostics ?? []),
    [fontData, openTypeFeatures]
  )
  const generatedFea = useMemo(
    () => (openTypeFeatures ? generateFea(openTypeFeatures) : null),
    [openTypeFeatures]
  )
  const suggestions = useMemo(
    () =>
      fontData && openTypeFeatures
        ? buildAutoFeatureSuggestions(fontData, openTypeFeatures)
        : [],
    [fontData, openTypeFeatures]
  )

  if (!fontData || !openTypeFeatures || !generatedFea) {
    return null
  }

  const handleChange = (next: OpenTypeFeaturesState) => {
    updateFontSettings({ openTypeFeatures: next })
  }
  const acceptSuggestion = (suggestion: AutoFeatureSuggestion) =>
    handleChange(applyAutoFeatureSuggestion(openTypeFeatures, suggestion))
  const ignoreSuggestion = (suggestion: AutoFeatureSuggestion) =>
    handleChange(ignoreAutoFeatureSuggestion(openTypeFeatures, suggestion))

  const rows = listWorkspaceFeatures(openTypeFeatures, diagnostics, {
    projectKerningPairCount: fontData.kerningPairs?.length ?? 0,
  })
  const selectedFeature =
    view.kind === 'feature'
      ? (openTypeFeatures.features.find(
          (feature) => feature.id === view.featureId
        ) ?? null)
      : null
  const openFeature = (featureId: string) =>
    setView({ kind: 'feature', featureId })

  return (
    <Stack h="100dvh" gap={0} bg="background" color="foreground">
      <HStack
        gap={3}
        px={4}
        py={2}
        borderBottomWidth="1px"
        borderColor="controlBorder"
        flexShrink={0}
      >
        <Tooltip content={t('featureWorkspace.backToOverview')}>
          <IconButton
            aria-label={t('featureWorkspace.backToOverview')}
            size="sm"
            variant="ghost"
            borderRadius="full"
            onClick={() => setWorkspaceView('overview')}
          >
            <ArrowLeft width={18} height={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Stack gap={0} minW={0} flexShrink={0}>
          <Text fontSize="sm" fontWeight={800} lineClamp={1}>
            {t('featureWorkspace.title')}
          </Text>
          <Text fontSize="xs" color="mutedForeground" lineClamp={1}>
            {projectTitle}
          </Text>
        </Stack>
        <Input
          size="sm"
          maxW="420px"
          fontFamily="glyph"
          value={preview.text}
          placeholder={t('projectControl.shapingPreviewPlaceholder')}
          onChange={(event) => preview.setText(event.target.value)}
          onFocus={() => setView({ kind: 'home' })}
        />
        <HStack gap={0.5} bg="muted" borderRadius="md" p="2px" flexShrink={0}>
          <Button
            size="2xs"
            variant={preview.direction === 'ltr' ? 'solid' : 'ghost'}
            onClick={() => preview.setDirection('ltr')}
          >
            {t('projectControl.shapingHorizontal')}
          </Button>
          <Button
            size="2xs"
            variant={preview.direction === 'ttb' ? 'solid' : 'ghost'}
            onClick={() => preview.setDirection('ttb')}
          >
            {t('projectControl.shapingVertical')}
          </Button>
        </HStack>
        {preview.languageOptions.length > 0 ? (
          <select
            aria-label={t('featureWorkspace.languageSelect')}
            value={preview.languageOptionId ?? ''}
            onChange={(event) =>
              preview.setLanguageOptionId(event.target.value || null)
            }
            style={{
              background: 'transparent',
              border: '1px solid var(--chakra-colors-control-border)',
              borderRadius: '6px',
              padding: '2px 6px',
              fontSize: '11px',
              fontFamily: 'inherit',
              color: 'inherit',
              flexShrink: 0,
            }}
          >
            <option value="">{t('featureWorkspace.languageAuto')}</option>
            {preview.languageOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        <Box flex={1} />
        <HStack gap={1} wrap="wrap" justify="flex-end">
          {preview.toggles.map((toggle) => {
            const enabled = preview.isFeatureEnabled(toggle.tag)
            return (
              <Button
                key={toggle.tag}
                size="2xs"
                variant={enabled ? 'solid' : 'outline'}
                fontFamily="mono"
                onClick={() => preview.toggleFeature(toggle.tag)}
                aria-pressed={enabled}
              >
                {toggle.tag}
              </Button>
            )
          })}
        </HStack>
      </HStack>

      <HStack flex={1} minH={0} gap={0} align="stretch">
        <Stack
          width="180px"
          flexShrink={0}
          borderRightWidth="1px"
          borderColor="controlBorder"
          p={3}
          gap={1.5}
          overflow="auto"
        >
          <Text
            fontSize="10px"
            letterSpacing="0.1em"
            color="mutedForeground"
            fontFamily="mono"
          >
            {t('featureWorkspace.railTitle')}
          </Text>
          {rows.map((row) => (
            <HStack
              key={row.tag}
              gap={2}
              px={2}
              py={1.5}
              borderRadius="md"
              bg={
                view.kind === 'feature' && selectedFeature?.tag === row.tag
                  ? 'accent'
                  : 'card'
              }
              color={
                view.kind === 'feature' && selectedFeature?.tag === row.tag
                  ? 'accentForeground'
                  : undefined
              }
              opacity={row.enabled ? 1 : 0.55}
              cursor={row.featureId ? 'pointer' : 'default'}
              onClick={() => row.featureId && openFeature(row.featureId)}
            >
              <Switch.Root
                size="xs"
                checked={row.enabled}
                onCheckedChange={(event) =>
                  handleChange(
                    setFeatureTagEnabled(
                      openTypeFeatures,
                      row.tag,
                      event.checked
                    )
                  )
                }
                onClick={(event) => event.stopPropagation()}
              >
                <Switch.HiddenInput />
                <Switch.Control />
              </Switch.Root>
              <Text fontFamily="mono" fontSize="xs" fontWeight={600}>
                {row.tag}
              </Text>
              <Box flex={1} />
              {row.diagnosticsCount > 0 ? (
                <Badge size="sm" colorPalette="yellow">
                  {row.diagnosticsCount}
                </Badge>
              ) : null}
            </HStack>
          ))}
          <Box flex={1} />
          <Button
            size="xs"
            variant={view.kind === 'index' ? 'solid' : 'outline'}
            onClick={() => setView({ kind: 'index' })}
          >
            {t('featureWorkspace.openIndex')}
          </Button>
          <Button
            size="xs"
            variant={view.kind === 'home' ? 'solid' : 'ghost'}
            onClick={() => setView({ kind: 'home' })}
          >
            {t('featureWorkspace.openHome')}
          </Button>
        </Stack>

        {view.kind === 'kern' ? (
          <KernPairView
            fontData={fontData}
            state={openTypeFeatures}
            onOpenIrKern={openFeature}
          />
        ) : view.kind === 'home' ? (
          <WorkspacePreviewHome
            preview={preview}
            state={openTypeFeatures}
            fontData={fontData}
            onOpenFeature={openFeature}
          />
        ) : view.kind === 'index' ? (
          <FeatureIndexView
            state={openTypeFeatures}
            fontData={fontData}
            diagnostics={diagnostics}
            suggestions={suggestions}
            onStateChange={handleChange}
            onOpenFeature={openFeature}
            onOpenKern={() => setView({ kind: 'kern' })}
            onAcceptSuggestion={acceptSuggestion}
            onIgnoreSuggestion={ignoreSuggestion}
            onScanSuggestions={() => handleChange({ ...openTypeFeatures })}
          />
        ) : selectedFeature ? (
          <FeatureDetailView
            feature={selectedFeature}
            state={openTypeFeatures}
            fontData={fontData}
            generatedFea={generatedFea}
            onStateChange={handleChange}
            onBack={() => setView({ kind: 'index' })}
          />
        ) : (
          <FeatureIndexView
            state={openTypeFeatures}
            fontData={fontData}
            diagnostics={diagnostics}
            suggestions={suggestions}
            onStateChange={handleChange}
            onOpenFeature={openFeature}
            onOpenKern={() => setView({ kind: 'kern' })}
            onAcceptSuggestion={acceptSuggestion}
            onIgnoreSuggestion={ignoreSuggestion}
            onScanSuggestions={() => handleChange({ ...openTypeFeatures })}
          />
        )}
      </HStack>
    </Stack>
  )
}
