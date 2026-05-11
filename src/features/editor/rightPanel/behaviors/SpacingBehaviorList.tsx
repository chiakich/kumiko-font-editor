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
  draftRowIds: string[]
  currentGlyphId: string
  onAddDraftRow: () => void
  onCommit: (draft: SpacingBehaviorDraft) => void
  onDelete: (row: SpacingBehaviorRow) => void
  onDraftCommitted: (rowId: string) => void
}

export function SpacingBehaviorList({
  rows,
  draftRowIds,
  currentGlyphId,
  onAddDraftRow,
  onCommit,
  onDelete,
  onDraftCommitted,
}: SpacingBehaviorListProps) {
  return (
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            Spacing
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label="Add spacing pair">
            <IconButton
              aria-label="新增 spacing pair"
              icon={<PlusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={onAddDraftRow}
            />
          </Tooltip>
          <Tooltip label="Remove the last draft row">
            <IconButton
              aria-label="移除最後一列 spacing 草稿"
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
        <SpacingHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            No spacing pairs for this glyph yet.
          </Text>
        ) : null}
        {rows.map((row) => (
          <SpacingBehaviorTableRow
            key={row.id}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <SpacingBehaviorTableRow
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

function SpacingHeader() {
  return (
    <Box
      display="grid"
      gridTemplateColumns="minmax(48px, 1fr) minmax(48px, 1fr) 70px"
      gap={1}
      px={3}
      py={2}
      bg="field.panelMuted"
      borderBottomWidth="1px"
      borderColor="field.line"
    >
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Left
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Right
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Value
      </Text>
    </Box>
  )
}
