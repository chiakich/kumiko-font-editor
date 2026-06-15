import { FormControl, FormLabel, Stack, Textarea } from '@chakra-ui/react'
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
    <Stack spacing={4}>
      <FormControl>
        <FormLabel fontSize="sm">{t('projectControl.notes')}</FormLabel>
        <Textarea
          minH="180px"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </FormControl>
      <FormControl>
        <FormLabel fontSize="sm">{t('projectControl.supplemental')}</FormLabel>
        <Textarea
          minH="260px"
          value={supplementalText}
          onChange={(event) => onSupplementalTextChange(event.target.value)}
        />
      </FormControl>
    </Stack>
  )
}
