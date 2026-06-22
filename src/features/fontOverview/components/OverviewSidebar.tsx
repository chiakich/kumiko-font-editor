import {
  Box,
  Button,
  Divider,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react'
import type {
  GlyphOverviewTreeNode,
  OverviewSearchField,
} from 'src/lib/glyph/glyphOverview'
import { OverviewTreeNav } from 'src/features/fontOverview/components/OverviewTreeNav'
import type { OverviewSearchOptionsState } from 'src/store'
import { NavArrowDown, Search, Xmark } from 'iconoir-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'

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

const normalizeMenuValues = <T extends string>(
  value: string | string[]
): T[] => (Array.isArray(value) ? (value as T[]) : ([value] as T[]))

interface OverviewSidebarProps {
  currentSearchQuery: string
  isClosingProject: boolean
  overviewSearchOptions: OverviewSearchOptionsState
  projectTitle: string
  selectedSectionId: string
  totalGlyphCount: number
  treeNodes: GlyphOverviewTreeNode[]
  visibleGlyphCount: number
  onCloseProject: () => void
  onCreateCustomFilter: () => void
  onEditCustomFilter: (filterId: string) => void
  onSearchQueryChange: (value: string) => void
  onSearchOptionsChange: (options: Partial<OverviewSearchOptionsState>) => void
  onSectionSelect: (sectionId: string) => void
}

export function OverviewSidebar({
  currentSearchQuery,
  isClosingProject,
  overviewSearchOptions,
  projectTitle,
  selectedSectionId,
  totalGlyphCount,
  treeNodes,
  visibleGlyphCount,
  onCloseProject,
  onCreateCustomFilter,
  onEditCustomFilter,
  onSearchQueryChange,
  onSearchOptionsChange,
  onSectionSelect,
}: OverviewSidebarProps) {
  const { t } = useTranslation()
  const [localSearchQuery, setLocalSearchQuery] = useState<string | null>(null)
  const displayedSearchQuery = localSearchQuery ?? currentSearchQuery
  const selectedFieldGroups = getSelectedSearchFieldGroups(
    overviewSearchOptions.fields
  )
  const searchOptionValues = [
    ...(overviewSearchOptions.matchCase ? ['matchCase'] : []),
    ...(overviewSearchOptions.regex ? ['regex'] : []),
  ]

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

  return (
    <Box
      p={4}
      h="100%"
      display="flex"
      flexDirection="column"
      bg="field.paper"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <VStack align="stretch" spacing={3} mb={4}>
        <HStack justify="space-between" align="flex-start">
          <Box>
            <Text
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="0.16em"
              color="field.muted"
              mb={1}
              fontFamily="mono"
              fontWeight="900"
            >
              {t('fontOverview.kumikoFontEditor')}
            </Text>
            <Heading
              color="field.ink"
              fontSize="28px"
              lineHeight="0.98"
              letterSpacing="0"
            >
              {t('fontOverview.glyphOverview')}
            </Heading>
            <Text fontSize="sm" color="field.muted" mt={2} noOfLines={2}>
              {projectTitle}
            </Text>
          </Box>
          <Button
            size="sm"
            variant="ghost"
            isLoading={isClosingProject}
            loadingText={t('fontOverview.saving')}
            onClick={onCloseProject}
          >
            {t('fontOverview.backHome')}
          </Button>
        </HStack>

        <InputGroup>
          <InputLeftElement>
            <Menu closeOnSelect={false} placement="bottom-start">
              <Tooltip label={t('fontOverview.searchOptions')}>
                <MenuButton
                  as={IconButton}
                  aria-label={t('fontOverview.searchOptions')}
                  icon={
                    <Box h="22px" position="relative" w="22px">
                      <Search width={18} height={18} strokeWidth={2.2} />
                      <Box bottom={0} position="absolute" right={0}>
                        <NavArrowDown
                          width={10}
                          height={10}
                          strokeWidth={2.4}
                        />
                      </Box>
                    </Box>
                  }
                  size="sm"
                  variant="ghost"
                  _active={{ bg: 'transparent' }}
                  _expanded={{ bg: 'transparent' }}
                  _hover={{ bg: 'transparent' }}
                />
              </Tooltip>
              <MenuList bg="transparent" minW="220px">
                <MenuOptionGroup
                  title={t('fontOverview.searchFieldsTitle')}
                  type="checkbox"
                  value={selectedFieldGroups}
                  onChange={(value) => {
                    const nextGroups =
                      normalizeMenuValues<SearchFieldGroupId>(value)
                    if (!nextGroups.length) {
                      return
                    }
                    onSearchOptionsChange({
                      fields: searchFieldGroupsToFields(nextGroups),
                    })
                  }}
                >
                  {SEARCH_FIELD_GROUPS.map((group) => (
                    <MenuItemOption key={group.id} value={group.id}>
                      {t(group.labelKey)}
                    </MenuItemOption>
                  ))}
                </MenuOptionGroup>
                <MenuDivider />
                <MenuOptionGroup
                  title={t('fontOverview.searchOptionsTitle')}
                  type="checkbox"
                  value={searchOptionValues}
                  onChange={(value) => {
                    const values = new Set(normalizeMenuValues(value))
                    onSearchOptionsChange({
                      matchCase: values.has('matchCase'),
                      regex: values.has('regex'),
                    })
                  }}
                >
                  <MenuItemOption value="matchCase">
                    {t('fontOverview.matchCase')}
                  </MenuItemOption>
                  <MenuItemOption value="regex">
                    {t('fontOverview.regex')}
                  </MenuItemOption>
                </MenuOptionGroup>
              </MenuList>
            </Menu>
          </InputLeftElement>
          <Input
            pl={9}
            pr={11}
            placeholder={t('fontOverview.searchPlaceholder')}
            value={displayedSearchQuery}
            onChange={(event) => setLocalSearchQuery(event.target.value)}
          />
          {displayedSearchQuery ? (
            <InputRightElement>
              <Tooltip label={t('fontOverview.clearSearch')}>
                <IconButton
                  aria-label={t('fontOverview.clearSearch')}
                  icon={<Xmark width={18} height={18} strokeWidth={2.2} />}
                  size="sm"
                  variant="ghost"
                  onClick={handleClearSearch}
                />
              </Tooltip>
            </InputRightElement>
          ) : null}
        </InputGroup>

        <Text fontSize="sm" color="field.muted" fontFamily="mono">
          {t('fontOverview.visibleTotalCount', {
            total: totalGlyphCount.toLocaleString(),
            visible: visibleGlyphCount.toLocaleString(),
          })}
        </Text>
      </VStack>

      <Divider mb={4} borderColor="field.haze" opacity={0.55} />

      <Box flex={1} minH={0} bg="white" borderRadius="sm" overflow="auto" p={2}>
        <OverviewTreeNav
          nodes={treeNodes}
          selectedSectionId={selectedSectionId}
          onCreateCustomFilter={onCreateCustomFilter}
          onEditCustomFilter={onEditCustomFilter}
          onSectionSelect={onSectionSelect}
        />
      </Box>
    </Box>
  )
}
