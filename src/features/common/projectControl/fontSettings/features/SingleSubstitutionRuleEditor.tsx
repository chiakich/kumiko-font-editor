import { FormControl, FormLabel, Input, SimpleGrid } from '@chakra-ui/react'
import type { SingleSubstitutionRule } from 'src/lib/openTypeFeatures'
import { GlyphSelectorFields } from 'src/features/common/projectControl/fontSettings/features/GlyphSelectorFields'

interface SingleSubstitutionRuleEditorProps {
  rule: SingleSubstitutionRule
  onChange: (rule: SingleSubstitutionRule) => void
}

export function SingleSubstitutionRuleEditor({
  rule,
  onChange,
}: SingleSubstitutionRuleEditorProps) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      <GlyphSelectorFields
        label="Target"
        value={rule.target}
        onChange={(target) => onChange({ ...rule, target })}
      />
      <FormControl>
        <FormLabel fontSize="xs">Replacement glyph</FormLabel>
        <Input
          size="sm"
          fontFamily="mono"
          value={rule.replacement}
          onChange={(event) =>
            onChange({ ...rule, replacement: event.target.value })
          }
        />
      </FormControl>
    </SimpleGrid>
  )
}
