import { Stack, Textarea, Field } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'

interface FontSupplementalTabProps {
  notes: string
  supplementalText: string
  onNotesChange: (value: string) => void
  onSupplementalTextChange: (value: string) => void
}

export function FontSupplementalTab({
  notes,
  supplementalText,
  onNotesChange,
  onSupplementalTextChange,
}: FontSupplementalTabProps) {
  const { t } = useTranslation()

  return (
    <Stack gap={4}>
      <Field.Root>
        <Field.Label textStyle="label">{t('projectControl.notes')}</Field.Label>
        <Textarea
          minH="180px"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label textStyle="label">
          {t('projectControl.supplemental')}
        </Field.Label>
        <Textarea
          minH="260px"
          value={supplementalText}
          onChange={(event) => onSupplementalTextChange(event.target.value)}
        />
      </Field.Root>
    </Stack>
  )
}
