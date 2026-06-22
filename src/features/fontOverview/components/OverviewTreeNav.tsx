import {
  Box,
  Button,
  HStack,
  IconButton,
  Tag,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react'
import { NavArrowDown, NavArrowRight, Plus, Settings } from 'iconoir-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  customOverviewFilterNodeIdToFilterId,
  type GlyphOverviewTreeNode,
} from 'src/lib/glyph/glyphOverview'

interface OverviewTreeNavProps {
  nodes: GlyphOverviewTreeNode[]
  selectedSectionId: string
  onCreateCustomFilter: () => void
  onEditCustomFilter: (filterId: string) => void
  onSectionSelect: (sectionId: string) => void
}

const DEFAULT_EXPANDED_NODE_IDS = ['categories', 'languages', 'filters']

const OVERVIEW_NODE_LABEL_KEYS: Record<string, string> = {
  all: 'fontOverview.filterLabels.all',
  categories: 'fontOverview.filterLabels.categories',
  languages: 'fontOverview.filterLabels.languages',
  filters: 'fontOverview.filterLabels.filters',
  'category:Letter': 'fontOverview.filterLabels.categoryLetter',
  'category:Number': 'fontOverview.filterLabels.categoryNumber',
  'category:Separator': 'fontOverview.filterLabels.categorySeparator',
  'category:Punctuation': 'fontOverview.filterLabels.categoryPunctuation',
  'category:Symbol': 'fontOverview.filterLabels.categorySymbol',
  'category:Mark': 'fontOverview.filterLabels.categoryMark',
  'category:Other': 'fontOverview.filterLabels.categoryOther',
  'category:Unencoded': 'fontOverview.filterLabels.categoryUnencoded',
}

const getNextExpandedIds = (expandedIds: string[], nodeId: string): string[] =>
  expandedIds.includes(nodeId)
    ? expandedIds.filter((id) => id !== nodeId)
    : [...expandedIds, nodeId]

function ExpandToggle({
  isExpanded,
  label,
  onToggle,
}: {
  isExpanded: boolean
  label: string
  onToggle: () => void
}) {
  const Icon = isExpanded ? NavArrowDown : NavArrowRight

  return (
    <IconButton
      aria-label={isExpanded ? `收合 ${label}` : `展開 ${label}`}
      icon={<Icon width={20} height={20} strokeWidth={2.25} />}
      size="xs"
      variant="ghost"
      minW="22px"
      w="22px"
      h="28px"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    />
  )
}

function TreeIndentSpacer() {
  return <Box w="22px" flexShrink={0} />
}

function OverviewTreeRow({
  createCustomFilterLabel,
  depth,
  editCustomFilterLabel,
  isExpanded,
  isSelected,
  node,
  onCreateCustomFilter,
  onEditCustomFilter,
  onSectionSelect,
  onToggle,
  translateNodeLabel,
}: {
  createCustomFilterLabel: string
  depth: number
  editCustomFilterLabel: string
  isExpanded: boolean
  isSelected: boolean
  node: GlyphOverviewTreeNode
  onCreateCustomFilter: () => void
  onEditCustomFilter: (filterId: string) => void
  onSectionSelect: (sectionId: string) => void
  onToggle: (sectionId: string) => void
  translateNodeLabel: (node: GlyphOverviewTreeNode) => string
}) {
  const hasChildren = Boolean(node.children?.length)
  const label = translateNodeLabel(node)
  const customFilterId = customOverviewFilterNodeIdToFilterId(node.id)

  return (
    <HStack spacing={0} pl={depth * 2.5}>
      {hasChildren ? (
        <ExpandToggle
          isExpanded={isExpanded}
          label={label}
          onToggle={() => onToggle(node.id)}
        />
      ) : (
        <TreeIndentSpacer />
      )}
      <Button
        flex={1}
        justifyContent="space-between"
        minW={0}
        ml={0.5}
        pl={2}
        size="sm"
        variant={isSelected ? 'solid' : 'ghost'}
        color="field.ink"
        fontWeight="900"
        onClick={() => onSectionSelect(node.id)}
      >
        <Text noOfLines={1}>{label}</Text>
        {node.id !== 'filters' ? (
          <Tag size="sm">{node.glyphs.length}</Tag>
        ) : null}
      </Button>
      {node.id === 'filters' ? (
        <Tooltip label={createCustomFilterLabel}>
          <IconButton
            aria-label={createCustomFilterLabel}
            icon={<Plus width={17} height={17} strokeWidth={2.2} />}
            minW="28px"
            w="28px"
            h="32px"
            ml={1}
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onCreateCustomFilter()
            }}
          />
        </Tooltip>
      ) : null}
      {customFilterId ? (
        <Tooltip label={editCustomFilterLabel}>
          <IconButton
            aria-label={editCustomFilterLabel}
            icon={<Settings width={17} height={17} strokeWidth={2.1} />}
            minW="28px"
            w="28px"
            h="32px"
            ml={1}
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onEditCustomFilter(customFilterId)
            }}
          />
        </Tooltip>
      ) : null}
    </HStack>
  )
}

function OverviewTreeBranch({
  createCustomFilterLabel,
  depth,
  editCustomFilterLabel,
  expandedIds,
  node,
  onCreateCustomFilter,
  onEditCustomFilter,
  selectedSectionId,
  onSectionSelect,
  onToggle,
  translateNodeLabel,
}: {
  createCustomFilterLabel: string
  depth: number
  editCustomFilterLabel: string
  expandedIds: string[]
  node: GlyphOverviewTreeNode
  onCreateCustomFilter: () => void
  onEditCustomFilter: (filterId: string) => void
  selectedSectionId: string
  onSectionSelect: (sectionId: string) => void
  onToggle: (sectionId: string) => void
  translateNodeLabel: (node: GlyphOverviewTreeNode) => string
}) {
  const isExpanded = expandedIds.includes(node.id)

  return (
    <Box>
      <OverviewTreeRow
        createCustomFilterLabel={createCustomFilterLabel}
        depth={depth}
        editCustomFilterLabel={editCustomFilterLabel}
        isExpanded={isExpanded}
        isSelected={selectedSectionId === node.id}
        node={node}
        onCreateCustomFilter={onCreateCustomFilter}
        onEditCustomFilter={onEditCustomFilter}
        onSectionSelect={onSectionSelect}
        onToggle={onToggle}
        translateNodeLabel={translateNodeLabel}
      />
      {isExpanded &&
        node.children?.map((child) => (
          <OverviewTreeBranch
            key={child.id}
            createCustomFilterLabel={createCustomFilterLabel}
            depth={depth + 1}
            editCustomFilterLabel={editCustomFilterLabel}
            expandedIds={expandedIds}
            node={child}
            onCreateCustomFilter={onCreateCustomFilter}
            onEditCustomFilter={onEditCustomFilter}
            selectedSectionId={selectedSectionId}
            onSectionSelect={onSectionSelect}
            onToggle={onToggle}
            translateNodeLabel={translateNodeLabel}
          />
        ))}
    </Box>
  )
}

export function OverviewTreeNav({
  nodes,
  selectedSectionId,
  onCreateCustomFilter,
  onEditCustomFilter,
  onSectionSelect,
}: OverviewTreeNavProps) {
  const { t } = useTranslation()
  const [expandedIds, setExpandedIds] = useState(DEFAULT_EXPANDED_NODE_IDS)
  const handleToggle = (nodeId: string) => {
    setExpandedIds((current) => getNextExpandedIds(current, nodeId))
  }
  const createCustomFilterLabel = t('fontOverview.customFilter.createTitle')
  const editCustomFilterLabel = t('fontOverview.customFilter.editTitle')
  const translateNodeLabel = (node: GlyphOverviewTreeNode) => {
    if (node.labelKey) {
      return t(node.labelKey)
    }
    const labelKey = OVERVIEW_NODE_LABEL_KEYS[node.id]
    return labelKey ? t(labelKey) : node.label
  }

  return (
    <VStack align="stretch" spacing={1}>
      {nodes.map((node) => (
        <OverviewTreeBranch
          key={node.id}
          createCustomFilterLabel={createCustomFilterLabel}
          depth={0}
          editCustomFilterLabel={editCustomFilterLabel}
          expandedIds={expandedIds}
          node={node}
          onCreateCustomFilter={onCreateCustomFilter}
          onEditCustomFilter={onEditCustomFilter}
          selectedSectionId={selectedSectionId}
          onSectionSelect={onSectionSelect}
          onToggle={handleToggle}
          translateNodeLabel={translateNodeLabel}
        />
      ))}
    </VStack>
  )
}
