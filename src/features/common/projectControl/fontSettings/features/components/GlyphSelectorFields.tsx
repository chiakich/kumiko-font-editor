import { FormControl, FormLabel, HStack, Input, Select } from '@chakra-ui/react'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface GlyphSelectorFieldsProps {
  label: string
  value: GlyphSelector
  onChange: (value: GlyphSelector) => void
}

export function GlyphSelectorFields({
  label,
  value,
  onChange,
}: GlyphSelectorFieldsProps) {
  const { t } = useTranslation()

  return (
    <FormControl>
      <FormLabel fontSize="xs">{label}</FormLabel>
      <HStack>
        <Select
          size="sm"
          w="120px"
          value={value.kind}
          onChange={(event) =>
            onChange(createSelector(event.target.value, getSelectorText(value)))
          }
        >
          <option value="glyph">{t('projectControl.glyph')}</option>
          <option value="class">{t('projectControl.class')}</option>
        </Select>
        <Input
          size="sm"
          fontFamily="mono"
          value={getSelectorText(value)}
          onChange={(event) =>
            onChange(createSelector(value.kind, event.target.value))
          }
        />
      </HStack>
    </FormControl>
  )
}

function getSelectorText(value: GlyphSelector) {
  return value.kind === 'glyph' ? value.glyph : value.classId
}

function createSelector(kind: string, text: string): GlyphSelector {
  return kind === 'class'
    ? { kind: 'class', classId: text }
    : { kind: 'glyph', glyph: text }
}
