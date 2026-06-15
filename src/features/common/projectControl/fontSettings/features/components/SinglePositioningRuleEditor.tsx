import { SimpleGrid } from '@chakra-ui/react'
import type { SinglePositioningRule } from 'src/lib/openTypeFeatures'
import { GlyphSelectorFields } from 'src/features/common/projectControl/fontSettings/features/components/GlyphSelectorFields'
import { ValueRecordFields } from 'src/features/common/projectControl/fontSettings/features/components/ValueRecordFields'
import { useTranslation } from 'react-i18next'

interface SinglePositioningRuleEditorProps {
  rule: SinglePositioningRule
  onChange: (rule: SinglePositioningRule) => void
}

export function SinglePositioningRuleEditor({
  rule,
  onChange,
}: SinglePositioningRuleEditorProps) {
  const { t } = useTranslation()

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      <GlyphSelectorFields
        label={t('projectControl.target')}
        value={rule.target}
        onChange={(target) => onChange({ ...rule, target })}
      />
      <ValueRecordFields
        label={t('projectControl.value')}
        value={rule.value}
        onChange={(value) => onChange({ ...rule, value: value ?? {} })}
      />
    </SimpleGrid>
  )
}
