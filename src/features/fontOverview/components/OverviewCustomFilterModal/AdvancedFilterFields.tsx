import {
  Box,
  Button,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  VStack,
  Field,
} from '@chakra-ui/react'
import { Plus } from 'iconoir-react'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { RuleTreeEditor } from 'src/features/fontOverview/components/OverviewCustomFilterModal/RuleTreeEditor'
import type {
  OverviewCustomFilterMode,
  OverviewCustomFilterRule,
  OverviewCustomFilterSort,
} from 'src/lib/glyph/glyphOverview'
import type {
  OverviewCustomFilterDraft,
  RuleConditionUpdater,
} from 'src/features/fontOverview/components/OverviewCustomFilterModal/filterModel'

interface AdvancedFilterFieldsProps {
  addGroup: (groupId: string | null) => void
  addRule: (groupId: string | null) => void
  deleteRule: (ruleId: string) => void
  draft: OverviewCustomFilterDraft
  setDraft: Dispatch<SetStateAction<OverviewCustomFilterDraft>>
  updateGroupMode: (groupId: string, mode: OverviewCustomFilterMode) => void
  updateRule: RuleConditionUpdater
}

export function AdvancedFilterFields({
  addGroup,
  addRule,
  deleteRule,
  draft,
  setDraft,
  updateGroupMode,
  updateRule,
}: AdvancedFilterFieldsProps) {
  return (
    <VStack align="stretch" gap={4}>
      <FilterBasicFields draft={draft} setDraft={setDraft} />
      <FilterRulesPanel
        addGroup={addGroup}
        addRule={addRule}
        deleteRule={deleteRule}
        rules={draft.rules}
        updateGroupMode={updateGroupMode}
        updateRule={updateRule}
      />
    </VStack>
  )
}

function FilterBasicFields({
  draft,
  setDraft,
}: {
  draft: OverviewCustomFilterDraft
  setDraft: Dispatch<SetStateAction<OverviewCustomFilterDraft>>
}) {
  const { t } = useTranslation()

  return (
    <>
      <Field.Root>
        <Field.Label>{t('fontOverview.customFilter.name')}</Field.Label>
        <Input
          placeholder={t('fontOverview.customFilter.namePlaceholder')}
          value={draft.name}
          onChange={(event) =>
            setDraft((current) => ({ ...current, name: event.target.value }))
          }
        />
      </Field.Root>
      <Stack direction={{ base: 'column', md: 'row' }} gap={3}>
        <FilterModeSelect draft={draft} setDraft={setDraft} />
        <FilterSortSelect draft={draft} setDraft={setDraft} />
      </Stack>
    </>
  )
}

function FilterModeSelect({
  draft,
  setDraft,
}: {
  draft: OverviewCustomFilterDraft
  setDraft: Dispatch<SetStateAction<OverviewCustomFilterDraft>>
}) {
  const { t } = useTranslation()

  return (
    <Field.Root>
      <Field.Label>{t('fontOverview.customFilter.matchMode')}</Field.Label>
      <NativeSelect.Root>
        <NativeSelect.Field
          value={draft.mode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              mode: event.target.value as OverviewCustomFilterMode,
            }))
          }
        >
          <option value="all">{t('fontOverview.customFilter.matchAll')}</option>
          <option value="any">{t('fontOverview.customFilter.matchAny')}</option>
          <option value="none">
            {t('fontOverview.customFilter.matchNone')}
          </option>
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>
  )
}

function FilterSortSelect({
  draft,
  setDraft,
}: {
  draft: OverviewCustomFilterDraft
  setDraft: Dispatch<SetStateAction<OverviewCustomFilterDraft>>
}) {
  const { t } = useTranslation()

  return (
    <Field.Root>
      <Field.Label>{t('fontOverview.customFilter.sort')}</Field.Label>
      <NativeSelect.Root>
        <NativeSelect.Field
          value={draft.sort ?? 'codePoint'}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sort: event.target.value as OverviewCustomFilterSort,
            }))
          }
        >
          <option value="codePoint">
            {t('fontOverview.customFilter.sortCodePoint')}
          </option>
          <option value="recentEdit">
            {t('fontOverview.customFilter.sortRecentEdit')}
          </option>
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>
  )
}

function FilterRulesPanel({
  addGroup,
  addRule,
  deleteRule,
  rules,
  updateGroupMode,
  updateRule,
}: {
  addGroup: (groupId: string | null) => void
  addRule: (groupId: string | null) => void
  deleteRule: (ruleId: string) => void
  rules: OverviewCustomFilterRule[]
  updateGroupMode: (groupId: string, mode: OverviewCustomFilterMode) => void
  updateRule: RuleConditionUpdater
}) {
  const { t } = useTranslation()

  return (
    <Box border="2px solid" borderColor="haze" borderRadius="2px" p={3}>
      <HStack justify="space-between" mb={2}>
        <Text fontWeight="900">{t('fontOverview.customFilter.rules')}</Text>
        <HStack gap={2}>
          <Button size="sm" onClick={() => addRule(null)}>
            <Plus width={16} height={16} strokeWidth={2.2} />
            {t('fontOverview.customFilter.addRule')}
          </Button>
          <Button size="sm" onClick={() => addGroup(null)}>
            {t('fontOverview.customFilter.addGroup')}
          </Button>
        </HStack>
      </HStack>
      <RuleTreeEditor
        addGroup={addGroup}
        addRule={addRule}
        canDeleteRule={rules.length > 1}
        deleteRule={deleteRule}
        rules={rules}
        updateGroupMode={updateGroupMode}
        updateRule={updateRule}
      />
    </Box>
  )
}
