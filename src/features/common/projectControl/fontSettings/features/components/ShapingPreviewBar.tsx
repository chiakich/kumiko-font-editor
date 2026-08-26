import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'
import { ShapedRunSvg } from 'src/features/common/projectControl/fontSettings/features/components/ShapedRunSvg'
import {
  useShapingPreview,
  type ShapingPreviewRun,
} from 'src/features/common/projectControl/fontSettings/features/hooks/useShapingPreview'

interface ShapingPreviewBarProps {
  fontData: FontData | null
  openTypeFeatures: OpenTypeFeaturesState | undefined
}

const RUN_SIZE = 44

function PreviewRunRow({
  label,
  run,
}: {
  label: string
  run: ShapingPreviewRun | null
}) {
  return (
    <HStack gap={3} minH={`${RUN_SIZE}px`} align="center">
      <Text
        fontSize="10px"
        fontWeight={600}
        letterSpacing="0.08em"
        color="mutedForeground"
        width="52px"
        flexShrink={0}
        textTransform="uppercase"
      >
        {label}
      </Text>
      <Box overflowX="auto" flexGrow={1} minW={0}>
        {run ? (
          <ShapedRunSvg
            glyphs={run.glyphs}
            unitsPerEm={run.unitsPerEm}
            size={RUN_SIZE}
          />
        ) : null}
      </Box>
    </HStack>
  )
}

// The live shaping strip: type text, flip features, watch the compiled font
// shape it through HarfBuzz — before/after so the features' work is visible.
export function ShapingPreviewBar({
  fontData,
  openTypeFeatures,
}: ShapingPreviewBarProps) {
  const { t } = useTranslation()
  const preview = useShapingPreview({ fontData, openTypeFeatures })
  const hasText = preview.text.trim().length > 0

  return (
    <Stack gap={2.5} borderTopWidth="1px" pt={3}>
      <HStack gap={2.5} wrap="wrap">
        <Text fontSize="sm" fontWeight={700} flexShrink={0}>
          {t('projectControl.shapingPreviewTitle')}
        </Text>
        <Input
          size="sm"
          maxW="360px"
          fontFamily="glyph"
          value={preview.text}
          placeholder={t('projectControl.shapingPreviewPlaceholder')}
          onChange={(event) => preview.setText(event.target.value)}
        />
        {preview.fontStatus.state === 'compiling' ? (
          <HStack gap={1.5} color="mutedForeground">
            <Spinner size="xs" />
            <Text fontSize="xs">{t('projectControl.shapingCompiling')}</Text>
          </HStack>
        ) : null}
      </HStack>

      {preview.toggles.length > 0 && hasText ? (
        <HStack gap={1.5} wrap="wrap">
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
      ) : null}

      {preview.fontStatus.state === 'error' ? (
        <Text fontSize="xs" color="red.600" fontFamily="mono">
          {t('projectControl.shapingCompileFailed')}:{' '}
          {preview.fontStatus.message}
        </Text>
      ) : preview.shapeError ? (
        <Text fontSize="xs" color="red.600" fontFamily="mono">
          {preview.shapeError}
        </Text>
      ) : hasText && (preview.before || preview.after) ? (
        <Stack gap={1}>
          <PreviewRunRow
            label={t('projectControl.shapingBefore')}
            run={preview.before}
          />
          <PreviewRunRow
            label={t('projectControl.shapingAfter')}
            run={preview.after}
          />
          {preview.after && preview.before ? (
            <HStack gap={2}>
              <Badge variant="outline" fontFamily="mono">
                {t('projectControl.shapingGlyphCount', {
                  count: preview.after.glyphs.length,
                })}
              </Badge>
            </HStack>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  )
}
