import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Text,
  Stack,
  Tooltip,
} from '@chakra-ui/react'
import { Minus, Plus, Trash, View360 } from 'iconoir-react'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  canCommitSpacingBehavior,
  type SpacingBehaviorDraft,
  type SpacingBehaviorRow,
} from 'src/lib/openTypeFeatures'

interface SpacingBehaviorTableRowProps {
  row?: SpacingBehaviorRow
  rowId?: string
  currentGlyphId?: string
  onCommit: (draft: SpacingBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
  onOpenPair: (left: string, right: string) => void
}

export function SpacingBehaviorTableRow({
  row,
  rowId,
  currentGlyphId = '',
  onCommit,
  onDelete,
  onDraftCommitted,
  onOpenPair,
}: SpacingBehaviorTableRowProps) {
  const [left, setLeft] = useState(row?.left ?? currentGlyphId)
  const [right, setRight] = useState(row?.right ?? '')
  const [value, setValue] = useState(String(row?.value ?? -40))

  useEffect(() => {
    setLeft(row?.left ?? currentGlyphId)
    setRight(row?.right ?? '')
    setValue(String(row?.value ?? -40))
  }, [currentGlyphId, row?.left, row?.right, row?.value])

  const numericValue = Number.parseInt(value, 10)
  const draft: SpacingBehaviorDraft = {
    lookupId: row?.lookupId,
    ruleId: row?.ruleId,
    left,
    right,
    value: Number.isFinite(numericValue) ? numericValue : Number.NaN,
  }
  const canCommit = canCommitSpacingBehavior(draft)

  const commit = () => {
    if (!canCommit) return
    onCommit(draft)
    onDraftCommitted?.()
  }

  const nudge = (delta: number) => {
    const nextValue = (Number.isFinite(numericValue) ? numericValue : 0) + delta
    setValue(String(nextValue))
    const nextDraft = { ...draft, value: nextValue }
    if (canCommitSpacingBehavior(nextDraft)) {
      onCommit(nextDraft)
      onDraftCommitted?.()
    }
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
        gridTemplateColumns="minmax(48px, 1fr) minmax(48px, 1fr) 96px 28px"
        gap={1}
        alignItems="center"
      >
        <Box
          minH={7}
          px={2}
          display="flex"
          alignItems="center"
          bg="field.panelMuted"
          borderRadius="2px"
          fontFamily="mono"
          fontSize="xs"
        >
          <Text as="span" isTruncated>
            {left || 'Left'}
          </Text>
        </Box>
        <Input
          aria-label="Spacing right glyph"
          value={right}
          size="xs"
          placeholder="V"
          onBlur={commit}
          onChange={(event) => setRight(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <HStack spacing={0}>
          <IconButton
            aria-label="Decrease spacing"
            icon={<Minus width={14} height={14} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            onClick={() => nudge(-10)}
          />
          <Input
            aria-label="Spacing value"
            value={value}
            size="xs"
            inputMode="numeric"
            textAlign="center"
            onBlur={commit}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <IconButton
            aria-label="Increase spacing"
            icon={<Plus width={14} height={14} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            onClick={() => nudge(10)}
          />
        </HStack>
        <Tooltip label="Delete spacing pair">
          <IconButton
            aria-label="刪除 spacing pair"
            icon={<Trash width={15} height={15} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            color="field.red.500"
            onClick={onDelete}
          />
        </Tooltip>
      </Box>

      <HStack justify="space-between" align="center">
        <HStack spacing={1}>
          <Box
            px={2}
            py={1}
            bg="field.panelMuted"
            borderRadius="2px"
            fontFamily="mono"
            fontSize="xs"
          >
            {left || 'Left'}
            {right || 'Right'}
          </Box>
          <Button
            aria-label="Add spacing pair to editor"
            leftIcon={<View360 width={14} height={14} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            isDisabled={!left || !right}
            onClick={() => onOpenPair(left, right)}
          >
            Edit
          </Button>
        </HStack>
        <HStack spacing={1} wrap="wrap" justify="flex-end">
          {row?.sourceLabel ? (
            <Badge variant="subtle" colorScheme="gray">
              {row.sourceLabel}
            </Badge>
          ) : null}
          {row?.status.map((status) => (
            <Badge key={status} colorScheme="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (left || right || value) ? (
            <Badge colorScheme="red">Invalid Input</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
