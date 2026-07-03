import { Badge, Box, HStack, Heading, Text, VStack } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import type { InterpolationDiagnostics } from 'src/features/common/glyphInspector/hooks/useRightPanelModel'
import type { GlyphCompatibilityIssue } from 'src/font/glyphCompatibility'

interface InterpolationDiagnosticsCardProps {
  diagnostics: InterpolationDiagnostics | null
}

const MAX_VISIBLE_ITEMS = 5

const issueLocationLabel = (issue: GlyphCompatibilityIssue) => {
  const parts: string[] = []
  if (issue.layerId) {
    parts.push(issue.layerId)
  }
  if (issue.pathIndex !== undefined) {
    parts.push(`Path ${issue.pathIndex + 1}`)
  }
  if (issue.nodeIndex !== undefined) {
    parts.push(`Node ${issue.nodeIndex + 1}`)
  }
  if (issue.componentIndex !== undefined) {
    parts.push(`Component ${issue.componentIndex + 1}`)
  }
  if (issue.anchorName) {
    parts.push(`Anchor ${issue.anchorName}`)
  }
  if (issue.guidelineIndex !== undefined) {
    parts.push(`Guide ${issue.guidelineIndex + 1}`)
  }
  return parts.join(' · ')
}

export function InterpolationDiagnosticsCard({
  diagnostics,
}: InterpolationDiagnosticsCardProps) {
  const { t } = useTranslation()

  if (!diagnostics) {
    return null
  }

  const isBlocking = !diagnostics.canInterpolate
  const colorScheme = isBlocking ? 'red' : 'orange'
  const borderColor = isBlocking ? 'red.300' : 'orange.300'
  const visibleIssues = diagnostics.issues.slice(0, MAX_VISIBLE_ITEMS)
  const remainingCount = Math.max(
    0,
    diagnostics.issues.length +
      diagnostics.modelErrors.length -
      MAX_VISIBLE_ITEMS
  )
  const visibleModelErrors = diagnostics.modelErrors.slice(
    0,
    Math.max(0, MAX_VISIBLE_ITEMS - visibleIssues.length)
  )

  return (
    <Box
      p={4}
      bg="card"
      border="1px solid"
      borderColor={borderColor}
      borderRadius="sm"
    >
      <HStack justify="space-between" gap={2} mb={2} align="center">
        <Heading size="sm" textTransform="uppercase" color="foreground">
          {t('editor.interpolationDiagnostics')}
        </Heading>
        <Badge colorPalette={colorScheme} fontSize="2xs">
          {isBlocking
            ? t('editor.interpolationBlocking')
            : t('editor.interpolationWarning')}
        </Badge>
      </HStack>
      <Text fontSize="xs" color="mutedForeground" mb={3}>
        {t('editor.interpolationDiagnosticsSummary', {
          issues: diagnostics.issues.length,
          errors: diagnostics.modelErrors.length,
        })}
      </Text>
      {diagnostics.isFallback ? (
        <Text fontSize="xs" color="red.600" mb={3}>
          {t('editor.interpolationFallback', {
            layer: diagnostics.baseLayerName ?? t('editor.default'),
          })}
        </Text>
      ) : null}
      <VStack align="stretch" gap={2}>
        {visibleIssues.map((issue, index) => {
          const locationLabel = issueLocationLabel(issue)
          return (
            <Box
              key={`${issue.code}-${issue.layerId ?? 'font'}-${index}`}
              p={2}
              bg="muted"
              borderRadius="sm"
            >
              <HStack gap={2} mb={locationLabel ? 1 : 0} align="center">
                <Badge colorPalette={colorScheme} fontSize="2xs">
                  {issue.code}
                </Badge>
                {locationLabel ? (
                  <Text
                    minW={0}
                    fontSize="2xs"
                    color="mutedForeground"
                    fontFamily="mono"
                    lineClamp={1}
                  >
                    {locationLabel}
                  </Text>
                ) : null}
              </HStack>
              <Text fontSize="xs" color="foreground">
                {issue.message}
              </Text>
            </Box>
          )
        })}

        {visibleModelErrors.map((error, index) => (
          <Box key={`${error.type ?? 'model'}-${index}`} p={2} bg="red.50">
            <HStack gap={2} mb={1} align="center">
              <Badge colorPalette="red" fontSize="2xs">
                {error.type ?? 'model-error'}
              </Badge>
            </HStack>
            <Text fontSize="xs" color="foreground">
              {error.message}
            </Text>
          </Box>
        ))}

        {remainingCount > 0 ? (
          <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
            {t('editor.interpolationMoreDiagnostics', {
              count: remainingCount,
            })}
          </Text>
        ) : null}
      </VStack>
    </Box>
  )
}
