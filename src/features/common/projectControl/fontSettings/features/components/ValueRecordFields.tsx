import { FormControl, FormLabel, Input, SimpleGrid } from '@chakra-ui/react'
import type { ValueRecord } from 'src/lib/openTypeFeatures'
import {
  getValueRecordFieldText,
  updateValueRecordField,
  type ValueRecordField,
} from 'src/features/common/projectControl/fontSettings/features/utils/valueRecordState'

interface ValueRecordFieldsProps {
  label: string
  value: ValueRecord | undefined
  onChange: (value: ValueRecord | undefined) => void
}

const VALUE_RECORD_FIELDS: Array<{
  field: ValueRecordField
  label: string
}> = [
  { field: 'xPlacement', label: 'X place' },
  { field: 'yPlacement', label: 'Y place' },
  { field: 'xAdvance', label: 'X advance' },
  { field: 'yAdvance', label: 'Y advance' },
]

export function ValueRecordFields({
  label,
  value,
  onChange,
}: ValueRecordFieldsProps) {
  return (
    <FormControl>
      <FormLabel fontSize="xs">{label}</FormLabel>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
        {VALUE_RECORD_FIELDS.map((entry) => (
          <Input
            key={entry.field}
            size="sm"
            type="number"
            placeholder={entry.label}
            value={getValueRecordFieldText(value, entry.field)}
            onChange={(event) =>
              onChange(
                updateValueRecordField(value, entry.field, event.target.value)
              )
            }
          />
        ))}
      </SimpleGrid>
    </FormControl>
  )
}
