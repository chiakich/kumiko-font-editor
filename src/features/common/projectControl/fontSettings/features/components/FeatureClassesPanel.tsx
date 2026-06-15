import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeatureClassesPanelProps {
  state: OpenTypeFeaturesState
}

export function FeatureClassesPanel({ state }: FeatureClassesPanelProps) {
  const { t } = useTranslation()

  return (
    <Stack spacing={5}>
      <Stack spacing={2}>
        <Text fontWeight="semibold">{t('projectControl.classes')}</Text>
        <Text fontSize="sm" color="field.muted">
          {t('projectControl.glyphAndMarkClassesAreShared')}
        </Text>
      </Stack>
      <ClassSection
        emptyText="No glyph classes."
        title={t('projectControl.glyphClasses')}
        items={state.glyphClasses.map((glyphClass) => ({
          id: glyphClass.id,
          label: glyphClass.name,
          detail: `${glyphClass.glyphs.length} glyphs`,
          sample: glyphClass.glyphs.slice(0, 12),
        }))}
      />
      <ClassSection
        emptyText="No mark classes."
        title={t('projectControl.markClasses')}
        items={state.markClasses.map((markClass) => ({
          id: markClass.id,
          label: markClass.name,
          detail: `${markClass.marks.length} marks`,
          sample: markClass.marks.slice(0, 12).map((mark) => mark.glyph),
        }))}
      />
    </Stack>
  )
}

function ClassSection({
  emptyText,
  items,
  title,
}: {
  emptyText: string
  items: Array<{
    id: string
    label: string
    detail: string
    sample: string[]
  }>
  title: string
}) {
  return (
    <Stack spacing={2}>
      <Text fontSize="xs" fontWeight="900" color="field.muted">
        {title}
      </Text>
      {items.length === 0 ? (
        <Text fontSize="sm" color="field.muted">
          {emptyText}
        </Text>
      ) : (
        items.map((item) => (
          <Stack
            key={item.id}
            spacing={2}
            borderWidth="1px"
            borderRadius="sm"
            p={3}
          >
            <HStack justify="space-between">
              <Text fontFamily="mono" fontWeight="900">
                {item.label}
              </Text>
              <Badge>{item.detail}</Badge>
            </HStack>
            <Text fontSize="xs" color="field.muted" noOfLines={2}>
              {item.sample.join(' ')}
              {item.sample.length >= 12 ? ' ...' : ''}
            </Text>
          </Stack>
        ))
      )}
    </Stack>
  )
}
