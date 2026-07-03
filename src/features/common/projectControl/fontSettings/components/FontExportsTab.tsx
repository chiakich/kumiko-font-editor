import {
  Box,
  Button,
  Checkbox,
  HStack,
  Input,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  Field,
} from '@chakra-ui/react'
import { NumberField } from 'src/features/common/projectControl/fontSettings/components/fields'
import {
  makeId,
  parseInteger,
  parseLocation,
  parseNumber,
  stringifyJson,
  type ExportDraft,
  type SourceDraft,
} from 'src/features/common/projectControl/fontSettings/utils/model'
import type { FontAxis } from 'src/store'
import { useTranslation } from 'react-i18next'

interface FontExportsTabProps {
  axes: FontAxis[]
  sources: SourceDraft[]
  exports: ExportDraft[]
  onExportsChange: (exports: ExportDraft[]) => void
}

const axisStep = (axis: FontAxis) => {
  const range = Math.abs(axis.maxValue - axis.minValue)
  return range > 0 && range <= 4 ? 0.01 : 1
}

interface AxisLocationFieldProps {
  axis: FontAxis
  value: number
  onChange: (value: number) => void
}

// A slider + numeric entry for one axis, warning when the value falls outside
// the axis range (the variable-font build silently drops out-of-range instances).
function AxisLocationField({ axis, value, onChange }: AxisLocationFieldProps) {
  const { t } = useTranslation()
  const min = Math.min(axis.minValue, axis.maxValue)
  const max = Math.max(axis.minValue, axis.maxValue)
  const outOfRange = value < min || value > max
  const sliderValue = Math.min(max, Math.max(min, value))
  return (
    <Field.Root>
      <HStack justify="space-between" align="baseline">
        <Field.Label textStyle="label">{axis.label || axis.name}</Field.Label>
        <Text
          fontSize="xs"
          fontFamily="mono"
          color={outOfRange ? 'red.500' : 'mutedForeground'}
        >
          {value}
        </Text>
      </HStack>
      <HStack gap={3} align="center">
        <Slider.Root
          flex="1"
          min={min}
          max={max}
          step={axisStep(axis)}
          value={[sliderValue]}
          aria-label={[axis.label || axis.name]}
          onValueChange={(details) => onChange(details.value[0] ?? value)}
        >
          <Slider.Control>
            <Slider.Track bg="muted">
              <Slider.Range bg="primary" />
            </Slider.Track>
            <Slider.Thumb index={0} boxSize={3} />
          </Slider.Control>
        </Slider.Root>
        <Box w="88px" flexShrink={0}>
          <NumberField
            label=""
            value={value}
            onChange={(next) => {
              const parsed = parseNumber(next)
              onChange(parsed ?? axis.defaultValue)
            }}
          />
        </Box>
      </HStack>
      {outOfRange ? (
        <Text fontSize="xs" color="red.500" mt={1}>
          {t('projectControl.axisRangeWarning', {
            min,
            max,
            defaultValue: `${min}–${max}`,
          })}
        </Text>
      ) : null}
    </Field.Root>
  )
}

export function FontExportsTab({
  axes,
  sources,
  exports,
  onExportsChange,
}: FontExportsTabProps) {
  const { t } = useTranslation()
  const defaultLocation = Object.fromEntries(
    axes.map((axis) => [axis.name, axis.defaultValue])
  )

  // Create one export instance per master that doesn't already have an instance
  // at its location — mirrors Glyphs' "add instance for each master".
  const addInstancePerMaster = () => {
    const existingKeys = new Set(
      exports.map((instance) => stringifyJson(instance.location))
    )
    const additions: ExportDraft[] = []
    for (const source of sources) {
      const location = parseLocation(source.locationText)
      const key = stringifyJson(location)
      if (existingKeys.has(key)) {
        continue
      }
      existingKeys.add(key)
      additions.push({
        id: makeId('instance'),
        name: source.name || 'Instance',
        styleName: source.name || 'Regular',
        location,
        locationText: stringifyJson(location),
        export: true,
      })
    }
    if (additions.length > 0) {
      onExportsChange([...exports, ...additions])
    }
  }

  const updateExport = (index: number, update: Partial<ExportDraft>) => {
    onExportsChange(
      exports.map((instance, instanceIndex) =>
        instanceIndex === index ? { ...instance, ...update } : instance
      )
    )
  }

  const updateLocation = (index: number, location: Record<string, number>) => {
    updateExport(index, {
      location,
      locationText: stringifyJson(location),
    })
  }

  return (
    <Stack gap={3}>
      <HStack justify="space-between">
        <Text fontWeight="semibold">{t('projectControl.exportInstances')}</Text>
        <HStack gap={2}>
          {sources.length > 0 ? (
            <Button size="sm" variant="outline" onClick={addInstancePerMaster}>
              {t('projectControl.addInstancePerMaster')}
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() =>
              onExportsChange([
                ...exports,
                {
                  id: makeId('instance'),
                  name: `Instance ${exports.length + 1}`,
                  styleName: 'Regular',
                  location: defaultLocation,
                  locationText: stringifyJson(defaultLocation),
                  export: true,
                },
              ])
            }
          >
            {t('projectControl.add')}
          </Button>
        </HStack>
      </HStack>
      {exports.map((instance, index) => (
        <Box key={instance.id} borderWidth="1px" p={3}>
          <SimpleGrid columns={{ base: 1, lg: 4 }} gap={3}>
            <Field.Root>
              <Field.Label textStyle="label">
                {t('projectControl.name')}
              </Field.Label>
              <Input
                value={instance.name}
                onChange={(event) =>
                  updateExport(index, { name: event.target.value })
                }
              />
            </Field.Root>
            <Field.Root>
              <Field.Label textStyle="label">
                {t('projectControl.familyName')}
              </Field.Label>
              <Input
                value={instance.familyName ?? ''}
                onChange={(event) =>
                  updateExport(index, { familyName: event.target.value })
                }
              />
            </Field.Root>
            <Field.Root>
              <Field.Label textStyle="label">
                {t('projectControl.styleName')}
              </Field.Label>
              <Input
                value={instance.styleName}
                onChange={(event) =>
                  updateExport(index, { styleName: event.target.value })
                }
              />
            </Field.Root>
            <Field.Root>
              <Field.Label textStyle="label">
                {t('projectControl.fileName')}
              </Field.Label>
              <Input
                value={instance.fileName ?? ''}
                onChange={(event) =>
                  updateExport(index, { fileName: event.target.value })
                }
              />
            </Field.Root>
          </SimpleGrid>
          {axes.length > 0 ? (
            <SimpleGrid columns={{ base: 1, lg: 2 }} gap={3} mt={3}>
              {axes.map((axis) => (
                <AxisLocationField
                  key={axis.name}
                  axis={axis}
                  value={instance.location[axis.name] ?? axis.defaultValue}
                  onChange={(value) =>
                    updateLocation(index, {
                      ...instance.location,
                      [axis.name]: value,
                    })
                  }
                />
              ))}
            </SimpleGrid>
          ) : (
            <SimpleGrid columns={{ base: 1, lg: 4 }} gap={3} mt={3}>
              <Field.Root>
                <Field.Label textStyle="label">
                  {t('projectControl.locationJson')}
                </Field.Label>
                <Input
                  fontFamily="mono"
                  value={instance.locationText}
                  onChange={(event) => {
                    updateExport(index, {
                      locationText: event.target.value,
                      location: parseLocation(event.target.value),
                    })
                  }}
                />
              </Field.Root>
            </SimpleGrid>
          )}
          <SimpleGrid columns={{ base: 1, lg: 4 }} gap={3} mt={3}>
            <NumberField
              label={t('projectControl.weightClass')}
              min={1}
              max={1000}
              value={instance.weightClass}
              onChange={(value) =>
                updateExport(index, { weightClass: parseInteger(value) })
              }
            />
            <NumberField
              label={t('projectControl.widthClass')}
              min={1}
              max={9}
              value={instance.widthClass}
              onChange={(value) =>
                updateExport(index, { widthClass: parseInteger(value) })
              }
            />
            <NumberField
              label={t('projectControl.italicAngle')}
              value={instance.italicAngle}
              onChange={(value) =>
                updateExport(index, { italicAngle: parseNumber(value) })
              }
            />
          </SimpleGrid>
          <HStack gap={6} mt={3} align="center">
            <Text fontSize="sm" color="mutedForeground">
              {t('projectControl.styleLinking')}
            </Text>
            <Checkbox.Root
              checked={instance.isBold === true}
              onCheckedChange={(details) =>
                updateExport(index, { isBold: details.checked === true })
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{t('projectControl.bold')}</Checkbox.Label>
            </Checkbox.Root>
            <Checkbox.Root
              checked={instance.isItalic === true}
              onCheckedChange={(details) =>
                updateExport(index, { isItalic: details.checked === true })
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{t('projectControl.italic')}</Checkbox.Label>
            </Checkbox.Root>
          </HStack>
          <HStack justify="space-between" mt={3}>
            <Checkbox.Root
              onCheckedChange={(details) =>
                updateExport(index, { export: details.checked === true })
              }
              checked={instance.export}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{t('projectControl.export')}</Checkbox.Label>
            </Checkbox.Root>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onExportsChange(
                  exports.filter((_, itemIndex) => itemIndex !== index)
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
