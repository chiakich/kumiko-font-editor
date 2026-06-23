import {
  Badge,
  Box,
  Button,
  Collapse,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Text,
  Stack,
  Tooltip,
} from '@chakra-ui/react'
import {
  Minus,
  Plus,
  Trash,
  ArrowLeftTag,
  NavArrowRight,
  ArrowEmailForward,
} from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  canCommitSpacingBehavior,
  type SpacingBehaviorDraft,
  type SpacingBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { useOpenSpacingPairInEditor } from 'src/features/editor/rightPanel/behaviors/useOpenBehaviorGlyphs'
import { useStore } from 'src/store'
import { useTranslation } from 'react-i18next'

interface SpacingBehaviorTableRowProps {
  row?: SpacingBehaviorRow
  rowId?: string
  side: 'left' | 'right'
  currentGlyphId?: string
  onCommit: (draft: SpacingBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
}

export function SpacingBehaviorTableRow({
  row,
  rowId,
  side,
  currentGlyphId = '',
  onCommit,
  onDelete,
  onDraftCommitted,
}: SpacingBehaviorTableRowProps) {
  const { t } = useTranslation()
  const openSpacingPair = useOpenSpacingPairInEditor()

  const [editableGlyph, setEditableGlyph] = useState(
    getInitialEditableGlyph(row, side)
  )
  const [value, setValue] = useState(String(row?.value ?? -40))
  const [isExpanded, setIsExpanded] = useState(false)

  const numericValue = Number.parseInt(value, 10)
  const left = side === 'left' ? editableGlyph : currentGlyphId
  const right = side === 'left' ? currentGlyphId : editableGlyph
  const draft: SpacingBehaviorDraft = {
    lookupId: row?.lookupId,
    ruleId: row?.ruleId,
    left,
    right,
    leftSelector: row?.leftSelector,
    rightSelector: row?.rightSelector,
    value: Number.isFinite(numericValue) ? numericValue : Number.NaN,
  }
  const canCommit = canCommitSpacingBehavior(draft)
  const isClassPair = row?.scope === 'classPair'
  const hasClassMembers = Boolean(row?.leftClass || row?.rightClass)
  const hasChanges = row ? !isSameSpacingDraft(row, draft) : true

  const commit = () => {
    if (!canCommit) return
    if (!hasChanges) return
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
      <HStack justify="space-between" align="center">
        <HStack spacing={1} minW={0} flex={1}>
          <IconButton
            aria-label={t('editor.expandClassMembers')}
            icon={
              <NavArrowRight
                width={14}
                height={14}
                aria-hidden="true"
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : undefined,
                  transition: 'transform 100ms ease',
                }}
              />
            }
            size="xs"
            variant="ghost"
            isDisabled={!hasClassMembers}
            onClick={() => setIsExpanded((value) => !value)}
          />
          <PairLabel
            left={left}
            right={right}
            leftLabel={row?.leftLabel}
            rightLabel={row?.rightLabel}
            isClassPair={isClassPair}
          />
          {!isClassPair ? (
            <Button
              aria-label={t('editor.addSpacingPairToEditor')}
              leftIcon={
                <ArrowLeftTag width={14} height={14} aria-hidden="true" />
              }
              size="xs"
              variant="ghost"
              isDisabled={!left || !right}
              onClick={() => openSpacingPair(left, right)}
            >
              {t('editor.edit')}
            </Button>
          ) : null}
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
            <Badge colorScheme="red">{t('editor.invalidInput')}</Badge>
          ) : null}
        </HStack>
      </HStack>

      <Box
        display="grid"
        gridTemplateColumns="minmax(48px, 1fr) minmax(48px, 1fr) 96px 28px"
        gap={1}
        alignItems="center"
      >
        {side === 'left' && !isClassPair ? (
          <Input
            aria-label={t('editor.spacingLeftGlyph')}
            value={editableGlyph}
            size="xs"
            placeholder="V"
            onBlur={commit}
            onChange={(event) => setEditableGlyph(event.target.value)}
            onKeyDown={commitOnEnter}
          />
        ) : (
          <FixedGlyphCell label={(row?.leftLabel ?? left) || 'Left'} />
        )}
        {side === 'left' || isClassPair ? (
          <FixedGlyphCell label={(row?.rightLabel ?? right) || 'Right'} />
        ) : (
          <Input
            aria-label={t('editor.spacingRightGlyph')}
            value={editableGlyph}
            size="xs"
            placeholder="V"
            onBlur={commit}
            onChange={(event) => setEditableGlyph(event.target.value)}
            onKeyDown={commitOnEnter}
          />
        )}
        <HStack spacing={0}>
          <IconButton
            aria-label={t('editor.decreaseSpacing')}
            icon={<Minus width={14} height={14} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            onClick={() => nudge(-10)}
          />
          <Input
            aria-label={t('editor.spacingValue')}
            value={value}
            size="xs"
            inputMode="numeric"
            textAlign="center"
            onBlur={commit}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <IconButton
            aria-label={t('editor.increaseSpacing')}
            icon={<Plus width={14} height={14} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            onClick={() => nudge(10)}
          />
        </HStack>
        <Tooltip label={t('editor.deleteSpacingPair')}>
          <IconButton
            aria-label={t('editor.deleteSpacingPair')}
            icon={<Trash width={15} height={15} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            color="field.red.500"
            onClick={onDelete}
          />
        </Tooltip>
      </Box>
      {row ? (
        <Collapse in={isExpanded} animateOpacity>
          <ClassMembersPanel
            row={row}
            left={left}
            right={right}
            value={Number.isFinite(numericValue) ? numericValue : row.value}
          />
        </Collapse>
      ) : null}
    </Stack>
  )
}

function isSameSpacingDraft(
  row: SpacingBehaviorRow,
  draft: SpacingBehaviorDraft
) {
  return (
    row.left === draft.left.trim() &&
    row.right === draft.right.trim() &&
    row.value === Math.round(draft.value)
  )
}

function FixedGlyphCell({ label }: { label: string }) {
  return (
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
        {label}
      </Text>
    </Box>
  )
}

function PairLabel({
  left,
  right,
  leftLabel,
  rightLabel,
  isClassPair,
}: {
  left: string
  right: string
  leftLabel?: string
  rightLabel?: string
  isClassPair: boolean
}) {
  const { t } = useTranslation()

  const leftText = formatCompactPairLabel(leftLabel, left)
  const rightText = formatCompactPairLabel(rightLabel, right)

  return (
    <Box
      minW={0}
      maxW="100%"
      px={2}
      py={1}
      bg="field.panelMuted"
      borderRadius="2px"
      fontFamily="mono"
      fontSize="xs"
      display="flex"
      alignItems="center"
      gap={1}
    >
      <Text as="span" minW={0} isTruncated title={leftLabel ?? leftText}>
        {leftText}
      </Text>
      <Text as="span" flexShrink={0} color="field.muted">
        +
      </Text>
      <Text as="span" minW={0} isTruncated title={rightLabel ?? rightText}>
        {rightText}
      </Text>
      {isClassPair ? (
        <Text as="span" flexShrink={0} color="field.muted">
          {t('editor.class')}
        </Text>
      ) : null}
    </Box>
  )
}

function formatCompactPairLabel(label: string | undefined, fallback: string) {
  if (!label) return fallback
  return label.replace(/\s*\(\d+\)\s*$/, '')
}

function ClassMembersPanel({
  row,
  left,
  right,
  value,
}: {
  row: SpacingBehaviorRow
  left: string
  right: string
  value: number
}) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
      <ClassMemberList
        title={row.leftLabel ?? left}
        side="left"
        members={row.leftClass?.glyphs ?? [left]}
        counterpartGlyphId={right}
        row={row}
        value={value}
      />
      <ClassMemberList
        title={row.rightLabel ?? right}
        side="right"
        members={row.rightClass?.glyphs ?? [right]}
        counterpartGlyphId={left}
        row={row}
        value={value}
      />
    </SimpleGrid>
  )
}

function ClassMemberList({
  title,
  side,
  members,
  counterpartGlyphId,
  row,
  value,
}: {
  title: string
  side: 'left' | 'right'
  members: string[]
  counterpartGlyphId: string
  row: SpacingBehaviorRow
  value: number
}) {
  const { t } = useTranslation()
  const openSpacingPair = useOpenSpacingPairInEditor()
  const splitSpacingClassMember = useStore(
    (state) => state.splitSpacingClassMember
  )

  return (
    <Box borderWidth="1px" borderColor="field.line" bg="field.panelMuted">
      <HStack px={2} py={1} justify="space-between">
        <Text fontSize="10px" fontWeight="bold" color="field.muted" isTruncated>
          {title}
        </Text>
        <Badge size="sm" colorScheme="gray">
          {members.length}
        </Badge>
      </HStack>
      <Stack spacing={0} maxH="160px" overflowY="auto">
        {members.map((glyphId) => {
          const pairLeft = side === 'left' ? glyphId : counterpartGlyphId
          const pairRight = side === 'left' ? counterpartGlyphId : glyphId
          return (
            <HStack key={glyphId} spacing={1} px={2} py={1} minW={0}>
              <Text fontSize="xs" fontFamily="mono" flex={1} isTruncated>
                {glyphId}
              </Text>
              <Tooltip label={t('editor.addThisPairToEditor')}>
                <IconButton
                  aria-label={t('editor.addToEditingArea')}
                  icon={<ArrowLeftTag width={13} height={13} />}
                  size="xs"
                  variant="ghost"
                  onClick={() => openSpacingPair(pairLeft, pairRight)}
                />
              </Tooltip>
              {row.scope === 'classPair' ? (
                <Tooltip label={t('editor.splitMemberOutAsAnIndependent')}>
                  <IconButton
                    aria-label={t('editor.splitMemberOutAsAnIndependent')}
                    icon={<ArrowEmailForward width={13} height={13} />}
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      splitSpacingClassMember({
                        lookupId: row.lookupId,
                        ruleId: row.ruleId,
                        side,
                        glyphId,
                        counterpartGlyphId,
                        value,
                      })
                    }
                  />
                </Tooltip>
              ) : null}
            </HStack>
          )
        })}
      </Stack>
    </Box>
  )
}

function getInitialEditableGlyph(
  row: SpacingBehaviorRow | undefined,
  side: 'left' | 'right'
) {
  if (!row) return ''
  return side === 'left' ? row.left : row.right
}
