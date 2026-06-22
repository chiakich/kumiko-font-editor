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
import { Search, Settings } from 'iconoir-react'
import { useTranslation } from 'react-i18next'

type SearchFieldGroupId = 'glyphName' | 'unicode' | 'note' | 'component' | 'ids'

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
  onSearchQueryChange,
  onSearchOptionsChange,
  onSectionSelect,
}: OverviewSidebarProps) {
  const { t } = useTranslation()
  const selectedFieldGroups = getSelectedSearchFieldGroups(
    overviewSearchOptions.fields
  )
  const searchOptionValues = [
    ...(overviewSearchOptions.matchCase ? ['matchCase'] : []),
    ...(overviewSearchOptions.regex ? ['regex'] : []),
  ]

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
          <InputLeftElement pointerEvents="none">
            <Search width={18} height={18} strokeWidth={2.2} />
          </InputLeftElement>
          <Input
            pl={9}
            pr={11}
            placeholder={t('fontOverview.searchPlaceholder')}
            value={currentSearchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
          <InputRightElement>
            <Menu closeOnSelect={false} placement="bottom-end">
              <Tooltip label={t('fontOverview.searchOptions')}>
                <MenuButton
                  as={IconButton}
                  aria-label={t('fontOverview.searchOptions')}
                  icon={<Settings width={18} height={18} strokeWidth={2.1} />}
                  size="sm"
                  variant="ghost"
                />
              </Tooltip>
              <MenuList minW="220px">
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
          </InputRightElement>
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
          onSectionSelect={onSectionSelect}
        />
      </Box>
    </Box>
  )
}
