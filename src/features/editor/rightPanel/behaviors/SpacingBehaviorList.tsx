import {
  Badge,
  Box,
  HStack,
  IconButton,
  Stack,
  Text,
  Tooltip,
} from '@chakra-ui/react'
import { MinusCircle, PlusCircle } from 'iconoir-react'
import type {
  SpacingBehaviorDraft,
  SpacingBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { SpacingBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/SpacingBehaviorTableRow'

interface SpacingBehaviorListProps {
  rows: SpacingBehaviorRow[]
  leftDraftRowIds: string[]
  rightDraftRowIds: string[]
  currentGlyphId: string
  onAddLeftDraftRow: () => void
  onAddRightDraftRow: () => void
  onCommit: (draft: SpacingBehaviorDraft) => void
  onDelete: (row: SpacingBehaviorRow) => void
  onLeftDraftCommitted: (rowId: string) => void
  onRightDraftCommitted: (rowId: string) => void
  onOpenPair: (left: string, right: string) => void
}

export function SpacingBehaviorList({
  rows,
  leftDraftRowIds,
  rightDraftRowIds,
  currentGlyphId,
  onAddLeftDraftRow,
  onAddRightDraftRow,
  onCommit,
  onDelete,
  onLeftDraftCommitted,
  onRightDraftCommitted,
  onOpenPair,
}: SpacingBehaviorListProps) {
  const leftRows = rows.filter((row) => row.right === currentGlyphId)
  const rightRows = rows.filter((row) => row.left === currentGlyphId)

  return (
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            Spacing
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
      </HStack>

      <SpacingBehaviorGroup
        title="Left spacing"
        side="left"
        rows={leftRows}
        draftRowIds={leftDraftRowIds}
        currentGlyphId={currentGlyphId}
        emptyLabel="No left-side pairs yet."
        onAddDraftRow={onAddLeftDraftRow}
        onCommit={onCommit}
        onDelete={onDelete}
        onDraftCommitted={onLeftDraftCommitted}
        onOpenPair={onOpenPair}
      />
      <SpacingBehaviorGroup
        title="Right spacing"
        side="right"
        rows={rightRows}
        draftRowIds={rightDraftRowIds}
        currentGlyphId={currentGlyphId}
        emptyLabel="No right-side pairs yet."
        onAddDraftRow={onAddRightDraftRow}
        onCommit={onCommit}
        onDelete={onDelete}
        onDraftCommitted={onRightDraftCommitted}
        onOpenPair={onOpenPair}
      />
    </Stack>
  )
}

interface SpacingBehaviorGroupProps {
  title: string
  side: 'left' | 'right'
  rows: SpacingBehaviorRow[]
  draftRowIds: string[]
  currentGlyphId: string
  emptyLabel: string
  onAddDraftRow: () => void
  onCommit: (draft: SpacingBehaviorDraft) => void
  onDelete: (row: SpacingBehaviorRow) => void
  onDraftCommitted: (rowId: string) => void
  onOpenPair: (left: string, right: string) => void
}

function SpacingBehaviorGroup({
  title,
  side,
  rows,
  draftRowIds,
  currentGlyphId,
  emptyLabel,
  onAddDraftRow,
  onCommit,
  onDelete,
  onDraftCommitted,
  onOpenPair,
}: SpacingBehaviorGroupProps) {
  return (
    <Box borderWidth="1px" borderColor="field.line" bg="field.panel">
      <HStack
        justify="space-between"
        px={3}
        py={2}
        bg="field.panelMuted"
        borderBottomWidth="1px"
        borderColor="field.line"
      >
        <HStack spacing={2}>
          <Text fontSize="xs" fontWeight="bold">
            {title}
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label={`Add ${title.toLowerCase()} pair`}>
            <IconButton
              aria-label={`新增 ${title} pair`}
              icon={<PlusCircle width={16} height={16} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={onAddDraftRow}
            />
          </Tooltip>
          <Tooltip label="Remove the last draft row">
            <IconButton
              aria-label={`移除最後一列 ${title} 草稿`}
              icon={<MinusCircle width={16} height={16} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              isDisabled={draftRowIds.length === 0}
              onClick={() => onDraftCommitted(draftRowIds.at(-1) ?? '')}
            />
          </Tooltip>
        </HStack>
      </HStack>
      <SpacingHeader side={side} />
      {rows.length === 0 && draftRowIds.length === 0 ? (
        <Text fontSize="xs" color="field.muted" px={3} py={3}>
          {emptyLabel}
        </Text>
      ) : null}
      {rows.map((row) => (
        <SpacingBehaviorTableRow
          key={getSpacingRowKey(row)}
          row={row}
          side={side}
          currentGlyphId={currentGlyphId}
          onCommit={onCommit}
          onDelete={() => onDelete(row)}
          onOpenPair={onOpenPair}
        />
      ))}
      {draftRowIds.map((rowId) => (
        <SpacingBehaviorTableRow
          key={rowId}
          rowId={rowId}
          side={side}
          currentGlyphId={currentGlyphId}
          onCommit={onCommit}
          onDelete={() => onDraftCommitted(rowId)}
          onDraftCommitted={() => onDraftCommitted(rowId)}
          onOpenPair={onOpenPair}
        />
      ))}
    </Box>
  )
}

function getSpacingRowKey(row: SpacingBehaviorRow) {
  return [
    row.id,
    row.left,
    row.right,
    row.value,
    row.featureTag,
    row.sourceLabel,
  ].join(':')
}

function SpacingHeader({ side }: { side: 'left' | 'right' }) {
  return (
    <Box
      display="grid"
      gridTemplateColumns="minmax(48px, 1fr) minmax(48px, 1fr) 96px"
      gap={1}
      px={3}
      py={2}
      bg="field.panelMuted"
      borderBottomWidth="1px"
      borderColor="field.line"
    >
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        {side === 'left' ? 'Editable left' : 'Fixed left'}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        {side === 'left' ? 'Fixed right' : 'Editable right'}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Value
      </Text>
    </Box>
  )
}
