import { Dialog, Portal } from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CustomFilterModalBody,
  CustomFilterModalFooter,
  CustomFilterModalHeader,
} from 'src/features/fontOverview/components/OverviewCustomFilterModal/CustomFilterModalFrame'
import { SlidingTabsRoot } from 'src/features/common/SlidingTabList'
import {
  addRuleTreeChild,
  createDefaultRule,
  createDefaultRuleGroup,
  createFilterDraft,
  createFilterDraftFromPreset,
  deleteRuleTreeNode,
  hasValidRuleValue,
  isRuleGroup,
  normalizeRuleForField,
  prepareRuleForSave,
  updateRuleTree,
  type OverviewCustomFilterDraft,
} from 'src/features/fontOverview/components/OverviewCustomFilterModal/filterModel'
import { usePresetScrollMask } from 'src/features/fontOverview/components/OverviewCustomFilterModal/usePresetScrollMask'
import {
  createOverviewCustomFilterPresets,
  type OverviewCustomFilter,
  type OverviewCustomFilterMode,
  type OverviewCustomFilterPreset,
  type OverviewCustomFilterRuleCondition,
} from 'src/lib/glyph/glyphOverview'

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
  const presets = useMemo(() => createOverviewCustomFilterPresets(), [])
  const { presetScrollRef, updatePresetScrollMask } = usePresetScrollMask(
    activeTabIndex,
    presets.length
  )

  const canSave =
    draft.name.trim().length > 0 &&
    draft.rules.length > 0 &&
    draft.rules.every(hasValidRuleValue)

  const updateRule = (
    ruleId: string,
    patch: Partial<OverviewCustomFilterRuleCondition>
  ) => {
    setDraft((current) => ({
      ...current,
      rules: updateRuleTree(current.rules, ruleId, (rule) => {
        if (isRuleGroup(rule)) {
          return rule
        }
        const nextRule = { ...rule, ...patch }
        return patch.field
          ? normalizeRuleForField(nextRule, patch.field)
          : nextRule
      }),
    }))
  }

  const updateGroupMode = (groupId: string, mode: OverviewCustomFilterMode) => {
    setDraft((current) => ({
      ...current,
      rules: updateRuleTree(current.rules, groupId, (rule) =>
        isRuleGroup(rule) ? { ...rule, mode } : rule
      ),
    }))
  }

  const addRule = (groupId: string | null) => {
    setDraft((current) => ({
      ...current,
      rules: addRuleTreeChild(current.rules, groupId, createDefaultRule()),
    }))
  }

  const addGroup = (groupId: string | null) => {
    setDraft((current) => ({
      ...current,
      rules: addRuleTreeChild(current.rules, groupId, createDefaultRuleGroup()),
    }))
  }

  const deleteRule = (ruleId: string) => {
    setDraft((current) => ({
      ...current,
      rules: deleteRuleTreeNode(current.rules, ruleId),
    }))
  }

  const handleCreatePreset = (preset: OverviewCustomFilterPreset) => {
    onCreateFilter(createFilterDraftFromPreset(preset, t(preset.labelKey)))
    onClose()
  }

  const handleSave = () => {
    if (!canSave) {
      return
    }

    const nextFilter = {
      mode: draft.mode,
      name: draft.name.trim(),
      rules: draft.rules.map(prepareRuleForSave),
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
    <Dialog.Positioner>
      <Dialog.Content
        borderRadius="sm"
        h={{ base: 'calc(100vh - 32px)', md: '720px' }}
      >
        <DialogCloseButton zIndex={2} />
        <SlidingTabsRoot
          display="flex"
          flex={1}
          flexDirection="column"
          value={String(activeTabIndex)}
          minH={0}
          size="sm"
          onValueChange={(details) => setActiveTabIndex(Number(details.value))}
        >
          <CustomFilterModalHeader
            activeTabIndex={activeTabIndex}
            isEditing={Boolean(filter)}
          />
          <CustomFilterModalBody
            addGroup={addGroup}
            addRule={addRule}
            deleteRule={deleteRule}
            draft={draft}
            presetScrollRef={presetScrollRef}
            presets={presets}
            setDraft={setDraft}
            updateGroupMode={updateGroupMode}
            updatePresetScrollMask={updatePresetScrollMask}
            updateRule={updateRule}
            onCreatePreset={handleCreatePreset}
          />
          {activeTabIndex === 1 ? (
            <CustomFilterModalFooter
              canDelete={Boolean(filter)}
              canSave={canSave}
              onCancel={onClose}
              onDelete={handleDelete}
              onSave={handleSave}
            />
          ) : null}
        </SlidingTabsRoot>
      </Dialog.Content>
    </Dialog.Positioner>
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
    <Dialog.Root
      placement="center"
      open={isOpen}
      scrollBehavior="inside"
      size="xl"
      onOpenChange={(e) => {
        if (!e.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
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
      </Portal>
    </Dialog.Root>
  )
}
