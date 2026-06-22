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
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react'
import { Plus, Trash } from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  OverviewCustomFilter,
  OverviewCustomFilterMode,
  OverviewCustomFilterRule,
  OverviewCustomFilterRuleField,
  OverviewCustomFilterRuleOperator,
  OverviewCustomFilterSort,
} from 'src/lib/glyph/glyphOverview'

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

const hasValidRuleValue = (rule: OverviewCustomFilterRule) =>
  !operatorNeedsValue(rule.operator) || rule.value.trim().length > 0

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
    <ModalContent>
      <ModalHeader>
        {filter
          ? t('fontOverview.customFilter.editTitle')
          : t('fontOverview.customFilter.createTitle')}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody>
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

          <FormControl maxW="220px">
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

          <FormControl maxW="220px">
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

          <Box>
            <HStack justify="space-between" mb={2}>
              <Text fontWeight="900">
                {t('fontOverview.customFilter.rules')}
              </Text>
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
                  <HStack key={rule.id} align="flex-start" spacing={2}>
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
                          value:
                            event.target.value === 'missing' ? '' : rule.value,
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
                        icon={
                          <Trash width={17} height={17} strokeWidth={2.1} />
                        }
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
                  </HStack>
                )
              })}
            </VStack>
          </Box>
        </VStack>
      </ModalBody>
      <ModalFooter justifyContent="space-between">
        <Box>
          {filter ? (
            <Button colorScheme="red" variant="ghost" onClick={handleDelete}>
              {t('fontOverview.customFilter.deleteFilter')}
            </Button>
          ) : null}
        </Box>
        <HStack>
          <Button variant="ghost" onClick={onClose}>
            {t('fontOverview.cancel')}
          </Button>
          <Button
            colorScheme="yellow"
            isDisabled={!canSave}
            onClick={handleSave}
          >
            {t('fontOverview.customFilter.save')}
          </Button>
        </HStack>
      </ModalFooter>
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
    <Modal isOpen={isOpen} onClose={onClose} size="3xl">
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
