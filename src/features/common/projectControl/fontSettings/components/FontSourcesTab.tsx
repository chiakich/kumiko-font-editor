import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react'
import type { FontData } from 'src/store'
import { defaultFontSource } from 'src/lib/fontFormats/fontInfoSettings'
import { NumberField } from 'src/features/common/projectControl/fontSettings/components/fields'
import {
  makeId,
  parseNumber,
  type SourceDraft,
} from 'src/features/common/projectControl/fontSettings/utils/model'
import { useTranslation } from 'react-i18next'

interface FontSourcesTabProps {
  fontData: FontData | null
  sources: SourceDraft[]
  onSourcesChange: (sources: SourceDraft[]) => void
}

export function FontSourcesTab({
  fontData,
  sources,
  onSourcesChange,
}: FontSourcesTabProps) {
  const { t } = useTranslation()

  const updateSource = (index: number, update: Partial<SourceDraft>) => {
    onSourcesChange(
      sources.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, ...update } : source
      )
    )
  }

  return (
    <Stack spacing={3}>
      <HStack justify="space-between">
        <Text fontWeight="semibold">{t('projectControl.sourcesTitle')}</Text>
        <Button
          size="sm"
          onClick={() =>
            onSourcesChange([
              ...sources,
              {
                ...defaultFontSource(
                  makeId('source'),
                  `Source ${sources.length + 1}`,
                  {
                    lineMetricsHorizontalLayout:
                      fontData?.lineMetricsHorizontalLayout,
                  }
                ),
                locationText: '{}',
              },
            ])
          }
        >
          {t('projectControl.add')}
        </Button>
      </HStack>
      {sources.map((source, index) => (
        <Box key={source.id} borderWidth="1px" p={3}>
          <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={3}>
            <FormControl>
              <FormLabel fontSize="sm">{t('projectControl.name')}</FormLabel>
              <Input
                value={source.name}
                onChange={(event) =>
                  updateSource(index, { name: event.target.value })
                }
              />
            </FormControl>
            <NumberField
              label={t('projectControl.italicAngle')}
              value={source.italicAngle}
              onChange={(value) =>
                updateSource(index, {
                  italicAngle: parseNumber(value) ?? 0,
                })
              }
            />
            <FormControl>
              <FormLabel fontSize="sm">
                {t('projectControl.locationJson')}
              </FormLabel>
              <Input
                fontFamily="mono"
                value={source.locationText}
                onChange={(event) =>
                  updateSource(index, { locationText: event.target.value })
                }
              />
            </FormControl>
          </SimpleGrid>
          <SimpleGrid columns={{ base: 1, lg: 4 }} spacing={3} mt={3}>
            {(['ascender', 'descender', 'xHeight', 'capHeight'] as const).map(
              (metric) => (
                <NumberField
                  key={metric}
                  label={metric}
                  value={source.lineMetricsHorizontalLayout?.[metric]?.value}
                  onChange={(value) =>
                    updateSource(index, {
                      lineMetricsHorizontalLayout: {
                        ...(source.lineMetricsHorizontalLayout ?? {}),
                        [metric]: {
                          value: parseNumber(value) ?? 0,
                        },
                      },
                    })
                  }
                />
              )
            )}
          </SimpleGrid>
          <HStack justify="flex-end" mt={3}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onSourcesChange(
                  sources.filter((_, itemIndex) => itemIndex !== index)
                )
              }
            >
              {t('projectControl.remove')}
            </Button>
          </HStack>
        </Box>
      ))}
    </Stack>
  )
}
