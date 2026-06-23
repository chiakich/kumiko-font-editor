import {
  Badge,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import {
  Metric,
  SourceSectionsDocument,
} from 'src/features/common/projectControl/fontSettings/features/components/OpenTypeDocumentPrimitives'
import {
  deriveOpenTypeSourceSectionRecords,
  type GlyphClass,
  type MarkClass,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

export function RawFeatureTextEditor({
  rawFeatureText,
  onRawFeatureTextChange,
}: {
  rawFeatureText: string
  onRawFeatureTextChange: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <FormControl>
      <FormLabel fontSize="sm">{t('projectControl.rawFeatureText')}</FormLabel>
      <Textarea
        minH="560px"
        fontFamily="mono"
        value={rawFeatureText}
        onChange={(event) => onRawFeatureTextChange(event.target.value)}
        placeholder={t('projectControl.rawFeatureTextPlaceholder')}
      />
      <FormHelperText fontSize="xs">
        {t('projectControl.rawFeatureTextHelp')}
      </FormHelperText>
    </FormControl>
  )
}

export function ImportedTablesDocument({
  state,
}: {
  state: OpenTypeFeaturesState
}) {
  const { t } = useTranslation()

  return (
    <SourceSectionsDocument
      emptyText={t('projectControl.noImportedTables')}
      sourceSectionRecords={deriveOpenTypeSourceSectionRecords(state).filter(
        (group) => group.section.kind === 'compiled-table'
      )}
    />
  )
}

export function LanguageSystemDocument({
  state,
}: {
  state: OpenTypeFeaturesState
}) {
  const { t } = useTranslation()

  if (state.languagesystems.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        {t('projectControl.noLanguageSystems')}
      </Text>
    )
  }

  return (
    <HStack wrap="wrap">
      {state.languagesystems.map((languageSystem) => (
        <Badge key={languageSystem.id} fontFamily="mono">
          {languageSystem.script} {languageSystem.language}
        </Badge>
      ))}
    </HStack>
  )
}

export function GlyphClassDocument({
  glyphClasses,
}: {
  glyphClasses: GlyphClass[]
}) {
  const { t } = useTranslation()

  if (glyphClasses.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        {t('projectControl.noGlyphClasses')}
      </Text>
    )
  }

  return (
    <Stack spacing={2}>
      {glyphClasses.map((glyphClass) => (
        <Stack key={glyphClass.id} spacing={1} borderTopWidth="1px" pt={2}>
          <HStack justify="space-between" align="flex-start" gap={2}>
            <Text fontFamily="mono" fontWeight="900" noOfLines={1}>
              {glyphClass.name}
            </Text>
            <Badge flexShrink={0}>{glyphClass.glyphs.length}</Badge>
          </HStack>
          <Text fontSize="xs" color="field.muted" noOfLines={2}>
            {glyphClass.glyphs.slice(0, 48).join(' ')}
            {glyphClass.glyphs.length > 48 ? ' ...' : ''}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

export function MarkClassDocument({
  markClasses,
}: {
  markClasses: MarkClass[]
}) {
  const { t } = useTranslation()

  if (markClasses.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        {t('projectControl.noMarkClasses')}
      </Text>
    )
  }

  return (
    <Stack spacing={2}>
      {markClasses.map((markClass) => (
        <Stack key={markClass.id} spacing={1} borderTopWidth="1px" pt={2}>
          <HStack justify="space-between" align="flex-start" gap={2}>
            <Text fontFamily="mono" fontWeight="900" noOfLines={1}>
              {markClass.name}
            </Text>
            <Badge flexShrink={0}>{markClass.marks.length}</Badge>
          </HStack>
          <Text fontSize="xs" color="field.muted" noOfLines={2}>
            {markClass.marks
              .slice(0, 48)
              .map((mark) => mark.glyph)
              .join(' ')}
            {markClass.marks.length > 48 ? ' ...' : ''}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

export function GdefDocument({ state }: { state: OpenTypeFeaturesState }) {
  const { t } = useTranslation()
  const sourceSectionRecords = deriveOpenTypeSourceSectionRecords(state).filter(
    (group) => group.section.table === 'GDEF'
  )

  if (!state.gdef && sourceSectionRecords.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        {t('projectControl.noGdefData')}
      </Text>
    )
  }

  return (
    <Stack spacing={4}>
      {state.gdef ? (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          <Metric
            label={t('projectControl.glyphClasses')}
            value={countGdefGlyphClasses(state)}
          />
          <Metric
            label={t('projectControl.markGlyphSets')}
            value={state.gdef.markGlyphSets?.length ?? 0}
          />
          <Metric
            label={t('projectControl.ligatureCarets')}
            value={state.gdef.ligatureCarets?.length ?? 0}
          />
        </SimpleGrid>
      ) : null}
      <SourceSectionsDocument
        emptyText={t('projectControl.noSourceSections')}
        sourceSectionRecords={sourceSectionRecords}
      />
    </Stack>
  )
}

function countGdefGlyphClasses(state: OpenTypeFeaturesState) {
  const glyphClasses = state.gdef?.glyphClasses
  if (!glyphClasses) return 0

  return [
    glyphClasses.base,
    glyphClasses.ligature,
    glyphClasses.mark,
    glyphClasses.component,
  ].filter((items) => items && items.length > 0).length
}
