import {
  Box,
  Button,
  HStack,
  IconButton,
  Portal,
  Tag,
  Text,
  VStack,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { NavArrowDown, NavArrowRight, Plus, Settings } from 'iconoir-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OverviewCustomFilterModal } from 'src/features/fontOverview/components/OverviewCustomFilterModal'
import {
  customOverviewFilterNodeIdToFilterId,
  type OverviewCustomFilterRule,
  type OverviewCustomFilterRuleGroup,
  type GlyphOverviewTreeNode,
} from 'src/lib/glyph/glyphOverview'
import { useStore } from 'src/store'

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
}

interface CustomFilterContextMenuState {
  filterId: string
  label: string
  x: number
  y: number
}

const createCustomFilterRuleId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const isCustomFilterRuleGroup = (
  rule: OverviewCustomFilterRule
): rule is OverviewCustomFilterRuleGroup => rule.type === 'group'

const cloneCustomFilterRule = (
  rule: OverviewCustomFilterRule
): OverviewCustomFilterRule => {
  if (isCustomFilterRuleGroup(rule)) {
    return {
      id: createCustomFilterRuleId(),
      mode: rule.mode,
      rules: rule.rules.map(cloneCustomFilterRule),
      type: 'group',
    }
  }
  return {
    ...rule,
    id: createCustomFilterRuleId(),
  }
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
      size="xs"
      variant="ghost"
      minW="22px"
      w="22px"
      h="28px"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      <Icon width={20} height={20} strokeWidth={2.25} />
    </IconButton>
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
  onOpenCustomFilterContextMenu,
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
  onOpenCustomFilterContextMenu: (
    filterId: string,
    label: string,
    event: React.MouseEvent
  ) => void
  onSectionSelect: (sectionId: string) => void
  onToggle: (sectionId: string) => void
  translateNodeLabel: (node: GlyphOverviewTreeNode) => string
}) {
  const hasChildren = Boolean(node.children?.length)
  const label = translateNodeLabel(node)
  const customFilterId = customOverviewFilterNodeIdToFilterId(node.id)

  return (
    <HStack
      gap={0}
      pl={depth * 2.5}
      onContextMenu={(event) => {
        if (!customFilterId) {
          return
        }
        onOpenCustomFilterContextMenu(customFilterId, label, event)
      }}
    >
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
        color={isSelected ? 'primaryForeground' : 'foreground'}
        fontWeight="900"
        onClick={() => onSectionSelect(node.id)}
      >
        <Text lineClamp={1}>{label}</Text>
        {node.id !== 'filters' ? (
          <Tag.Root size="sm">{node.glyphs.length}</Tag.Root>
        ) : null}
      </Button>
      {node.id === 'filters' ? (
        <Tooltip content={createCustomFilterLabel}>
          <IconButton
            aria-label={createCustomFilterLabel}
            minW="28px"
            w="28px"
            h="32px"
            ml={0.25}
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onCreateCustomFilter()
            }}
          >
            <Plus width={17} height={17} strokeWidth={2.2} />
          </IconButton>
        </Tooltip>
      ) : null}
      {customFilterId ? (
        <Tooltip content={editCustomFilterLabel}>
          <IconButton
            aria-label={editCustomFilterLabel}
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
          >
            <Settings width={17} height={17} strokeWidth={2.1} />
          </IconButton>
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
  onOpenCustomFilterContextMenu,
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
  onOpenCustomFilterContextMenu: (
    filterId: string,
    label: string,
    event: React.MouseEvent
  ) => void
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
        onOpenCustomFilterContextMenu={onOpenCustomFilterContextMenu}
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
            onOpenCustomFilterContextMenu={onOpenCustomFilterContextMenu}
            selectedSectionId={selectedSectionId}
            onSectionSelect={onSectionSelect}
            onToggle={onToggle}
            translateNodeLabel={translateNodeLabel}
          />
        ))}
    </Box>
  )
}

function CustomFilterContextMenu({
  position,
  onClose,
  onDelete,
  onDuplicate,
  onEdit,
}: {
  position: { x: number; y: number }
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    const handlePointerDown = () => onClose()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <Portal>
      <Box
        bg="card"
        border="1px solid"
        borderColor="controlBorder"
        borderRadius="6px"
        boxShadow="0 12px 32px rgba(15, 23, 42, 0.18)"
        left={`${position.x}px`}
        overflow="hidden"
        position="fixed"
        py="4px"
        top={`${position.y}px`}
        w="124px"
        zIndex="popover"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ContextMenuButton onClick={onEdit}>
          {t('fontOverview.customFilter.contextEdit')}
        </ContextMenuButton>
        <ContextMenuButton onClick={onDuplicate}>
          {t('fontOverview.customFilter.contextDuplicate')}
        </ContextMenuButton>
        <Box h="1px" my="4px" bg="muted" />
        <ContextMenuButton tone="danger" onClick={onDelete}>
          {t('fontOverview.customFilter.contextDelete')}
        </ContextMenuButton>
      </Box>
    </Portal>
  )
}

function ContextMenuButton({
  children,
  onClick,
  tone = 'default',
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <Box
      color={tone === 'danger' ? 'red.600' : 'foreground'}
      display="block"
      fontSize="13px"
      px="12px"
      py="8px"
      textAlign="left"
      w="100%"
      _hover={{ bg: tone === 'danger' ? 'red.50' : 'gray.50' }}
      asChild
    >
      <button type="button" onClick={onClick}>
        {children}
      </button>
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
  const [editingCustomFilterId, setEditingCustomFilterId] = useState<
    string | null
  >(null)
  const [isCreatingCustomFilter, setIsCreatingCustomFilter] = useState(false)
  const [contextMenu, setContextMenu] =
    useState<CustomFilterContextMenuState | null>(null)
  const overviewCustomFilters = useStore((state) => state.overviewCustomFilters)
  const addOverviewCustomFilter = useStore(
    (state) => state.addOverviewCustomFilter
  )
  const updateOverviewCustomFilter = useStore(
    (state) => state.updateOverviewCustomFilter
  )
  const deleteOverviewCustomFilter = useStore(
    (state) => state.deleteOverviewCustomFilter
  )

  const editingCustomFilter =
    overviewCustomFilters.find(
      (filter) => filter.id === editingCustomFilterId
    ) ?? null
  const isCustomFilterModalOpen =
    isCreatingCustomFilter || editingCustomFilter !== null
  const handleToggle = (nodeId: string) => {
    setExpandedIds((current) => getNextExpandedIds(current, nodeId))
  }
  const handleOpenCreateCustomFilter = useCallback(() => {
    setEditingCustomFilterId(null)
    setIsCreatingCustomFilter(true)
  }, [])
  const handleOpenEditCustomFilter = useCallback((filterId: string) => {
    setIsCreatingCustomFilter(false)
    setEditingCustomFilterId(filterId)
  }, [])
  const handleOpenCustomFilterContextMenu = useCallback(
    (filterId: string, label: string, event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({
        filterId,
        label,
        x: event.clientX,
        y: event.clientY,
      })
    },
    []
  )
  const handleCloseCustomFilterModal = useCallback(() => {
    setIsCreatingCustomFilter(false)
    setEditingCustomFilterId(null)
  }, [])
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])
  const handleDuplicateCustomFilter = useCallback(
    (filterId: string, label: string) => {
      const filter = overviewCustomFilters.find(
        (currentFilter) => currentFilter.id === filterId
      )
      if (!filter) {
        setContextMenu(null)
        return
      }

      addOverviewCustomFilter({
        mode: filter.mode,
        name: t('fontOverview.customFilter.copyName', { name: label }),
        rules: filter.rules.map(cloneCustomFilterRule),
        sort: filter.sort ?? 'codePoint',
        source: 'user',
      })
      setContextMenu(null)
    },
    [addOverviewCustomFilter, overviewCustomFilters, t]
  )
  const handleDeleteCustomFilterFromContextMenu = useCallback(
    (filterId: string) => {
      deleteOverviewCustomFilter(filterId)
      setContextMenu(null)
    },
    [deleteOverviewCustomFilter]
  )
  const handleEditCustomFilterFromContextMenu = useCallback(
    (filterId: string) => {
      handleOpenEditCustomFilter(filterId)
      setContextMenu(null)
    },
    [handleOpenEditCustomFilter]
  )
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
    <>
      <VStack align="stretch" gap={1}>
        {nodes.map((node) => (
          <OverviewTreeBranch
            key={node.id}
            createCustomFilterLabel={createCustomFilterLabel}
            depth={0}
            editCustomFilterLabel={editCustomFilterLabel}
            expandedIds={expandedIds}
            node={node}
            onCreateCustomFilter={handleOpenCreateCustomFilter}
            onEditCustomFilter={handleOpenEditCustomFilter}
            onOpenCustomFilterContextMenu={handleOpenCustomFilterContextMenu}
            selectedSectionId={selectedSectionId}
            onSectionSelect={onSectionSelect}
            onToggle={handleToggle}
            translateNodeLabel={translateNodeLabel}
          />
        ))}
      </VStack>
      <OverviewCustomFilterModal
        filter={editingCustomFilter}
        isOpen={isCustomFilterModalOpen}
        onClose={handleCloseCustomFilterModal}
        onCreateFilter={addOverviewCustomFilter}
        onDeleteFilter={deleteOverviewCustomFilter}
        onUpdateFilter={updateOverviewCustomFilter}
      />
      {contextMenu ? (
        <CustomFilterContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={handleCloseContextMenu}
          onDelete={() =>
            handleDeleteCustomFilterFromContextMenu(contextMenu.filterId)
          }
          onDuplicate={() =>
            handleDuplicateCustomFilter(contextMenu.filterId, contextMenu.label)
          }
          onEdit={() =>
            handleEditCustomFilterFromContextMenu(contextMenu.filterId)
          }
        />
      ) : null}
    </>
  )
}
