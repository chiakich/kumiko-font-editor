import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react'
import { Plus, Trash } from 'iconoir-react'
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidingTabList } from 'src/features/common/SlidingTabList'
import type {
  OverviewCustomFilter,
  OverviewCustomFilterMode,
  OverviewCustomFilterPreset,
  OverviewCustomFilterRule,
  OverviewCustomFilterRuleField,
  OverviewCustomFilterRuleOperator,
  OverviewCustomFilterSort,
} from 'src/lib/glyph/glyphOverview'
import { createOverviewCustomFilterPresets } from 'src/lib/glyph/glyphOverview'

type OverviewCustomFilterDraft = Omit<
  OverviewCustomFilter,
  'id' | 'labelKey' | 'source'
>

interface OverviewCustomFilterModalProps {
  filter: OverviewCustomFilter | null
  isOpen: boolean
  onClose: () => void
  onCreateFilter: (filter: OverviewCustomFilterDraft) => string
  onDeleteFilter: (filterId: string) => void
  onUpdateFilter: (filter: OverviewCustomFilter) => void
}

interface OverviewCustomFilterModalFormProps extends Omit<
  OverviewCustomFilterModalProps,
  'isOpen'
> {
  initialDraft: OverviewCustomFilterDraft
}

const TEXT_OPERATORS: OverviewCustomFilterRuleOperator[] = [
  'contains',
  'doesNotContain',
  'is',
  'isNot',
  'exists',
  'missing',
]

const BOOLEAN_OPERATORS: OverviewCustomFilterRuleOperator[] = ['is', 'isNot']

const BOOLEAN_FIELDS = new Set<OverviewCustomFilterRuleField>([
  'export',
  'empty',
  'edited',
  'hasUnicode',
  'hasComponents',
  'hasAnchors',
  'hasHints',
  'hasMetricsKeys',
  'hasColorLabel',
])

const RULE_FIELDS: OverviewCustomFilterRuleField[] = [
  'glyphName',
  'unicode',
  'note',
  'category',
  'subCategory',
  'component',
  'export',
  'empty',
  'edited',
  'hasUnicode',
  'hasComponents',
  'hasAnchors',
  'hasHints',
  'hasMetricsKeys',
  'hasColorLabel',
]

const createRuleId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createDefaultRule = (): OverviewCustomFilterRule => ({
  field: 'glyphName',
  id: createRuleId(),
  operator: 'contains',
  value: '',
})

const createDefaultFilterDraft = (): OverviewCustomFilterDraft => ({
  mode: 'all',
  name: '',
  rules: [createDefaultRule()],
  sort: 'codePoint',
})

const isBooleanField = (field: OverviewCustomFilterRuleField) =>
  BOOLEAN_FIELDS.has(field)

const operatorNeedsValue = (operator: OverviewCustomFilterRuleOperator) =>
  operator !== 'exists' && operator !== 'missing'

const getOperatorsForField = (field: OverviewCustomFilterRuleField) =>
  isBooleanField(field) ? BOOLEAN_OPERATORS : TEXT_OPERATORS

const normalizeRuleForField = (
  rule: OverviewCustomFilterRule,
  field: OverviewCustomFilterRuleField
): OverviewCustomFilterRule => {
  if (!isBooleanField(field)) {
    return { ...rule, field }
  }

  return {
    ...rule,
    field,
    operator: BOOLEAN_OPERATORS.includes(rule.operator) ? rule.operator : 'is',
    value: rule.value === 'false' ? 'false' : 'true',
  }
}

const normalizeDraftRule = (rule: OverviewCustomFilterRule) =>
  normalizeRuleForField(rule, rule.field)

const createFilterDraft = (
  filter: OverviewCustomFilter | null,
  translatedFilterName?: string
): OverviewCustomFilterDraft =>
  filter
    ? {
        mode: filter.mode,
        name: translatedFilterName ?? filter.name,
        rules: filter.rules.length
          ? filter.rules.map(normalizeDraftRule)
          : [createDefaultRule()],
        sort: filter.sort ?? 'codePoint',
      }
    : createDefaultFilterDraft()

const createFilterDraftFromPreset = (
  preset: OverviewCustomFilterPreset,
  translatedFilterName: string
): OverviewCustomFilterDraft => ({
  mode: preset.filter.mode,
  name: translatedFilterName,
  rules: preset.filter.rules.map((rule) => ({
    ...normalizeDraftRule(rule),
    id: createRuleId(),
  })),
  sort: preset.filter.sort ?? 'codePoint',
})

const hasValidRuleValue = (rule: OverviewCustomFilterRule) =>
  !operatorNeedsValue(rule.operator) || rule.value.trim().length > 0

const getRuleSummary = (
  rule: OverviewCustomFilterRule,
  t: ReturnType<typeof useTranslation>['t']
) => {
  const field = t(`fontOverview.customFilter.fields.${rule.field}`)
  const operator = t(`fontOverview.customFilter.operators.${rule.operator}`)
  if (!operatorNeedsValue(rule.operator)) {
    return `${field} ${operator}`
  }
  return `${field} ${operator} ${rule.value}`
}

const getPresetSummary = (
  preset: OverviewCustomFilterPreset,
  t: ReturnType<typeof useTranslation>['t']
) => {
  const rules = preset.filter.rules.map((rule) => getRuleSummary(rule, t))
  const sort = t(
    preset.filter.sort === 'recentEdit'
      ? 'fontOverview.customFilter.sortRecentEdit'
      : 'fontOverview.customFilter.sortCodePoint'
  )
  return [...rules, sort].join(' / ')
}

interface PresetFilterListProps {
  activePresetId: string | null
  onApplyPreset: (preset: OverviewCustomFilterPreset) => void
  presets: OverviewCustomFilterPreset[]
}

function PresetFilterList({
  activePresetId,
  onApplyPreset,
  presets,
}: PresetFilterListProps) {
  const { t } = useTranslation()

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
      {presets.map((preset) => {
        const isActive = activePresetId === preset.id
        const selectedBg = 'field.ink'
        const selectedColor = 'field.yellow.300'
        const mutedColor = isActive ? 'field.panelMuted' : 'field.muted'

        return (
          <Button
            key={preset.id}
            alignItems="center"
            bg={isActive ? selectedBg : 'white'}
            borderColor={isActive ? 'field.ink' : 'field.haze'}
            borderRadius="sm"
            borderWidth={2}
            color={isActive ? selectedColor : 'field.ink'}
            h="auto"
            justifyContent="center"
            minH="116px"
            p={3}
            position="relative"
            textAlign="center"
            variant="outline"
            whiteSpace="normal"
            _active={{
              bg: isActive ? selectedBg : 'field.panel',
              color: isActive ? selectedColor : 'field.ink',
            }}
            _focusVisible={{
              boxShadow: '0 0 0 2px var(--chakra-colors-field-ink)',
            }}
            _hover={{
              bg: isActive ? selectedBg : 'field.panel',
              borderColor: 'field.ink',
              color: isActive ? selectedColor : 'field.ink',
            }}
            onClick={() => onApplyPreset(preset)}
          >
            <VStack align="center" spacing={2} w="100%">
              <Text fontSize="sm" fontWeight="900" lineHeight="1.2">
                {t(preset.labelKey)}
              </Text>
              <Text
                color={mutedColor}
                fontFamily="mono"
                fontSize="xs"
                fontWeight="normal"
                lineHeight="1.35"
                noOfLines={3}
              >
                {getPresetSummary(preset, t)}
              </Text>
            </VStack>
          </Button>
        )
      })}
    </SimpleGrid>
  )
}

interface AdvancedFilterFieldsProps {
  draft: OverviewCustomFilterDraft
  setDraft: Dispatch<SetStateAction<OverviewCustomFilterDraft>>
  updateRule: (ruleId: string, patch: Partial<OverviewCustomFilterRule>) => void
}

function AdvancedFilterFields({
  draft,
  setDraft,
  updateRule,
}: AdvancedFilterFieldsProps) {
  const { t } = useTranslation()

  return (
    <VStack align="stretch" spacing={4}>
      <FormControl>
        <FormLabel>{t('fontOverview.customFilter.name')}</FormLabel>
        <Input
          value={draft.name}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          placeholder={t('fontOverview.customFilter.namePlaceholder')}
        />
      </FormControl>

      <Stack direction={{ base: 'column', md: 'row' }} spacing={3}>
        <FormControl>
          <FormLabel>{t('fontOverview.customFilter.matchMode')}</FormLabel>
          <Select
            value={draft.mode}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                mode: event.target.value as OverviewCustomFilterMode,
              }))
            }
          >
            <option value="all">
              {t('fontOverview.customFilter.matchAll')}
            </option>
            <option value="any">
              {t('fontOverview.customFilter.matchAny')}
            </option>
          </Select>
        </FormControl>

        <FormControl>
          <FormLabel>{t('fontOverview.customFilter.sort')}</FormLabel>
          <Select
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
          </Select>
        </FormControl>
      </Stack>

      <Box border="2px solid" borderColor="field.haze" borderRadius="2px" p={3}>
        <HStack justify="space-between" mb={2}>
          <Text fontWeight="900">{t('fontOverview.customFilter.rules')}</Text>
          <Button
            size="sm"
            leftIcon={<Plus width={16} height={16} strokeWidth={2.2} />}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                rules: [...current.rules, createDefaultRule()],
              }))
            }
          >
            {t('fontOverview.customFilter.addRule')}
          </Button>
        </HStack>

        <VStack align="stretch" spacing={2}>
          {draft.rules.map((rule) => {
            const operators = getOperatorsForField(rule.field)
            const needsValue = operatorNeedsValue(rule.operator)
            const booleanField = isBooleanField(rule.field)

            return (
              <Stack
                key={rule.id}
                align={{ base: 'stretch', md: 'flex-start' }}
                direction={{ base: 'column', md: 'row' }}
                spacing={2}
              >
                <Select
                  flex="1"
                  value={rule.field}
                  onChange={(event) =>
                    updateRule(rule.id, {
                      field: event.target
                        .value as OverviewCustomFilterRuleField,
                    })
                  }
                >
                  {RULE_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {t(`fontOverview.customFilter.fields.${field}`)}
                    </option>
                  ))}
                </Select>

                <Select
                  flex="1"
                  value={rule.operator}
                  onChange={(event) =>
                    updateRule(rule.id, {
                      operator: event.target
                        .value as OverviewCustomFilterRuleOperator,
                      value: event.target.value === 'missing' ? '' : rule.value,
                    })
                  }
                >
                  {operators.map((operator) => (
                    <option key={operator} value={operator}>
                      {t(`fontOverview.customFilter.operators.${operator}`)}
                    </option>
                  ))}
                </Select>

                {needsValue ? (
                  booleanField ? (
                    <Select
                      flex="1"
                      value={rule.value === 'false' ? 'false' : 'true'}
                      onChange={(event) =>
                        updateRule(rule.id, { value: event.target.value })
                      }
                    >
                      <option value="true">
                        {t('fontOverview.customFilter.booleanTrue')}
                      </option>
                      <option value="false">
                        {t('fontOverview.customFilter.booleanFalse')}
                      </option>
                    </Select>
                  ) : (
                    <Input
                      flex="1"
                      value={rule.value}
                      onChange={(event) =>
                        updateRule(rule.id, { value: event.target.value })
                      }
                      placeholder={t('fontOverview.customFilter.value')}
                    />
                  )
                ) : (
                  <Box flex="1" />
                )}

                <Tooltip label={t('fontOverview.customFilter.deleteRule')}>
                  <IconButton
                    aria-label={t('fontOverview.customFilter.deleteRule')}
                    alignSelf={{ base: 'flex-end', md: 'auto' }}
                    icon={<Trash width={17} height={17} strokeWidth={2.1} />}
                    isDisabled={draft.rules.length <= 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        rules: current.rules.filter(
                          (currentRule) => currentRule.id !== rule.id
                        ),
                      }))
                    }
                  />
                </Tooltip>
              </Stack>
            )
          })}
        </VStack>
      </Box>
    </VStack>
  )
}

function OverviewCustomFilterModalForm({
  filter,
  initialDraft,
  onClose,
  onCreateFilter,
  onDeleteFilter,
  onUpdateFilter,
}: OverviewCustomFilterModalFormProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<OverviewCustomFilterDraft>(initialDraft)
  const [activeTabIndex, setActiveTabIndex] = useState(filter ? 1 : 0)
  const [activePresetId, setActivePresetId] = useState<string | null>(
    filter?.id.startsWith('seeded:') ? filter.id.replace('seeded:', '') : null
  )
  const presets = useMemo(() => createOverviewCustomFilterPresets(), [])

  const canSave = useMemo(
    () =>
      draft.name.trim().length > 0 &&
      draft.rules.length > 0 &&
      draft.rules.every(hasValidRuleValue),
    [draft.name, draft.rules]
  )

  const updateRule = (
    ruleId: string,
    patch: Partial<OverviewCustomFilterRule>
  ) => {
    setActivePresetId(null)
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => {
        if (rule.id !== ruleId) {
          return rule
        }
        const nextRule = { ...rule, ...patch }
        return patch.field
          ? normalizeRuleForField(nextRule, patch.field)
          : nextRule
      }),
    }))
  }

  const setAdvancedDraft: Dispatch<
    SetStateAction<OverviewCustomFilterDraft>
  > = (nextDraft) => {
    setActivePresetId(null)
    setDraft(nextDraft)
  }

  const handleApplyPreset = (preset: OverviewCustomFilterPreset) => {
    setActivePresetId(preset.id)
    setDraft(createFilterDraftFromPreset(preset, t(preset.labelKey)))
  }

  const handleSave = () => {
    if (!canSave) {
      return
    }

    const nextFilter = {
      mode: draft.mode,
      name: draft.name.trim(),
      rules: draft.rules.map((rule) => ({
        ...rule,
        value: operatorNeedsValue(rule.operator) ? rule.value.trim() : '',
      })),
      sort: draft.sort ?? 'codePoint',
    }

    if (filter) {
      onUpdateFilter({ ...nextFilter, id: filter.id, source: 'user' })
    } else {
      onCreateFilter(nextFilter)
    }
    onClose()
  }

  const handleDelete = () => {
    if (!filter) {
      return
    }
    onDeleteFilter(filter.id)
    onClose()
  }

  return (
    <ModalContent
      borderRadius="sm"
      h={{ base: 'calc(100vh - 32px)', md: '720px' }}
    >
      <ModalCloseButton zIndex={2} />
      <Tabs
        display="flex"
        flex={1}
        flexDirection="column"
        index={activeTabIndex}
        minH={0}
        size="sm"
        onChange={setActiveTabIndex}
        variant="enclosed"
      >
        <HStack
          align="center"
          gap={4}
          justify="space-between"
          pb={3}
          pr={14}
          pt={5}
          px={6}
        >
          <Text as="h2" fontSize="xl" fontWeight="900">
            {filter
              ? t('fontOverview.customFilter.editTitle')
              : t('fontOverview.customFilter.createTitle')}
          </Text>
          <SlidingTabList
            activeIndex={activeTabIndex}
            labels={[
              t('fontOverview.customFilter.presetTab'),
              t('fontOverview.customFilter.advancedTab'),
            ]}
            layoutGroupId="overview-custom-filter-modal-tabs"
          />
        </HStack>
        <ModalBody flex={1} minH={0} pb={5}>
          <TabPanels h="100%">
            <TabPanel h="100%" overflow="auto" p={0} pr={1}>
              <PresetFilterList
                activePresetId={activePresetId}
                presets={presets}
                onApplyPreset={handleApplyPreset}
              />
            </TabPanel>
            <TabPanel h="100%" overflow="auto" p={0} pr={1}>
              <AdvancedFilterFields
                draft={draft}
                setDraft={setAdvancedDraft}
                updateRule={updateRule}
              />
            </TabPanel>
          </TabPanels>
        </ModalBody>
        <ModalFooter justifyContent="space-between" gap={3}>
          <Box>
            {filter ? (
              <Button colorScheme="red" variant="ghost" onClick={handleDelete}>
                {t('fontOverview.customFilter.deleteFilter')}
              </Button>
            ) : null}
          </Box>
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose}>
              {t('fontOverview.cancel')}
            </Button>
            <Button isDisabled={!canSave} onClick={handleSave}>
              {t('fontOverview.customFilter.save')}
            </Button>
          </HStack>
        </ModalFooter>
      </Tabs>
    </ModalContent>
  )
}

export function OverviewCustomFilterModal({
  filter,
  isOpen,
  onClose,
  onCreateFilter,
  onDeleteFilter,
  onUpdateFilter,
}: OverviewCustomFilterModalProps) {
  const { t } = useTranslation()
  const initialDraft = useMemo(
    () =>
      createFilterDraft(
        filter,
        filter?.labelKey ? t(filter.labelKey) : undefined
      ),
    [filter, t]
  )
  const contentKey = filter?.id ?? 'new'

  return (
    <Modal
      isCentered
      isOpen={isOpen}
      onClose={onClose}
      scrollBehavior="inside"
      size="4xl"
    >
      <ModalOverlay />
      {isOpen ? (
        <OverviewCustomFilterModalForm
          key={contentKey}
          filter={filter}
          initialDraft={initialDraft}
          onClose={onClose}
          onCreateFilter={onCreateFilter}
          onDeleteFilter={onDeleteFilter}
          onUpdateFilter={onUpdateFilter}
        />
      ) : null}
    </Modal>
  )
}
