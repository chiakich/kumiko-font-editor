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
  AnchorBehaviorDraft,
  AnchorBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { AnchorBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/AnchorBehaviorTableRow'

interface AnchorBehaviorListProps {
  rows: AnchorBehaviorRow[]
  draftRowIds: string[]
  currentGlyphId: string
  onAddDraftRow: () => void
  onCommit: (draft: AnchorBehaviorDraft) => void
  onDelete: (row: AnchorBehaviorRow) => void
  onDraftCommitted: (rowId: string) => void
}

export function AnchorBehaviorList({
  rows,
  draftRowIds,
  currentGlyphId,
  onAddDraftRow,
  onCommit,
  onDelete,
  onDraftCommitted,
}: AnchorBehaviorListProps) {
  return (
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            Anchors
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label="Add anchor">
            <IconButton
              aria-label="新增 anchor"
              icon={<PlusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={onAddDraftRow}
            />
          </Tooltip>
          <Tooltip label="Remove the last draft row">
            <IconButton
              aria-label="移除最後一列 anchor 草稿"
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
        <AnchorHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            No anchors for this glyph yet.
          </Text>
        ) : null}
        {rows.map((row) => (
          <AnchorBehaviorTableRow
            key={row.id}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <AnchorBehaviorTableRow
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

function AnchorHeader() {
  return (
    <Box
      display="grid"
      gridTemplateColumns="minmax(68px, 1fr) 54px 54px 52px"
      gap={1}
      px={3}
      py={2}
      bg="field.panelMuted"
      borderBottomWidth="1px"
      borderColor="field.line"
    >
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Name
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        X
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Y
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Type
      </Text>
    </Box>
  )
}
