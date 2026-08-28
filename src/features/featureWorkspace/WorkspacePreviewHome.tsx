import {
  Badge,
  Box,
  Button,
  HStack,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'
import { ShapedRunSvg } from 'src/features/common/projectControl/fontSettings/features/components/ShapedRunSvg'
import type { useShapingPreview } from 'src/features/common/projectControl/fontSettings/features/hooks/useShapingPreview'
import { useShapingTrace } from 'src/features/common/projectControl/fontSettings/features/hooks/useShapingTrace'
import { findRulesForTraceStep } from 'src/features/common/projectControl/fontSettings/features/utils/traceRuleLookup'
import { useOpenGlyphInEditor } from 'src/features/editor/rightPanel/behaviors/useOpenBehaviorGlyphs'

interface WorkspacePreviewHomeProps {
  preview: ReturnType<typeof useShapingPreview>
  state: OpenTypeFeaturesState
  fontData: FontData
  onOpenFeature: (featureId: string) => void
}

const AFTER_SIZE = 96
const BEFORE_SIZE = 56

// The workspace's front door: type text, watch the compiled font shape it,
// click any output glyph to see the rule chain that produced it.
export function WorkspacePreviewHome({
  preview,
  state,
  fontData,
  onOpenFeature,
}: WorkspacePreviewHomeProps) {
  const { t } = useTranslation()
  const openGlyphInEditor = useOpenGlyphInEditor()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const isVertical = preview.direction === 'ttb'
  const hasText = preview.text.trim().length > 0
  // Same gate as the kern chip (useShapingPreview): the preview font compiles
  // the canonical pairs, so only those make the hint true.
  const hasProjectKerning = (fontData.kerningPairs?.length ?? 0) > 0
  const hasProjectVerticalKerning =
    (fontData.verticalKerningPairs?.length ?? 0) > 0
  const afterGlyphs = useMemo(
    () => preview.after?.glyphs ?? [],
    [preview.after]
  )
  const selectedGlyph =
    selectedIndex !== null ? (afterGlyphs[selectedIndex] ?? null) : null

  const trace = useShapingTrace(preview.traceInputs, selectedGlyph !== null)
  const selectedSteps = useMemo(() => {
    if (!trace.steps || !selectedGlyph) {
      return []
    }
    return trace.steps.filter((step) =>
      step.clusters.includes(selectedGlyph.cluster)
    )
  }, [trace.steps, selectedGlyph])

  // Highlight every glyph the features changed, so there is something to
  // click before reading anything.
  const changedIndices = useMemo(() => {
    const beforeGlyphs = preview.before?.glyphs ?? []
    const changed = new Set<number>()
    afterGlyphs.forEach((glyph, index) => {
      const counterpart = beforeGlyphs[index]
      if (
        !counterpart ||
        counterpart.glyphId !== glyph.glyphId ||
        counterpart.xAdvance !== glyph.xAdvance ||
        counterpart.xOffset !== glyph.xOffset ||
        counterpart.yOffset !== glyph.yOffset
      ) {
        changed.add(index)
      }
    })
    return changed
  }, [afterGlyphs, preview.before])

  // Vertical writing needs a .vert-shaped answer for every glyph; name the
  // ones the font cannot answer for yet.
  const missingVerticalForms = useMemo(() => {
    if (!isVertical) {
      return []
    }
    const names = new Set<string>()
    for (const glyph of afterGlyphs) {
      const name = glyph.glyphName
      if (
        name &&
        !name.includes('.') &&
        !fontData.glyphs[`${name}.vert`] &&
        fontData.glyphs[name]?.unicodes?.length
      ) {
        names.add(name)
      }
    }
    return [...names].slice(0, 8)
  }, [afterGlyphs, fontData, isVertical])

  return (
    <HStack flex={1} minH={0} gap={0} align="stretch">
      <Stack flex={1} minW={0} p={5} gap={4} overflow="auto">
        {!hasText ? (
          <Stack
            flex={1}
            align="center"
            justify="center"
            color="mutedForeground"
            gap={2}
          >
            <Text fontSize="sm">{t('featureWorkspace.homeEmpty')}</Text>
            <Text fontSize="xs" fontFamily="mono">
              {t('featureWorkspace.homeEmptyHint')}
            </Text>
          </Stack>
        ) : preview.fontStatus.state === 'error' ? (
          <Text fontSize="xs" color="red.600" fontFamily="mono">
            {t('projectControl.shapingCompileFailed')}:{' '}
            {preview.fontStatus.message}
          </Text>
        ) : (
          <HStack
            flex={1}
            gap={10}
            align={isVertical ? 'flex-start' : 'center'}
            justify="center"
            flexDirection={isVertical ? 'row' : 'column'}
            overflow="auto"
          >
            <Stack gap={1.5} align={isVertical ? 'center' : 'flex-start'}>
              <Text
                fontSize="10px"
                fontFamily="mono"
                color="mutedForeground"
                letterSpacing="0.08em"
              >
                {t('projectControl.shapingBefore')}
              </Text>
              <Box opacity={0.4}>
                {preview.before ? (
                  <ShapedRunSvg
                    glyphs={preview.before.glyphs}
                    unitsPerEm={preview.before.unitsPerEm}
                    size={BEFORE_SIZE}
                    direction={preview.direction}
                  />
                ) : null}
              </Box>
            </Stack>
            <Stack gap={1.5} align={isVertical ? 'center' : 'flex-start'}>
              <Text
                fontSize="10px"
                fontFamily="mono"
                color="mutedForeground"
                letterSpacing="0.08em"
              >
                {t('projectControl.shapingAfter')} ·{' '}
                {t('featureWorkspace.clickGlyphHint')}
              </Text>
              {preview.after ? (
                <ShapedRunSvg
                  glyphs={preview.after.glyphs}
                  unitsPerEm={preview.after.unitsPerEm}
                  size={AFTER_SIZE}
                  direction={preview.direction}
                  selectedIndex={selectedIndex}
                  highlightIndices={changedIndices}
                  onSelectGlyph={(index) =>
                    setSelectedIndex((current) =>
                      current === index ? null : index
                    )
                  }
                />
              ) : preview.fontStatus.state === 'compiling' ? (
                <HStack gap={2} color="mutedForeground">
                  <Spinner size="xs" />
                  <Text fontSize="xs">
                    {t('projectControl.shapingCompiling')}
                  </Text>
                </HStack>
              ) : null}
            </Stack>
          </HStack>
        )}
        {preview.unknownGlyphTokens.length > 0 ? (
          <Text fontSize="xs" color="orange.500" fontFamily="mono">
            {t('projectControl.shapingUnknownGlyphs', {
              names: preview.unknownGlyphTokens.join(', '),
            })}
          </Text>
        ) : null}
        {isVertical &&
        hasText &&
        hasProjectKerning &&
        !hasProjectVerticalKerning ? (
          <Text fontSize="xs" color="mutedForeground">
            {t('featureWorkspace.kernVerticalHint')}
          </Text>
        ) : null}
      </Stack>

      {selectedGlyph ? (
        <Stack
          width="320px"
          flexShrink={0}
          borderLeftWidth="1px"
          borderColor="controlBorder"
          p={4}
          gap={3}
          overflow="auto"
        >
          <HStack gap={2.5}>
            <Box
              borderWidth="1px"
              borderColor="controlBorder"
              borderRadius="md"
              p={1.5}
            >
              <ShapedRunSvg
                glyphs={[{ ...selectedGlyph, xOffset: 0, yOffset: 0 }]}
                unitsPerEm={preview.after?.unitsPerEm ?? 1000}
                size={34}
              />
            </Box>
            <Stack gap={0} minW={0}>
              <Text fontSize="sm" fontWeight={700}>
                {t('featureWorkspace.traceTitle')}
              </Text>
              <Text fontSize="10px" fontFamily="mono" color="mutedForeground">
                {selectedGlyph.glyphName ?? selectedGlyph.glyphId}
              </Text>
            </Stack>
          </HStack>

          {trace.isTracing ? (
            <HStack gap={2} color="mutedForeground">
              <Spinner size="xs" />
              <Text fontSize="xs">{t('featureWorkspace.tracing')}</Text>
            </HStack>
          ) : selectedSteps.length === 0 ? (
            <Text fontSize="xs" color="mutedForeground">
              {t('featureWorkspace.traceEmpty')}
            </Text>
          ) : (
            selectedSteps.map((step, index) => {
              const match = findRulesForTraceStep(state, step)[0] ?? null
              return (
                <Stack
                  key={`${step.phase}-${step.lookupIndex}-${index}`}
                  gap={1.5}
                  borderWidth="1px"
                  borderColor="controlBorder"
                  borderRadius="md"
                  bg="card"
                  p={2.5}
                >
                  <HStack gap={2}>
                    <Text
                      fontSize="xs"
                      fontWeight={700}
                      fontFamily="mono"
                      color="yellow.500"
                    >
                      {index + 1} · {step.featureTag}
                    </Text>
                    <Badge size="sm" variant="outline" fontFamily="mono">
                      {step.phase}
                    </Badge>
                  </HStack>
                  <Text fontSize="11px" fontFamily="mono" lineClamp={2}>
                    {step.positional
                      ? step.beforeNames.join(' ')
                      : `${step.beforeNames.join(' ')} → ${step.afterNames.join(' ')}`}
                  </Text>
                  <HStack gap={3}>
                    {match ? (
                      <Button
                        size="2xs"
                        variant="plain"
                        color="yellow.500"
                        onClick={() => onOpenFeature(match.featureId)}
                      >
                        {t('featureWorkspace.editRule')}
                      </Button>
                    ) : null}
                    {selectedGlyph.glyphName &&
                    fontData.glyphs[selectedGlyph.glyphName] ? (
                      <Button
                        size="2xs"
                        variant="plain"
                        color="mutedForeground"
                        onClick={() =>
                          openGlyphInEditor(selectedGlyph.glyphName!)
                        }
                      >
                        {t('featureWorkspace.openGlyph')}
                      </Button>
                    ) : null}
                  </HStack>
                </Stack>
              )
            })
          )}

          {missingVerticalForms.length > 0 ? (
            <Stack
              gap={1}
              borderWidth="1px"
              borderColor="controlBorder"
              borderRadius="md"
              p={2.5}
              color="mutedForeground"
            >
              <Text fontSize="xs" fontWeight={700} color="foreground">
                {t('featureWorkspace.missingVertTitle')}
              </Text>
              <Text fontSize="11px" fontFamily="mono" lineClamp={2}>
                {missingVerticalForms.join(' · ')}
              </Text>
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </HStack>
  )
}
