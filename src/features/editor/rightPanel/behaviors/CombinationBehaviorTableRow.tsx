import { Badge, Box, HStack, IconButton, Input, Stack } from '@chakra-ui/react'
import { NativeSelect } from '@/components/ui/native-select'
import { Tooltip } from '@/components/ui/tooltip'
import { NavArrowRight, Trash } from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  COMBINATION_BEHAVIOR_TYPE_LABELS,
  COMBINATION_BEHAVIOR_TYPES,
  canCommitCombinationBehavior,
  resolveCombinationFeatureTag,
  suggestCombinationOutput,
  type CombinationBehaviorDraft,
  type CombinationBehaviorRow,
  type CombinationBehaviorType,
} from 'src/lib/openTypeFeatures'
import { useOpenGlyphInEditor } from 'src/features/editor/rightPanel/behaviors/useOpenBehaviorGlyphs'
import { useTranslation } from 'react-i18next'

interface CombinationBehaviorTableRowProps {
  row?: CombinationBehaviorRow
  rowId?: string
  onCommit: (draft: CombinationBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
}

export function CombinationBehaviorTableRow({
  row,
  rowId,
  onCommit,
  onDelete,
  onDraftCommitted,
}: CombinationBehaviorTableRowProps) {
  const { t } = useTranslation()
  const openGlyph = useOpenGlyphInEditor()

  const [input, setInput] = useState(row?.input ?? '')
  const [output, setOutput] = useState(row?.output ?? '')
  const [type, setType] = useState<CombinationBehaviorType>(
    row?.type ?? 'standardLigature'
  )
  const [customFeatureTag, setCustomFeatureTag] = useState(
    row?.type === 'customFeature' ? row.featureTag : ''
  )
  const [outputEdited, setOutputEdited] = useState(Boolean(row?.output))

  const draft: CombinationBehaviorDraft = {
    lookupId: row?.lookupId,
    ruleId: row?.ruleId,
    input,
    output,
    type,
    customFeatureTag,
  }
  const canCommit = canCommitCombinationBehavior(draft)

  const commit = () => {
    if (!canCommit) return
    onCommit(draft)
    onDraftCommitted?.()
  }

  const updateInput = (value: string) => {
    const shouldSuggestOutput =
      !outputEdited || output === suggestCombinationOutput(input)
    setInput(value)
    if (shouldSuggestOutput) {
      setOutput(suggestCombinationOutput(value))
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
      borderColor="muted"
    >
      <Box
        display="grid"
        gridTemplateColumns="minmax(76px, 1fr) 14px minmax(76px, 1fr) 28px 28px"
        gap={1}
        alignItems="center"
      >
        <Input
          aria-label={t('editor.combinationInputSequence')}
          value={input}
          size="xs"
          placeholder="f+t"
          onBlur={commit}
          onChange={(event) => updateInput(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <NavArrowRight width={14} height={14} aria-hidden="true" />
        <Input
          aria-label={t('editor.combinationOutputGlyph')}
          value={output}
          size="xs"
          placeholder="f_t"
          onBlur={commit}
          onChange={(event) => {
            setOutputEdited(true)
            setOutput(event.target.value)
          }}
          onKeyDown={commitOnEnter}
        />
        <Tooltip content={t('editor.openOutputGlyph')}>
          <IconButton
            aria-label={t('editor.openOutputGlyph')}
            size="xs"
            variant="ghost"
            disabled={!output}
            onClick={() => openGlyph(output)}
          >
            <NavArrowRight width={15} height={15} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('editor.deleteBehavior')}>
          <IconButton
            aria-label={t('editor.deleteCombination')}
            size="xs"
            variant="ghost"
            color="destructive"
            onClick={onDelete}
          >
            <Trash width={15} height={15} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        display="grid"
        gridTemplateColumns={
          type === 'customFeature' ? 'minmax(0, 1fr) 64px' : 'minmax(0, 1fr)'
        }
        gap={1}
      >
        <NativeSelect
          size="xs"
          fieldProps={{
            'aria-label': t('editor.combinationBehaviorType'),
            value: type,
            onBlur: commit,
            onChange: (event) => {
              const nextType = event.target.value as CombinationBehaviorType
              setType(nextType)
              if (nextType !== 'customFeature') {
                setCustomFeatureTag('')
              }
            },
          }}
        >
          {COMBINATION_BEHAVIOR_TYPES.map((behaviorType) => (
            <option key={behaviorType} value={behaviorType}>
              {COMBINATION_BEHAVIOR_TYPE_LABELS[behaviorType]}
            </option>
          ))}
        </NativeSelect>
        {type === 'customFeature' ? (
          <Input
            aria-label={t('editor.customFeatureTag')}
            value={customFeatureTag}
            size="xs"
            maxLength={4}
            placeholder={t('editor.xxxx')}
            onBlur={commit}
            onChange={(event) => setCustomFeatureTag(event.target.value)}
            onKeyDown={commitOnEnter}
          />
        ) : null}
      </Box>
      <HStack gap={1} justify="space-between" align="flex-start">
        <HStack gap={1} wrap="wrap">
          {row?.sourceLabel ? (
            <Badge variant="subtle" colorPalette="gray">
              {row.sourceLabel}
            </Badge>
          ) : null}
          {type === 'customFeature' ? (
            <Badge variant="subtle" colorPalette="gray">
              {resolveCombinationFeatureTag(draft) || 'tag'}
            </Badge>
          ) : null}
        </HStack>
        <HStack gap={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorPalette="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (input || output) ? (
            <Badge colorPalette="red">{t('editor.invalidInput')}</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
