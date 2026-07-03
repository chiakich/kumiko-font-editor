import {
  Box,
  Flex,
  IconButton,
  Input,
  InputGroup,
  Menu,
  Portal,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { NavArrowDown, Search, Xmark } from 'iconoir-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OverviewSearchField } from 'src/lib/glyph/glyphOverview'
import type { OverviewSearchOptionsState } from 'src/store'

type SearchFieldGroupId = 'glyphName' | 'unicode' | 'note' | 'component' | 'ids'

const SEARCH_QUERY_DEBOUNCE_MS = 250

const SEARCH_FIELD_GROUPS: Array<{
  fields: OverviewSearchField[]
  id: SearchFieldGroupId
  labelKey: string
}> = [
  {
    fields: ['glyphName'],
    id: 'glyphName',
    labelKey: 'fontOverview.searchFields.glyphName',
  },
  {
    fields: ['unicodeValue', 'unicodeCharacter'],
    id: 'unicode',
    labelKey: 'fontOverview.searchFields.unicode',
  },
  {
    fields: ['note'],
    id: 'note',
    labelKey: 'fontOverview.searchFields.note',
  },
  {
    fields: ['component'],
    id: 'component',
    labelKey: 'fontOverview.searchFields.component',
  },
  {
    fields: ['ids'],
    id: 'ids',
    labelKey: 'fontOverview.searchFields.ids',
  },
]

const getSelectedSearchFieldGroups = (
  fields: OverviewSearchField[]
): SearchFieldGroupId[] => {
  const fieldSet = new Set(fields)
  return SEARCH_FIELD_GROUPS.filter((group) =>
    group.fields.every((field) => fieldSet.has(field))
  ).map((group) => group.id)
}

const searchFieldGroupsToFields = (
  groupIds: SearchFieldGroupId[]
): OverviewSearchField[] => {
  const groupIdSet = new Set(groupIds)
  return SEARCH_FIELD_GROUPS.flatMap((group) =>
    groupIdSet.has(group.id) ? group.fields : []
  )
}

interface OverviewSearchInputProps {
  currentSearchQuery: string
  overviewSearchOptions: OverviewSearchOptionsState
  onSearchOptionsChange: (options: Partial<OverviewSearchOptionsState>) => void
  onSearchQueryChange: (value: string) => void
}

export function OverviewSearchInput({
  currentSearchQuery,
  overviewSearchOptions,
  onSearchOptionsChange,
  onSearchQueryChange,
}: OverviewSearchInputProps) {
  const { t } = useTranslation()
  const portalContainerRef = useRef<HTMLDivElement | null>(null)
  const [localSearchQuery, setLocalSearchQuery] = useState<string | null>(null)
  const displayedSearchQuery = localSearchQuery ?? currentSearchQuery
  const selectedFieldGroups = getSelectedSearchFieldGroups(
    overviewSearchOptions.fields
  )

  useEffect(() => {
    if (localSearchQuery === null || localSearchQuery === currentSearchQuery) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      onSearchQueryChange(localSearchQuery)
      setLocalSearchQuery(null)
    }, SEARCH_QUERY_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [currentSearchQuery, localSearchQuery, onSearchQueryChange])

  const handleClearSearch = () => {
    setLocalSearchQuery(null)
    onSearchQueryChange('')
  }

  const handleSearchFieldChange = (
    groupId: SearchFieldGroupId,
    checked: boolean
  ) => {
    const groupSet = new Set(selectedFieldGroups)
    if (checked) {
      groupSet.add(groupId)
    } else {
      groupSet.delete(groupId)
    }
    const nextGroups = Array.from(groupSet)
    if (!nextGroups.length) {
      return
    }
    onSearchOptionsChange({
      fields: searchFieldGroupsToFields(nextGroups),
    })
  }

  return (
    <Box position="relative" zIndex={2}>
      <Box
        ref={portalContainerRef}
        left={0}
        pointerEvents="none"
        position="absolute"
        right={0}
        top="calc(100% + 8px)"
        zIndex={3}
      />
      <Box
        left={3}
        position="absolute"
        top="50%"
        transform="translateY(-50%)"
        zIndex={1}
      >
        <Menu.Root
          closeOnSelect={false}
          positioning={{
            placement: 'bottom-start',
            gutter: 8,
          }}
        >
          <Tooltip content={t('fontOverview.searchOptions')}>
            <Menu.Trigger asChild>
              <IconButton
                aria-label={t('fontOverview.searchOptions')}
                size="sm"
                variant="ghost"
                px={1}
                minW={8}
                _active={{ bg: 'transparent' }}
                _expanded={{ bg: 'transparent' }}
                _hover={{ bg: 'transparent' }}
              >
                <Flex alignItems="center" h="22px" w="26px" position="relative">
                  <Search />
                  <Box bottom={0} position="absolute" right="-7px">
                    <NavArrowDown width={3} height={3} strokeWidth={2} />
                  </Box>
                </Flex>
              </IconButton>
            </Menu.Trigger>
          </Tooltip>
          <Portal container={portalContainerRef}>
            <Menu.Positioner zIndex={4}>
              <Menu.Content w="248px" maxW="calc(100vw - 32px)">
                <Menu.ItemGroup>
                  <Menu.ItemGroupLabel>
                    {t('fontOverview.searchFieldsTitle')}
                  </Menu.ItemGroupLabel>
                  {SEARCH_FIELD_GROUPS.map((group) => (
                    <Menu.CheckboxItem
                      key={group.id}
                      value={group.id}
                      checked={selectedFieldGroups.includes(group.id)}
                      onCheckedChange={(checked) =>
                        handleSearchFieldChange(group.id, checked)
                      }
                    >
                      <Menu.ItemIndicator />
                      <Menu.ItemText>{t(group.labelKey)}</Menu.ItemText>
                    </Menu.CheckboxItem>
                  ))}
                </Menu.ItemGroup>
                <Menu.Separator />
                <Menu.ItemGroup>
                  <Menu.ItemGroupLabel>
                    {t('fontOverview.searchOptionsTitle')}
                  </Menu.ItemGroupLabel>
                  <Menu.CheckboxItem
                    value="matchCase"
                    checked={overviewSearchOptions.matchCase}
                    onCheckedChange={(checked) =>
                      onSearchOptionsChange({
                        matchCase: checked,
                      })
                    }
                  >
                    <Menu.ItemIndicator />
                    <Menu.ItemText>{t('fontOverview.matchCase')}</Menu.ItemText>
                  </Menu.CheckboxItem>
                  <Menu.CheckboxItem
                    value="regex"
                    checked={overviewSearchOptions.regex}
                    onCheckedChange={(checked) =>
                      onSearchOptionsChange({
                        regex: checked,
                      })
                    }
                  >
                    <Menu.ItemIndicator />
                    <Menu.ItemText>{t('fontOverview.regex')}</Menu.ItemText>
                  </Menu.CheckboxItem>
                </Menu.ItemGroup>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Box>
      <InputGroup
        endElementProps={{ pointerEvents: 'auto' }}
        endElement={
          displayedSearchQuery ? (
            <Tooltip content={t('fontOverview.clearSearch')}>
              <IconButton
                aria-label={t('fontOverview.clearSearch')}
                size="sm"
                variant="ghost"
                onClick={handleClearSearch}
              >
                <Xmark width={18} height={18} strokeWidth={2.2} />
              </IconButton>
            </Tooltip>
          ) : undefined
        }
      >
        <Input
          ps="64px"
          pr={11}
          placeholder={t('fontOverview.searchPlaceholder')}
          value={displayedSearchQuery}
          onChange={(event) => setLocalSearchQuery(event.target.value)}
        />
      </InputGroup>
    </Box>
  )
}
