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
  ContextualBehaviorDraft,
  ContextualBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { ContextualBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/ContextualBehaviorTableRow'

interface ContextualBehaviorListProps {
  rows: ContextualBehaviorRow[]
  draftRowIds: string[]
  currentGlyphId: string
  onAddDraftRow: () => void
  onCommit: (draft: ContextualBehaviorDraft) => void
  onDelete: (row: ContextualBehaviorRow) => void
  onDraftCommitted: (rowId: string) => void
}

export function ContextualBehaviorList({
  rows,
  draftRowIds,
  currentGlyphId,
  onAddDraftRow,
  onCommit,
  onDelete,
  onDraftCommitted,
}: ContextualBehaviorListProps) {
  return (
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            Contextual
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label="Add contextual rule">
            <IconButton
              aria-label="新增 contextual rule"
              icon={<PlusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={onAddDraftRow}
            />
          </Tooltip>
          <Tooltip label="Remove the last draft row">
            <IconButton
              aria-label="移除最後一列 contextual 草稿"
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
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            No contextual rules for this glyph yet.
          </Text>
        ) : null}
        {rows.map((row) => (
          <ContextualBehaviorTableRow
            key={row.id}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <ContextualBehaviorTableRow
            key={rowId}
            rowId={rowId}
            currentGlyphId={currentGlyphId}
            onCommit={onCommit}
            onDelete={() => onDraftCommitted(rowId)}
            onDraftCommitted={() => onDraftCommitted(rowId)}
          />
        ))}
      </Box>
    </Stack>
  )
}
