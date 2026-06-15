import { FormControl, FormLabel, Input, SimpleGrid } from '@chakra-ui/react'
import type { LigatureSubstitutionRule } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface LigatureSubstitutionRuleEditorProps {
  rule: LigatureSubstitutionRule
  onChange: (rule: LigatureSubstitutionRule) => void
}

export function LigatureSubstitutionRuleEditor({
  rule,
  onChange,
}: LigatureSubstitutionRuleEditorProps) {
  const { t } = useTranslation()

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      <FormControl>
        <FormLabel fontSize="xs">{t('projectControl.components')}</FormLabel>
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
        <FormLabel fontSize="xs">
          {t('projectControl.replacementGlyph')}
        </FormLabel>
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
