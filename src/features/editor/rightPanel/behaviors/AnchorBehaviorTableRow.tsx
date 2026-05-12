import {
  Badge,
  Box,
  HStack,
  IconButton,
  Input,
  Stack,
  Tooltip,
} from '@chakra-ui/react'
import { Trash } from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  canCommitAnchorBehavior,
  type AnchorBehaviorDraft,
  type AnchorBehaviorRow,
} from 'src/lib/openTypeFeatures'

interface AnchorBehaviorTableRowProps {
  row?: AnchorBehaviorRow
  rowId?: string
  currentGlyphId?: string
  onCommit: (draft: AnchorBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
}

export function AnchorBehaviorTableRow({
  row,
  rowId,
  currentGlyphId = '',
  onCommit,
  onDelete,
  onDraftCommitted,
}: AnchorBehaviorTableRowProps) {
  const [name, setName] = useState(row?.name ?? 'top')
  const [x, setX] = useState(String(row?.x ?? 0))
  const [y, setY] = useState(String(row?.y ?? 700))

  const numericX = Number.parseInt(x, 10)
  const numericY = Number.parseInt(y, 10)
  const draft: AnchorBehaviorDraft = {
    id: row?.id,
    glyphId: row?.glyphId ?? currentGlyphId,
    name,
    x: Number.isFinite(numericX) ? numericX : Number.NaN,
    y: Number.isFinite(numericY) ? numericY : Number.NaN,
  }
  const canCommit = canCommitAnchorBehavior(draft)

  const commit = () => {
    if (!canCommit) return
    onCommit(draft)
    onDraftCommitted?.()
  }

  const commitOnEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.blur()
      }
      commit()
    }
  }

  return (
    <Stack
      spacing={2}
      px={3}
      py={2}
      borderTopWidth={row || rowId ? '1px' : 0}
      borderColor="field.panelMuted"
    >
      <Box
        display="grid"
        gridTemplateColumns="minmax(68px, 1fr) 54px 54px 28px"
        gap={1}
        alignItems="center"
      >
        <Input
          aria-label="Anchor name"
          value={name}
          size="xs"
          placeholder="top"
          onBlur={commit}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <Input
          aria-label="Anchor x"
          value={x}
          size="xs"
          inputMode="numeric"
          onBlur={commit}
          onChange={(event) => setX(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <Input
          aria-label="Anchor y"
          value={y}
          size="xs"
          inputMode="numeric"
          onBlur={commit}
          onChange={(event) => setY(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <Tooltip label="Delete anchor">
          <IconButton
            aria-label="刪除 anchor"
            icon={<Trash width={15} height={15} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            color="field.red.500"
            onClick={onDelete}
          />
        </Tooltip>
      </Box>

      <HStack justify="space-between" align="center">
        <Badge colorScheme={name.startsWith('_') ? 'purple' : 'cyan'}>
          {name.startsWith('_') ? 'Mark' : 'Base'}
        </Badge>
        <HStack spacing={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorScheme="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (name || x || y) ? (
            <Badge colorScheme="red">Invalid Input</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
