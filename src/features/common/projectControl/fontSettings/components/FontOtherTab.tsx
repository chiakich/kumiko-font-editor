import {
  Button,
  Checkbox,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Field,
} from '@chakra-ui/react'
import type {
  DevelopmentStatusDefinition,
  FontProjectSettings,
} from 'src/store'
import { NumberField } from 'src/features/common/projectControl/fontSettings/components/fields'
import {
  parseInteger,
  parseNumber,
} from 'src/features/common/projectControl/fontSettings/utils/model'
import { useTranslation } from 'react-i18next'

interface FontOtherTabProps {
  fontType: NonNullable<FontProjectSettings['fontType']>
  outlineType: NonNullable<FontProjectSettings['outlineType']>
  statusDefinitions: DevelopmentStatusDefinition[]
  onFontTypeChange: (
    value: NonNullable<FontProjectSettings['fontType']>
  ) => void
  onOutlineTypeChange: (
    value: NonNullable<FontProjectSettings['outlineType']>
  ) => void
  onStatusDefinitionsChange: (
    statusDefinitions: DevelopmentStatusDefinition[]
  ) => void
}

export function FontOtherTab({
  fontType,
  outlineType,
  statusDefinitions,
  onFontTypeChange,
  onOutlineTypeChange,
  onStatusDefinitionsChange,
}: FontOtherTabProps) {
  const { t } = useTranslation()

  const updateStatus = (
    index: number,
    update: Partial<DevelopmentStatusDefinition>
  ) => {
    onStatusDefinitionsChange(
      statusDefinitions.map((status, statusIndex) =>
        statusIndex === index ? { ...status, ...update } : status
      )
    )
  }

  return (
    <Stack gap={5}>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <Field.Root>
          <Field.Label textStyle="label">
            {t('projectControl.fontType')}
          </Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              value={fontType}
              onChange={(event) =>
                onFontTypeChange(
                  event.target.value === 'variable' ? 'variable' : 'static'
                )
              }
            >
              <option value="static">{t('projectControl.static')}</option>
              <option value="variable">{t('projectControl.variable')}</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Field.Root>
          <Field.Label textStyle="label">
            {t('projectControl.outlineType')}
          </Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              value={outlineType}
              onChange={(event) =>
                onOutlineTypeChange(
                  event.target.value === 'quadratic' ? 'quadratic' : 'cubic'
                )
              }
            >
              <option value="cubic">{t('projectControl.cubic')}</option>
              <option value="quadratic">{t('projectControl.quadratic')}</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
      </SimpleGrid>
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {t('projectControl.statusDefinitions')}
        </Text>
        <Button
          size="sm"
          onClick={() =>
            onStatusDefinitionsChange([
              ...statusDefinitions,
              {
                value: statusDefinitions.length,
                label: `Status ${statusDefinitions.length}`,
                color: [1, 0, 0, 1],
              },
            ])
          }
        >
          {t('projectControl.add')}
        </Button>
      </HStack>
      <Stack gap={3}>
        {statusDefinitions.map((status, index) => (
          <SimpleGrid
            key={`${status.value}-${index}`}
            columns={{ base: 1, lg: 5 }}
            gap={3}
          >
            <NumberField
              label={t('projectControl.value')}
              min={0}
              value={status.value}
              onChange={(value) =>
                updateStatus(index, {
                  value: parseInteger(value) ?? status.value,
                })
              }
            />
            <Field.Root>
              <Field.Label textStyle="label">
                {t('projectControl.label')}
              </Field.Label>
              <Input
                value={status.label}
                onChange={(event) =>
                  updateStatus(index, { label: event.target.value })
                }
              />
            </Field.Root>
            {[0, 1, 2, 3].map((colorIndex) => (
              <NumberField
                key={colorIndex}
                label={['R', 'G', 'B', 'A'][colorIndex] ?? ''}
                min={0}
                max={1}
                value={status.color[colorIndex]}
                onChange={(value) => {
                  const nextColor = [...status.color] as [
                    number,
                    number,
                    number,
                    number,
                  ]
                  nextColor[colorIndex] = parseNumber(value) ?? 0
                  updateStatus(index, { color: nextColor })
                }}
              />
            ))}
            <Checkbox.Root
              alignSelf="end"
              onCheckedChange={(details) =>
                updateStatus(index, { isDefault: details.checked === true })
              }
              checked={status.isDefault ?? false}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{t('projectControl.default')}</Checkbox.Label>
            </Checkbox.Root>
          </SimpleGrid>
        ))}
      </Stack>
    </Stack>
  )
}
