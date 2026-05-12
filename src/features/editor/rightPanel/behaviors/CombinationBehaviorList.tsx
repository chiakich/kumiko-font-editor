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
  CombinationBehaviorDraft,
  CombinationBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { CombinationBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/CombinationBehaviorTableRow'

interface CombinationBehaviorListProps {
  rows: CombinationBehaviorRow[]
  draftRowIds: string[]
  onAddDraftRow: () => void
  onCommit: (draft: CombinationBehaviorDraft) => void
  onDelete: (row: CombinationBehaviorRow) => void
  onDraftCommitted: (rowId: string) => void
  onOpenGlyph: (glyphId: string) => void
}

export function CombinationBehaviorList({
  rows,
  draftRowIds,
  onAddDraftRow,
  onCommit,
  onDelete,
  onDraftCommitted,
  onOpenGlyph,
}: CombinationBehaviorListProps) {
  return (
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            Combinations
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label="Add combination">
            <IconButton
              aria-label="新增 combination"
              icon={<PlusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={onAddDraftRow}
            />
          </Tooltip>
          <Tooltip label="Remove the last draft row">
            <IconButton
              aria-label="移除最後一列草稿"
              icon={<MinusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              isDisabled={draftRowIds.length === 0}
              onClick={() => onDraftCommitted(draftRowIds.at(-1) ?? '')}
            />
          </Tooltip>
        </HStack>
      </HStack>

      <Box borderWidth="1px" borderColor="field.line" bg="field.panel">
        <CombinationHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            No combinations for this glyph yet.
          </Text>
        ) : null}
        {rows.map((row) => (
          <CombinationBehaviorTableRow
            key={getCombinationRowKey(row)}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
            onOpenGlyph={onOpenGlyph}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <CombinationBehaviorTableRow
            key={rowId}
            rowId={rowId}
            onCommit={onCommit}
            onDelete={() => onDraftCommitted(rowId)}
            onDraftCommitted={() => onDraftCommitted(rowId)}
            onOpenGlyph={onOpenGlyph}
          />
        ))}
      </Box>
    </Stack>
  )
}

function getCombinationRowKey(row: CombinationBehaviorRow) {
  return [
    row.id,
    row.input,
    row.output,
    row.type,
    row.featureTag,
    row.sourceLabel,
  ].join(':')
}

function CombinationHeader() {
  return (
    <Box
      display="grid"
      gridTemplateColumns="minmax(76px, 1fr) 14px minmax(76px, 1fr)"
      gap={1}
      px={3}
      py={2}
      bg="field.panelMuted"
      borderBottomWidth="1px"
      borderColor="field.line"
    >
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Input
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        →
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Output
      </Text>
    </Box>
  )
}
