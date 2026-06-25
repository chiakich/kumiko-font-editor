import { Box, Button, HStack, Tabs, Text, Dialog } from '@chakra-ui/react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SlidingTabList,
  SlidingTabsContentGroup,
} from 'src/features/common/SlidingTabList'
import { AdvancedFilterFields } from 'src/features/fontOverview/components/OverviewCustomFilterModal/AdvancedFilterFields'
import { PresetFilterList } from 'src/features/fontOverview/components/OverviewCustomFilterModal/PresetFilterList'
import type {
  OverviewCustomFilterMode,
  OverviewCustomFilterPreset,
} from 'src/lib/glyph/glyphOverview'
import type {
  OverviewCustomFilterDraft,
  RuleConditionUpdater,
} from 'src/features/fontOverview/components/OverviewCustomFilterModal/filterModel'

export function CustomFilterModalHeader({
  activeTabIndex,
  isEditing,
}: {
  activeTabIndex: number
  isEditing: boolean
}) {
  const { t } = useTranslation()
  const title =
    activeTabIndex === 0 || !isEditing
      ? t('fontOverview.customFilter.createTitle')
      : t('fontOverview.customFilter.editTitle')

  return (
    <HStack
      align="center"
      gap={4}
      justify="space-between"
      pb={3}
      pt={5}
      px={6}
      pr={14}
    >
      <Text as="h2" flexShrink={0} fontSize="xl" fontWeight="900">
        {title}
      </Text>
      <Box minW={0}>
        <SlidingTabList
          activeIndex={activeTabIndex}
          labels={[
            t('fontOverview.customFilter.presetTab'),
            t('fontOverview.customFilter.advancedTab'),
          ]}
          layoutGroupId="overview-custom-filter-modal-tabs"
        />
      </Box>
    </HStack>
  )
}

export function CustomFilterModalBody({
  addGroup,
  addRule,
  deleteRule,
  draft,
  presetScrollRef,
  presets,
  setDraft,
  updateGroupMode,
  updatePresetScrollMask,
  updateRule,
  onCreatePreset,
}: {
  addGroup: (groupId: string | null) => void
  addRule: (groupId: string | null) => void
  deleteRule: (ruleId: string) => void
  draft: OverviewCustomFilterDraft
  presetScrollRef: RefObject<HTMLDivElement | null>
  presets: OverviewCustomFilterPreset[]
  setDraft: Dispatch<SetStateAction<OverviewCustomFilterDraft>>
  updateGroupMode: (groupId: string, mode: OverviewCustomFilterMode) => void
  updatePresetScrollMask: () => void
  updateRule: RuleConditionUpdater
  onCreatePreset: (preset: OverviewCustomFilterPreset) => void
}) {
  return (
    <Dialog.Body flex={1} minH={0} pb={5}>
      <SlidingTabsContentGroup h="100%" mt={0}>
        <PresetFilterPanel
          presetScrollRef={presetScrollRef}
          presets={presets}
          updatePresetScrollMask={updatePresetScrollMask}
          onCreatePreset={onCreatePreset}
        />
        <Tabs.Content value="1" h="100%" overflow="auto" p={0} pr={1}>
          <AdvancedFilterFields
            addGroup={addGroup}
            addRule={addRule}
            deleteRule={deleteRule}
            draft={draft}
            setDraft={setDraft}
            updateGroupMode={updateGroupMode}
            updateRule={updateRule}
          />
        </Tabs.Content>
      </SlidingTabsContentGroup>
    </Dialog.Body>
  )
}

function PresetFilterPanel({
  presetScrollRef,
  presets,
  updatePresetScrollMask,
  onCreatePreset,
}: {
  presetScrollRef: RefObject<HTMLDivElement | null>
  presets: OverviewCustomFilterPreset[]
  updatePresetScrollMask: () => void
  onCreatePreset: (preset: OverviewCustomFilterPreset) => void
}) {
  return (
    <Tabs.Content value="0" h="100%" p={0} position="relative">
      <Box
        ref={presetScrollRef}
        h="100%"
        overflow="auto"
        pb={8}
        pr={1}
        onScroll={updatePresetScrollMask}
        css={{
          maskImage:
            'var(--preset-scroll-mask, linear-gradient(to bottom, black, black))',

          WebkitMaskImage:
            'var(--preset-scroll-mask, linear-gradient(to bottom, black, black))',
        }}
      >
        <PresetFilterList presets={presets} onCreatePreset={onCreatePreset} />
      </Box>
    </Tabs.Content>
  )
}

export function CustomFilterModalFooter({
  canDelete,
  canSave,
  onCancel,
  onDelete,
  onSave,
}: {
  canDelete: boolean
  canSave: boolean
  onCancel: () => void
  onDelete: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog.Footer justifyContent="space-between" gap={3}>
      <Box>
        {canDelete ? (
          <Button colorPalette="red" variant="ghost" onClick={onDelete}>
            {t('fontOverview.customFilter.deleteFilter')}
          </Button>
        ) : null}
      </Box>
      <HStack gap={3}>
        <Button variant="ghost" onClick={onCancel}>
          {t('fontOverview.cancel')}
        </Button>
        <Button disabled={!canSave} onClick={onSave}>
          {t('fontOverview.customFilter.save')}
        </Button>
      </HStack>
    </Dialog.Footer>
  )
}
