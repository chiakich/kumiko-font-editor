import { FormControl, FormLabel, Input, SimpleGrid } from '@chakra-ui/react'
import type { SingleSubstitutionRule } from 'src/lib/openTypeFeatures'
import { GlyphSelectorFields } from 'src/features/common/projectControl/fontSettings/features/components/GlyphSelectorFields'
import { useTranslation } from 'react-i18next'

interface SingleSubstitutionRuleEditorProps {
  rule: SingleSubstitutionRule
  onChange: (rule: SingleSubstitutionRule) => void
}

export function SingleSubstitutionRuleEditor({
  rule,
  onChange,
}: SingleSubstitutionRuleEditorProps) {
  const { t } = useTranslation()

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      <GlyphSelectorFields
        label={t('projectControl.target')}
        value={rule.target}
        onChange={(target) => onChange({ ...rule, target })}
      />
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
