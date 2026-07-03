import { Badge, Box, HStack, IconButton, Input, Stack } from '@chakra-ui/react'
import { NativeSelect } from '@/components/ui/native-select'
import { Tooltip } from '@/components/ui/tooltip'
import { NavArrowRight, Trash } from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  ALTERNATE_BEHAVIOR_TYPE_LABELS,
  ALTERNATE_BEHAVIOR_TYPES,
  canCommitAlternateBehavior,
  resolveAlternateFeatureTag,
  suggestAlternateGlyphName,
  type AlternateBehaviorDraft,
  type AlternateBehaviorRow,
  type AlternateBehaviorType,
} from 'src/lib/openTypeFeatures'
import { useOpenGlyphInEditor } from 'src/features/editor/rightPanel/behaviors/useOpenBehaviorGlyphs'
import { useTranslation } from 'react-i18next'

interface AlternateBehaviorTableRowProps {
  row?: AlternateBehaviorRow
  rowId?: string
  currentGlyphId?: string
  onCommit: (draft: AlternateBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
}

export function AlternateBehaviorTableRow({
  row,
  rowId,
  currentGlyphId = '',
  onCommit,
  onDelete,
  onDraftCommitted,
}: AlternateBehaviorTableRowProps) {
  const { t } = useTranslation()
  const openGlyph = useOpenGlyphInEditor()

  const [source, setSource] = useState(row?.source ?? currentGlyphId)
  const [alternate, setAlternate] = useState(
    row?.alternate ?? suggestAlternateGlyphName(currentGlyphId)
  )
  const [type, setType] = useState<AlternateBehaviorType>(
    row?.type ?? 'stylisticAlternate'
  )
  const [customFeatureTag, setCustomFeatureTag] = useState(
    row?.type === 'customFeature' ? row.featureTag : ''
  )
  const [alternateEdited, setAlternateEdited] = useState(
    Boolean(row?.alternate)
  )

  const draft: AlternateBehaviorDraft = {
    lookupId: row?.lookupId,
    ruleId: row?.ruleId,
    source,
    alternate,
    type,
    customFeatureTag,
  }
  const canCommit = canCommitAlternateBehavior(draft)

  const commit = () => {
    if (!canCommit) return
    onCommit(draft)
    onDraftCommitted?.()
  }

  const updateSource = (value: string) => {
    const shouldSuggestAlternate =
      !alternateEdited || alternate === suggestAlternateGlyphName(source)
    setSource(value)
    if (shouldSuggestAlternate) {
      setAlternate(suggestAlternateGlyphName(value))
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
          aria-label={t('editor.alternateSourceGlyph')}
          value={source}
          size="xs"
          placeholder="f"
          onBlur={commit}
          onChange={(event) => updateSource(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <NavArrowRight width={14} height={14} aria-hidden="true" />
        <Input
          aria-label={t('editor.alternateGlyph')}
          value={alternate}
          size="xs"
          placeholder="f.alt"
          onBlur={commit}
          onChange={(event) => {
            setAlternateEdited(true)
            setAlternate(event.target.value)
          }}
          onKeyDown={commitOnEnter}
        />
        <Tooltip content={t('editor.openAlternateGlyph')}>
          <IconButton
            aria-label={t('editor.openAlternateGlyph')}
            size="xs"
            variant="ghost"
            disabled={!alternate}
            onClick={() => openGlyph(alternate)}
          >
            <NavArrowRight width={15} height={15} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('editor.deleteBehavior')}>
          <IconButton
            aria-label={t('editor.deleteAlternate')}
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
            'aria-label': t('editor.alternateBehaviorType'),
            value: type,
            onBlur: commit,
            onChange: (event) => {
              const nextType = event.target.value as AlternateBehaviorType
              setType(nextType)
              if (nextType !== 'customFeature') {
                setCustomFeatureTag('')
              }
            },
          }}
        >
          {ALTERNATE_BEHAVIOR_TYPES.map((behaviorType) => (
            <option key={behaviorType} value={behaviorType}>
              {ALTERNATE_BEHAVIOR_TYPE_LABELS[behaviorType]}
            </option>
          ))}
        </NativeSelect>
        {type === 'customFeature' ? (
          <Input
            aria-label={t('editor.customAlternateFeatureTag')}
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
              {resolveAlternateFeatureTag(draft) || 'tag'}
            </Badge>
          ) : null}
        </HStack>
        <HStack gap={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorPalette="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (source || alternate) ? (
            <Badge colorPalette="red">{t('editor.invalidInput')}</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
