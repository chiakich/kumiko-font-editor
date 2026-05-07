import { Box, Grid, GridItem, Heading, Input, Text } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import type { GlyphMetrics } from 'src/store'

type MetricField = 'lsb' | 'rsb' | 'width'

interface MetricsCardProps {
  displayedMetrics: GlyphMetrics | null | undefined
  onMetricsChange: (field: MetricField, value: string) => void
}

const metricFields: MetricField[] = ['lsb', 'width', 'rsb']

const formatMetrics = (metrics: GlyphMetrics | null | undefined) => ({
  lsb: String(metrics?.lsb ?? 0),
  width: String(metrics?.width ?? 0),
  rsb: String(metrics?.rsb ?? 0),
})

export function MetricsCard({
  displayedMetrics,
  onMetricsChange,
}: MetricsCardProps) {
  const [focusedField, setFocusedField] = useState<MetricField | null>(null)
  const [draftMetrics, setDraftMetrics] = useState(() =>
    formatMetrics(displayedMetrics)
  )

  useEffect(() => {
    const nextMetrics = formatMetrics(displayedMetrics)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftMetrics((currentMetrics) => ({
      lsb: focusedField === 'lsb' ? currentMetrics.lsb : nextMetrics.lsb,
      width:
        focusedField === 'width' ? currentMetrics.width : nextMetrics.width,
      rsb: focusedField === 'rsb' ? currentMetrics.rsb : nextMetrics.rsb,
    }))
  }, [displayedMetrics, focusedField])

  const handleMetricChange = (field: MetricField, value: string) => {
    setDraftMetrics((currentMetrics) => ({
      ...currentMetrics,
      [field]: value,
    }))

    if (value.trim() !== '') {
      onMetricsChange(field, value)
    }
  }

  const handleBlur = (field: MetricField) => {
    setFocusedField(null)
    if (draftMetrics[field].trim() === '') {
      setDraftMetrics((currentMetrics) => ({
        ...currentMetrics,
        [field]: String(displayedMetrics?.[field] ?? 0),
      }))
    }
  }

  return (
    <Box p={4} bg="field.panel" borderRadius="sm">
      <Heading size="sm" mb={3} textTransform="uppercase" color="field.ink">
        Metrics
      </Heading>
      <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap={3}>
        {metricFields.map((field) => (
          <GridItem key={field}>
            <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
              {field === 'lsb' ? 'LSB' : field === 'rsb' ? 'RSB' : 'Width'}
            </Text>
            <Input
              size="sm"
              type="number"
              value={draftMetrics[field]}
              onFocus={() => setFocusedField(field)}
              onBlur={() => handleBlur(field)}
              onChange={(event) =>
                handleMetricChange(field, event.target.value)
              }
            />
          </GridItem>
        ))}
      </Grid>
    </Box>
  )
}
