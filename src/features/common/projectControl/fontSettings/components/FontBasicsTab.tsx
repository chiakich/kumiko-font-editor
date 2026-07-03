import {
  Box,
  Button,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Field,
} from '@chakra-ui/react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  generalFontInfoFields,
  openTypeFontInfoSettings,
} from 'src/lib/fontFormats/fontInfoSettings'
import type { FontAxis } from 'src/store'
import { NumberField } from 'src/features/common/projectControl/fontSettings/components/fields'
import { LocalizedNamesEditor } from 'src/features/common/projectControl/fontSettings/components/LocalizedNamesEditor'
import {
  parseNumber,
  toArrayDraftValue,
  toDraftValue,
  type FontInfoDraft,
  type OpenTypeDraft,
} from 'src/features/common/projectControl/fontSettings/utils/model'
import { useTranslation } from 'react-i18next'

const formatAxisValues = (values: number[] | undefined) =>
  values?.join(', ') ?? ''

const parseAxisValues = (value: string) => {
  const values = [
    ...new Set(
      value
        .split(',')
        .map((entry) => Number(entry.trim()))
        .filter(Number.isFinite)
    ),
  ].sort((left, right) => left - right)
  return values.length > 0 ? values : undefined
}

interface FontBasicsTabProps {
  axes: FontAxis[]
  customParametersText: string
  generalDraft: FontInfoDraft
  mappingsText: string
  openTypeDraft: OpenTypeDraft
  unitsPerEm: string
  localizedNames: Record<string, Record<string, string>>
  onAxesChange: (axes: FontAxis[]) => void
  onCustomParametersTextChange: (value: string) => void
  onGeneralDraftChange: (draft: FontInfoDraft) => void
  onMappingsTextChange: (value: string) => void
  onOpenTypeDraftChange: (draft: OpenTypeDraft) => void
  onUnitsPerEmChange: (value: string) => void
  onLocalizedNamesChange: (
    localizedNames: Record<string, Record<string, string>>
  ) => void
}

export function FontBasicsTab({
  axes,
  customParametersText,
  generalDraft,
  mappingsText,
  openTypeDraft,
  unitsPerEm,
  localizedNames,
  onAxesChange,
  onCustomParametersTextChange,
  onGeneralDraftChange,
  onMappingsTextChange,
  onOpenTypeDraftChange,
  onUnitsPerEmChange,
  onLocalizedNamesChange,
}: FontBasicsTabProps) {
  const { t } = useTranslation()

  const updateAxis = (index: number, update: Partial<FontAxis>) => {
    onAxesChange(
      axes.map((axis, axisIndex) =>
        axisIndex === index ? { ...axis, ...update } : axis
      )
    )
  }

  return (
    <Stack gap={6}>
      <Box>
        <Text fontWeight="semibold" mb={3}>
          {t('projectControl.static')}
        </Text>
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4}>
          {generalFontInfoFields.map((field) =>
            field.type === 'number' ? (
              <NumberField
                key={field.key}
                label={field.label}
                min={field.min}
                value={generalDraft[field.key]}
                onChange={(value) =>
                  onGeneralDraftChange({ ...generalDraft, [field.key]: value })
                }
              />
            ) : (
              <Field.Root key={field.key}>
                <Field.Label textStyle="label">{field.label}</Field.Label>
                <Input
                  maxW={field.width}
                  value={generalDraft[field.key]}
                  onChange={(event) =>
                    onGeneralDraftChange({
                      ...generalDraft,
                      [field.key]: event.target.value,
                    })
                  }
                />
              </Field.Root>
            )
          )}
          <NumberField
            label={t('projectControl.unitsPerEm')}
            min={1}
            value={unitsPerEm}
            onChange={onUnitsPerEmChange}
          />
        </SimpleGrid>
      </Box>
      <Box>
        <Text fontWeight="semibold" mb={3}>
          {t('projectControl.localizedNames')}
        </Text>
        <LocalizedNamesEditor
          localizedNames={localizedNames}
          onChange={onLocalizedNamesChange}
        />
      </Box>
      <Box>
        <HStack justify="space-between" mb={3}>
          <Text fontWeight="semibold">{t('projectControl.variationAxes')}</Text>
          <Button
            size="sm"
            onClick={() =>
              onAxesChange([
                ...axes,
                {
                  name: 'weight',
                  label: t('projectControl.weight'),
                  tag: 'wght',
                  minValue: 100,
                  defaultValue: 400,
                  maxValue: 900,
                },
              ])
            }
          >
            {t('projectControl.add')}
          </Button>
        </HStack>
        <Stack gap={3}>
          {axes.map((axis, index) => (
            <Box key={`${axis.name}-${index}`} borderWidth="1px" p={3}>
              <SimpleGrid columns={{ base: 1, lg: 7 }} gap={3}>
                <Field.Root>
                  <Field.Label textStyle="label">
                    {t('projectControl.name')}
                  </Field.Label>
                  <Input
                    value={axis.name}
                    onChange={(event) =>
                      updateAxis(index, { name: event.target.value })
                    }
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label textStyle="label">
                    {t('projectControl.tag')}
                  </Field.Label>
                  <Input
                    value={axis.tag}
                    maxLength={4}
                    onChange={(event) =>
                      updateAxis(index, { tag: event.target.value })
                    }
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label textStyle="label">
                    {t('projectControl.label')}
                  </Field.Label>
                  <Input
                    value={axis.label}
                    onChange={(event) =>
                      updateAxis(index, { label: event.target.value })
                    }
                  />
                </Field.Root>
                {(['minValue', 'defaultValue', 'maxValue'] as const).map(
                  (key) => (
                    <NumberField
                      key={key}
                      label={key}
                      value={axis[key]}
                      onChange={(value) =>
                        updateAxis(index, {
                          [key]: parseNumber(value) ?? axis[key],
                        })
                      }
                    />
                  )
                )}
                <Field.Root>
                  <Field.Label textStyle="label">
                    {t('projectControl.axisValues')}
                  </Field.Label>
                  <Input
                    fontFamily="mono"
                    value={formatAxisValues(axis.values)}
                    onChange={(event) =>
                      updateAxis(index, {
                        values: parseAxisValues(event.target.value),
                      })
                    }
                  />
                </Field.Root>
              </SimpleGrid>
              <HStack mt={3} justify="space-between">
                <Checkbox
                  onCheckedChange={(details) =>
                    updateAxis(index, { hidden: details.checked === true })
                  }
                  checked={axis.hidden ?? false}
                >
                  {t('projectControl.hidden')}
                </Checkbox>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onAxesChange(
                      axes.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  {t('projectControl.remove')}
                </Button>
              </HStack>
            </Box>
          ))}
        </Stack>
      </Box>
      <Field.Root>
        <Field.Label textStyle="label">
          {t('projectControl.crossAxisMapping')}
        </Field.Label>
        <Textarea
          minH="140px"
          fontFamily="mono"
          value={mappingsText}
          onChange={(event) => onMappingsTextChange(event.target.value)}
        />
      </Field.Root>
      <Box>
        <Text fontWeight="semibold" mb={3}>
          {t('projectControl.opentypeSettings')}
        </Text>
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4}>
          {openTypeFontInfoSettings.map((setting) =>
            setting.type === 'number' ? (
              <NumberField
                key={setting.key}
                label={setting.label}
                min={setting.min}
                max={setting.max}
                value={openTypeDraft[setting.key]}
                onChange={(value) =>
                  onOpenTypeDraftChange({
                    ...openTypeDraft,
                    [setting.key]: value,
                  })
                }
              />
            ) : (
              <Field.Root key={setting.key}>
                <Field.Label textStyle="label">{setting.label}</Field.Label>
                <Input
                  value={openTypeDraft[setting.key]}
                  placeholder={
                    setting.type === 'array'
                      ? toArrayDraftValue(setting.defaultValue)
                      : toDraftValue(setting.defaultValue)
                  }
                  onChange={(event) =>
                    onOpenTypeDraftChange({
                      ...openTypeDraft,
                      [setting.key]: event.target.value,
                    })
                  }
                />
              </Field.Root>
            )
          )}
        </SimpleGrid>
      </Box>
      <Field.Root>
        <Field.Label textStyle="label">
          {t('projectControl.customParameters')}
        </Field.Label>
        <Textarea
          minH="160px"
          fontFamily="mono"
          value={customParametersText}
          onChange={(event) => onCustomParametersTextChange(event.target.value)}
        />
      </Field.Root>
    </Stack>
  )
}
