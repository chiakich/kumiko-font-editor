import {
  Badge,
  Box,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import {
  ArrowRight,
  Check,
  MinusCircle,
  PlusCircle,
  Xmark,
} from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SteppedNumberInput } from 'src/features/common/transform/components/SteppedNumberInput'
import {
  buildKerningGroupMaps,
  describeKerningSelector,
  type KerningGroupMaps,
} from 'src/lib/kerning/resolveKerning'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'
import { getGlyphUnicodeChar } from 'src/lib/glyph/glyphUnicode'
import { useStore, type FontData, type KerningPair } from 'src/store'
import { KerningCard } from 'src/features/editor/rightPanel/kerning/KerningPairInspector'

interface KerningPairListProps {
  fontData: FontData
}

export function KerningPairList({ fontData }: KerningPairListProps) {
  const { t } = useTranslation()

  const upsertKerningPair = useStore((state) => state.upsertKerningPair)
  const deleteKerningPair = useStore((state) => state.deleteKerningPair)
  const setEditorTextState = useStore((state) => state.setEditorTextState)

  const [query, setQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const pairs = useMemo(
    () => fontData.kerningPairs ?? [],
    [fontData.kerningPairs]
  )
  const maps = useMemo(
    () => buildKerningGroupMaps(fontData.kerningGroups),
    [fontData.kerningGroups]
  )

  const filteredPairs = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return pairs
    return pairs.filter((pair) =>
      `${describeKerningSelector(pair.left, maps)} ${describeKerningSelector(pair.right, maps)}`
        .toLowerCase()
        .includes(needle)
    )
  }, [pairs, query, maps])

  const loadPairIntoEditor = (pair: KerningPair) => {
    const representative = (selector: GlyphSelector) =>
      selector.kind === 'glyph'
        ? selector.glyph
        : (maps.groupByReference.get(selector.classId)?.glyphs[0] ?? null)
    const leftGlyphId = representative(pair.left)
    const rightGlyphId = representative(pair.right)
    if (!leftGlyphId || !rightGlyphId) return

    const glyphIds = [leftGlyphId, rightGlyphId]
    const text = glyphIds
      .map((glyphId) => getGlyphUnicodeChar(fontData.glyphs[glyphId]) ?? '')
      .join('')
    setEditorTextState(text, glyphIds, 2, 1)
  }

  return (
    <KerningCard
      title={t('editor.kerningPairs')}
      actions={
        <HStack gap={1}>
          <Badge colorPalette="gray">{pairs.length}</Badge>
          <Tooltip content={t('editor.kerningAddPair')}>
            <IconButton
              aria-label={t('editor.kerningAddPair')}
              size="xs"
              variant="ghost"
              onClick={() => setIsAdding(true)}
            >
              <PlusCircle width={16} height={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </HStack>
      }
    >
      <Box px={3} py={2} borderBottomWidth="1px" borderColor="border">
        <Input
          size="xs"
          value={query}
          placeholder={t('editor.kerningSearchPairs')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Box>
      {isAdding ? (
        <KerningPairDraftRow
          fontData={fontData}
          maps={maps}
          onCommit={(left, right, value) => {
            upsertKerningPair(left, right, value)
            setIsAdding(false)
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : null}
      <Box maxH="260px" overflowY="auto">
        {filteredPairs.length === 0 && !isAdding ? (
          <Text fontSize="xs" color="mutedForeground" px={3} py={3}>
            {pairs.length === 0
              ? t('editor.kerningNoPairs')
              : t('editor.kerningNoMatchingPairs')}
          </Text>
        ) : null}
        {filteredPairs.map((pair, index) => (
          <KerningPairRow
            key={
              pair.id ??
              `${index}-${describeKerningSelector(pair.left, maps)}-${describeKerningSelector(pair.right, maps)}`
            }
            pair={pair}
            maps={maps}
            onValueCommit={(value) =>
              upsertKerningPair(pair.left, pair.right, value)
            }
            onDelete={() => deleteKerningPair(pair.left, pair.right)}
            onLoad={() => loadPairIntoEditor(pair)}
          />
        ))}
      </Box>
    </KerningCard>
  )
}

function KerningPairRow({
  pair,
  maps,
  onValueCommit,
  onDelete,
  onLoad,
}: {
  pair: KerningPair
  maps: KerningGroupMaps
  onValueCommit: (value: number) => void
  onDelete: () => void
  onLoad: () => void
}) {
  const { t } = useTranslation()
  const [draftValue, setDraftValue] = useState<string | null>(null)

  const commit = (value: number) => {
    if (Number.isFinite(value)) {
      onValueCommit(Math.round(value))
    }
    setDraftValue(null)
  }

  return (
    <Box
      display="grid"
      gridTemplateColumns="1fr 1fr 80px 24px 24px"
      gap={1}
      px={3}
      py={1}
      alignItems="center"
      borderBottomWidth="1px"
      borderColor="border"
      _last={{ borderBottomWidth: 0 }}
    >
      <Text fontSize="xs" fontFamily="mono" truncate>
        {describeKerningSelector(pair.left, maps)}
      </Text>
      <Text fontSize="xs" fontFamily="mono" truncate>
        {describeKerningSelector(pair.right, maps)}
      </Text>
      <SteppedNumberInput
        value={draftValue ?? String(pair.value)}
        onChange={setDraftValue}
        onBlur={() => {
          if (draftValue !== null) commit(Number(draftValue))
        }}
        onStep={(delta) =>
          commit(
            (draftValue !== null ? Number(draftValue) : pair.value) + delta
          )
        }
      />
      <Tooltip content={t('editor.addThisPairToEditor')}>
        <IconButton
          aria-label={t('editor.addThisPairToEditor')}
          size="xs"
          variant="ghost"
          onClick={onLoad}
        >
          <ArrowRight width={14} height={14} aria-hidden="true" />
        </IconButton>
      </Tooltip>
      <Tooltip content={t('editor.kerningDeletePair')}>
        <IconButton
          aria-label={t('editor.kerningDeletePair')}
          size="xs"
          variant="ghost"
          onClick={onDelete}
        >
          <MinusCircle width={14} height={14} aria-hidden="true" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

// Accepts a glyph name, or a group as "@name" / group name.
function parseSelectorInput(
  input: string,
  fontData: FontData,
  maps: KerningGroupMaps,
  side: 'left' | 'right'
): GlyphSelector | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const group = maps.groupByReference.get(trimmed)
  if (group && group.side === side) {
    return { kind: 'class', classId: group.id }
  }
  if (!trimmed.startsWith('@') && fontData.glyphs[trimmed]) {
    return { kind: 'glyph', glyph: trimmed }
  }
  return null
}

function KerningPairDraftRow({
  fontData,
  maps,
  onCommit,
  onCancel,
}: {
  fontData: FontData
  maps: KerningGroupMaps
  onCommit: (left: GlyphSelector, right: GlyphSelector, value: number) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [leftInput, setLeftInput] = useState('')
  const [rightInput, setRightInput] = useState('')
  const [valueInput, setValueInput] = useState('0')

  const left = parseSelectorInput(leftInput, fontData, maps, 'left')
  const right = parseSelectorInput(rightInput, fontData, maps, 'right')
  const value = Number(valueInput)
  const canCommit = left !== null && right !== null && Number.isFinite(value)

  return (
    <Stack gap={1} px={3} py={2} borderBottomWidth="1px" borderColor="border">
      <Box display="grid" gridTemplateColumns="1fr 1fr 64px" gap={1}>
        <Input
          size="xs"
          value={leftInput}
          placeholder={t('editor.kerningLeftSelectorPlaceholder')}
          borderColor={leftInput && !left ? 'red.500' : undefined}
          onChange={(event) => setLeftInput(event.target.value)}
        />
        <Input
          size="xs"
          value={rightInput}
          placeholder={t('editor.kerningRightSelectorPlaceholder')}
          borderColor={rightInput && !right ? 'red.500' : undefined}
          onChange={(event) => setRightInput(event.target.value)}
        />
        <Input
          size="xs"
          inputMode="decimal"
          value={valueInput}
          onChange={(event) => setValueInput(event.target.value)}
        />
      </Box>
      <HStack justify="flex-end" gap={1}>
        <IconButton
          aria-label={t('editor.kerningAddPair')}
          size="xs"
          variant="ghost"
          disabled={!canCommit}
          onClick={() => {
            if (left && right) onCommit(left, right, Math.round(value))
          }}
        >
          <Check width={14} height={14} aria-hidden="true" />
        </IconButton>
        <IconButton
          aria-label={t('editor.cancel')}
          size="xs"
          variant="ghost"
          onClick={onCancel}
        >
          <Xmark width={14} height={14} aria-hidden="true" />
        </IconButton>
      </HStack>
    </Stack>
  )
}
