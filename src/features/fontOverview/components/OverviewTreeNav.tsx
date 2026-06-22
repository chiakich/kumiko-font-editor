import {
  Box,
  Button,
  HStack,
  IconButton,
  Tag,
  Text,
  VStack,
} from '@chakra-ui/react'
import { NavArrowDown, NavArrowRight } from 'iconoir-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GlyphOverviewTreeNode } from 'src/lib/glyph/glyphOverview'

interface OverviewTreeNavProps {
  nodes: GlyphOverviewTreeNode[]
  selectedSectionId: string
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
  'filter:recent-edits': 'fontOverview.filterLabels.recentEdits',
  'filter:empty': 'fontOverview.filterLabels.emptyGlyphs',
  'filter:exporting': 'fontOverview.filterLabels.exporting',
  'filter:not-exporting': 'fontOverview.filterLabels.notExporting',
  'filter:has-unicode': 'fontOverview.filterLabels.hasUnicode',
  'filter:no-unicode': 'fontOverview.filterLabels.noUnicode',
  'filter:has-components': 'fontOverview.filterLabels.hasComponents',
  'filter:has-anchors': 'fontOverview.filterLabels.hasAnchors',
  'filter:has-hints': 'fontOverview.filterLabels.hasHints',
  'filter:has-metrics-keys': 'fontOverview.filterLabels.hasMetricsKeys',
  'filter:has-color-label': 'fontOverview.filterLabels.hasColorLabel',
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
  depth,
  isExpanded,
  isSelected,
  node,
  onSectionSelect,
  onToggle,
  translateNodeLabel,
}: {
  depth: number
  isExpanded: boolean
  isSelected: boolean
  node: GlyphOverviewTreeNode
  onSectionSelect: (sectionId: string) => void
  onToggle: (sectionId: string) => void
  translateNodeLabel: (node: GlyphOverviewTreeNode) => string
}) {
  const hasChildren = Boolean(node.children?.length)
  const label = translateNodeLabel(node)

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
        <Tag size="sm">{node.glyphs.length}</Tag>
      </Button>
    </HStack>
  )
}

function OverviewTreeBranch({
  depth,
  expandedIds,
  node,
  selectedSectionId,
  onSectionSelect,
  onToggle,
  translateNodeLabel,
}: {
  depth: number
  expandedIds: string[]
  node: GlyphOverviewTreeNode
  selectedSectionId: string
  onSectionSelect: (sectionId: string) => void
  onToggle: (sectionId: string) => void
  translateNodeLabel: (node: GlyphOverviewTreeNode) => string
}) {
  const isExpanded = expandedIds.includes(node.id)

  return (
    <Box>
      <OverviewTreeRow
        depth={depth}
        isExpanded={isExpanded}
        isSelected={selectedSectionId === node.id}
        node={node}
        onSectionSelect={onSectionSelect}
        onToggle={onToggle}
        translateNodeLabel={translateNodeLabel}
      />
      {isExpanded &&
        node.children?.map((child) => (
          <OverviewTreeBranch
            key={child.id}
            depth={depth + 1}
            expandedIds={expandedIds}
            node={child}
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
  onSectionSelect,
}: OverviewTreeNavProps) {
  const { t } = useTranslation()
  const [expandedIds, setExpandedIds] = useState(DEFAULT_EXPANDED_NODE_IDS)
  const handleToggle = (nodeId: string) => {
    setExpandedIds((current) => getNextExpandedIds(current, nodeId))
  }
  const translateNodeLabel = (node: GlyphOverviewTreeNode) => {
    const labelKey = OVERVIEW_NODE_LABEL_KEYS[node.id]
    return labelKey ? t(labelKey) : node.label
  }

  return (
    <VStack align="stretch" spacing={1}>
      {nodes.map((node) => (
        <OverviewTreeBranch
          key={node.id}
          depth={0}
          expandedIds={expandedIds}
          node={node}
          selectedSectionId={selectedSectionId}
          onSectionSelect={onSectionSelect}
          onToggle={handleToggle}
          translateNodeLabel={translateNodeLabel}
        />
      ))}
    </VStack>
  )
}
