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
  AlternateBehaviorDraft,
  AlternateBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { AlternateBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/AlternateBehaviorTableRow'

interface AlternateBehaviorListProps {
  rows: AlternateBehaviorRow[]
  draftRowIds: string[]
  currentGlyphId: string
  onAddDraftRow: () => void
  onCommit: (draft: AlternateBehaviorDraft) => void
  onDelete: (row: AlternateBehaviorRow) => void
  onDraftCommitted: (rowId: string) => void
  onOpenGlyph: (glyphId: string) => void
}

export function AlternateBehaviorList({
  rows,
  draftRowIds,
  currentGlyphId,
  onAddDraftRow,
  onCommit,
  onDelete,
  onDraftCommitted,
  onOpenGlyph,
}: AlternateBehaviorListProps) {
  return (
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            Alternates
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label="Add alternate">
            <IconButton
              aria-label="新增 alternate"
              icon={<PlusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={onAddDraftRow}
            />
          </Tooltip>
          <Tooltip label="Remove the last draft row">
            <IconButton
              aria-label="移除最後一列 alternate 草稿"
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
        <AlternateHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            No alternates for this glyph yet.
          </Text>
        ) : null}
        {rows.map((row) => (
          <AlternateBehaviorTableRow
            key={getAlternateRowKey(row)}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
            onOpenGlyph={onOpenGlyph}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <AlternateBehaviorTableRow
            key={rowId}
            rowId={rowId}
            currentGlyphId={currentGlyphId}
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

function getAlternateRowKey(row: AlternateBehaviorRow) {
  return [
    row.id,
    row.source,
    row.alternate,
    row.type,
    row.featureTag,
    row.sourceLabel,
  ].join(':')
}

function AlternateHeader() {
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
        Default
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        →
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Alternate
      </Text>
    </Box>
  )
}
