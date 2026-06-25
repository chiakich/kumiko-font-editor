import {
  Badge,
  Box,
  Button,
  Collapsible,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Text,
  Stack,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
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
      gap={2}
      px={3}
      py={2}
      borderTopWidth={row || rowId ? '1px' : 0}
      borderColor="field.panelMuted"
    >
      <HStack justify="space-between" align="center">
        <HStack gap={1} minW={0} flex={1}>
          <IconButton
            aria-label={t('editor.expandClassMembers')}
            size="xs"
            variant="ghost"
            disabled={!hasClassMembers}
            onClick={() => setIsExpanded((value) => !value)}
          >
            <NavArrowRight
              width={14}
              height={14}
              aria-hidden="true"
              style={{
                transform: isExpanded ? 'rotate(90deg)' : undefined,
                transition: 'transform 100ms ease',
              }}
            />
          </IconButton>
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
              size="xs"
              variant="ghost"
              disabled={!left || !right}
              onClick={() => openSpacingPair(left, right)}
            >
              <ArrowLeftTag width={14} height={14} aria-hidden="true" />
              {t('editor.edit')}
            </Button>
          ) : null}
        </HStack>
        <HStack gap={1} wrap="wrap" justify="flex-end">
          {row?.sourceLabel ? (
            <Badge variant="subtle" colorPalette="gray">
              {row.sourceLabel}
            </Badge>
          ) : null}
          {row?.status.map((status) => (
            <Badge key={status} colorPalette="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (left || right || value) ? (
            <Badge colorPalette="red">{t('editor.invalidInput')}</Badge>
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
        <HStack gap={0}>
          <IconButton
            aria-label={t('editor.decreaseSpacing')}
            size="xs"
            variant="ghost"
            onClick={() => nudge(-10)}
          >
            <Minus width={14} height={14} aria-hidden="true" />
          </IconButton>
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
            size="xs"
            variant="ghost"
            onClick={() => nudge(10)}
          >
            <Plus width={14} height={14} aria-hidden="true" />
          </IconButton>
        </HStack>
        <Tooltip content={t('editor.deleteSpacingPair')}>
          <IconButton
            aria-label={t('editor.deleteSpacingPair')}
            size="xs"
            variant="ghost"
            color="field.red.500"
            onClick={onDelete}
          >
            <Trash width={15} height={15} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </Box>
      {row ? (
        <Collapsible.Root open={isExpanded}>
          <Collapsible.Content>
            <ClassMembersPanel
              row={row}
              left={left}
              right={right}
              value={Number.isFinite(numericValue) ? numericValue : row.value}
            />
          </Collapsible.Content>
        </Collapsible.Root>
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
      <Text as="span" truncate>
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
      <Text as="span" minW={0} truncate title={leftLabel ?? leftText}>
        {leftText}
      </Text>
      <Text as="span" flexShrink={0} color="field.muted">
        +
      </Text>
      <Text as="span" minW={0} truncate title={rightLabel ?? rightText}>
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
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
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
        <Text fontSize="10px" fontWeight="bold" color="field.muted" truncate>
          {title}
        </Text>
        <Badge size="sm" colorPalette="gray">
          {members.length}
        </Badge>
      </HStack>
      <Stack gap={0} maxH="160px" overflowY="auto">
        {members.map((glyphId) => {
          const pairLeft = side === 'left' ? glyphId : counterpartGlyphId
          const pairRight = side === 'left' ? counterpartGlyphId : glyphId
          return (
            <HStack key={glyphId} gap={1} px={2} py={1} minW={0}>
              <Text fontSize="xs" fontFamily="mono" flex={1} truncate>
                {glyphId}
              </Text>
              <Tooltip content={t('editor.addThisPairToEditor')}>
                <IconButton
                  aria-label={t('editor.addToEditingArea')}
                  size="xs"
                  variant="ghost"
                  onClick={() => openSpacingPair(pairLeft, pairRight)}
                >
                  <ArrowLeftTag width={13} height={13} />
                </IconButton>
              </Tooltip>
              {row.scope === 'classPair' ? (
                <Tooltip content={t('editor.splitMemberOutAsAnIndependent')}>
                  <IconButton
                    aria-label={t('editor.splitMemberOutAsAnIndependent')}
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
                  >
                    <ArrowEmailForward width={13} height={13} />
                  </IconButton>
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
