import { FormControl, FormLabel, Input, SimpleGrid } from '@chakra-ui/react'
import type { LigatureSubstitutionRule } from 'src/lib/openTypeFeatures'

interface LigatureSubstitutionRuleEditorProps {
  rule: LigatureSubstitutionRule
  onChange: (rule: LigatureSubstitutionRule) => void
}

export function LigatureSubstitutionRuleEditor({
  rule,
  onChange,
}: LigatureSubstitutionRuleEditorProps) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      <FormControl>
        <FormLabel fontSize="xs">Components</FormLabel>
        <Input
          size="sm"
          fontFamily="mono"
          value={rule.components.join(' ')}
          onChange={(event) =>
            onChange({
              ...rule,
              components: parseGlyphList(event.target.value),
            })
          }
        />
      </FormControl>
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

function parseGlyphList(value: string) {
  return value.trim().split(/\s+/).filter(Boolean)
}
