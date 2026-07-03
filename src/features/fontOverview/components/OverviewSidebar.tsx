import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Menu,
  Portal,
  Text,
  VStack,
  Separator,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
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

  return (
    <Box
      p={4}
      h="100%"
      display="flex"
      flexDirection="column"
      bg="background"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <VStack align="stretch" gap={3} mb={4}>
        <HStack justify="space-between" align="flex-start">
          <Box>
            <Text
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="0.16em"
              color="mutedForeground"
              mb={1}
              fontFamily="mono"
              fontWeight="900"
            >
              {t('fontOverview.kumikoFontEditor')}
            </Text>
            <Heading
              color="foreground"
              fontSize="28px"
              lineHeight="0.98"
              letterSpacing="0"
            >
              {t('fontOverview.glyphOverview')}
            </Heading>
            <Text fontSize="sm" color="mutedForeground" mt={2} lineClamp={2}>
              {projectTitle}
            </Text>
          </Box>
          <Button
            size="sm"
            variant="ghost"
            loading={isClosingProject}
            loadingText={t('fontOverview.saving')}
            onClick={onCloseProject}
          >
            {t('fontOverview.backHome')}
          </Button>
        </HStack>

        <InputGroup
          startElementProps={{ pointerEvents: 'auto' }}
          endElementProps={{ pointerEvents: 'auto' }}
          startElement={
            <Menu.Root
              closeOnSelect={false}
              positioning={{
                placement: 'bottom-start',
              }}
            >
              <Tooltip content={t('fontOverview.searchOptions')}>
                <Menu.Trigger asChild>
                  <IconButton
                    aria-label={t('fontOverview.searchOptions')}
                    size="sm"
                    variant="ghost"
                    _active={{ bg: 'transparent' }}
                    _expanded={{ bg: 'transparent' }}
                    _hover={{ bg: 'transparent' }}
                  >
                    <Box h="22px" position="relative" w="22px">
                      <Search width={18} height={18} strokeWidth={2.2} />
                      <Box bottom={0} position="absolute" right="-6px">
                        <NavArrowDown
                          width={10}
                          height={10}
                          strokeWidth={2.4}
                        />
                      </Box>
                    </Box>
                  </IconButton>
                </Menu.Trigger>
              </Tooltip>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.ItemGroup>
                      <Menu.ItemGroupLabel>
                        {t('fontOverview.searchFieldsTitle')}
                      </Menu.ItemGroupLabel>
                      {SEARCH_FIELD_GROUPS.map((group) => (
                        <Menu.CheckboxItem
                          key={group.id}
                          value={group.id}
                          checked={selectedFieldGroups.includes(group.id)}
                          onCheckedChange={(checked) => {
                            const groupSet = new Set(selectedFieldGroups)
                            if (checked) {
                              groupSet.add(group.id)
                            } else {
                              groupSet.delete(group.id)
                            }
                            const nextGroups = Array.from(groupSet)
                            if (!nextGroups.length) {
                              return
                            }
                            onSearchOptionsChange({
                              fields: searchFieldGroupsToFields(nextGroups),
                            })
                          }}
                        >
                          {t(group.labelKey)}
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
                        {t('fontOverview.matchCase')}
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
                        {t('fontOverview.regex')}
                      </Menu.CheckboxItem>
                    </Menu.ItemGroup>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          }
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
            pl={9}
            pr={11}
            placeholder={t('fontOverview.searchPlaceholder')}
            value={displayedSearchQuery}
            onChange={(event) => setLocalSearchQuery(event.target.value)}
          />
        </InputGroup>

        <Text fontSize="sm" color="mutedForeground" fontFamily="mono">
          {t('fontOverview.visibleTotalCount', {
            total: totalGlyphCount.toLocaleString(),
            visible: visibleGlyphCount.toLocaleString(),
          })}
        </Text>
      </VStack>
      <Separator mb={4} borderColor="haze" opacity={0.55} />
      <Box flex={1} minH={0} bg="card" borderRadius="sm" overflow="auto" p={2}>
        <OverviewTreeNav
          nodes={treeNodes}
          selectedSectionId={selectedSectionId}
          onSectionSelect={onSectionSelect}
        />
      </Box>
    </Box>
  )
}
