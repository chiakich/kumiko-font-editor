import { useState } from 'react'
import {
  Box,
  Button,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Field,
} from '@chakra-ui/react'
import type { FontAxis, FontData, FontSource } from 'src/store'
import { NumberField } from 'src/features/common/projectControl/fontSettings/components/fields'
import { AddMasterModal } from 'src/features/common/projectControl/fontSettings/components/AddMasterModal'
import {
  parseNumber,
  stringifyJson,
  type SourceDraft,
} from 'src/features/common/projectControl/fontSettings/utils/model'
import { useTranslation } from 'react-i18next'

interface FontSourcesTabProps {
  fontData: FontData | null
  axes: FontAxis[]
  sources: SourceDraft[]
  onSourcesChange: (sources: SourceDraft[]) => void
}

export function FontSourcesTab({
  axes,
  sources,
  onSourcesChange,
}: FontSourcesTabProps) {
  const { t } = useTranslation()
  const [isAddOpen, setIsAddOpen] = useState(false)

  const updateSource = (index: number, update: Partial<SourceDraft>) => {
    onSourcesChange(
      sources.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, ...update } : source
      )
    )
  }

  const onMasterAdded = (source: FontSource) => {
    onSourcesChange([
      ...sources,
      { ...source, locationText: stringifyJson(source.location) },
    ])
  }

  return (
    <Stack gap={3}>
      <HStack justify="space-between">
        <Text fontWeight="semibold">{t('projectControl.sourcesTitle')}</Text>
        <Button size="sm" onClick={() => setIsAddOpen(true)}>
          {t('projectControl.addMaster')}
        </Button>
      </HStack>

      <AddMasterModal
        isOpen={isAddOpen}
        axes={axes}
        sources={sources}
        onClose={() => setIsAddOpen(false)}
        onMasterAdded={onMasterAdded}
      />

      {sources.map((source, index) => (
        <Box key={source.id} borderWidth="1px" p={3}>
          <SimpleGrid columns={{ base: 1, lg: 3 }} gap={3}>
            <Field.Root>
              <Field.Label textStyle="label">
                {t('projectControl.name')}
              </Field.Label>
              <Input
                value={source.name}
                onChange={(event) =>
                  updateSource(index, { name: event.target.value })
                }
              />
            </Field.Root>
            <NumberField
              label={t('projectControl.italicAngle')}
              value={source.italicAngle}
              onChange={(value) =>
                updateSource(index, {
                  italicAngle: parseNumber(value) ?? 0,
                })
              }
            />
            <Field.Root>
              <Field.Label textStyle="label">
                {t('projectControl.locationJson')}
              </Field.Label>
              <Input
                fontFamily="mono"
                value={source.locationText}
                onChange={(event) =>
                  updateSource(index, { locationText: event.target.value })
                }
              />
            </Field.Root>
          </SimpleGrid>
          <SimpleGrid columns={{ base: 1, lg: 4 }} gap={3} mt={3}>
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
