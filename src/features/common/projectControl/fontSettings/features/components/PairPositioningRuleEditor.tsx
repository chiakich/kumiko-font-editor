import { Stack } from '@chakra-ui/react'
import type { PairPositioningRule } from 'src/lib/openTypeFeatures'
import { GlyphSelectorFields } from 'src/features/common/projectControl/fontSettings/features/components/GlyphSelectorFields'
import { ValueRecordFields } from 'src/features/common/projectControl/fontSettings/features/components/ValueRecordFields'
import { useTranslation } from 'react-i18next'

interface PairPositioningRuleEditorProps {
  rule: PairPositioningRule
  onChange: (rule: PairPositioningRule) => void
}

export function PairPositioningRuleEditor({
  rule,
  onChange,
}: PairPositioningRuleEditorProps) {
  const { t } = useTranslation()

  return (
    <Stack spacing={3}>
      <GlyphSelectorFields
        label={t('projectControl.left')}
        value={rule.left}
        onChange={(left) => onChange({ ...rule, left })}
      />
      <GlyphSelectorFields
        label={t('projectControl.right')}
        value={rule.right}
        onChange={(right) => onChange({ ...rule, right })}
      />
      <ValueRecordFields
        label={t('projectControl.firstValue')}
        value={rule.firstValue}
        onChange={(firstValue) => onChange({ ...rule, firstValue })}
      />
      <ValueRecordFields
        label={t('projectControl.secondValue')}
        value={rule.secondValue}
        onChange={(secondValue) => onChange({ ...rule, secondValue })}
      />
    </Stack>
  )
}
