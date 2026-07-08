import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import {
  MinusCircle,
  NavArrowDown,
  NavArrowRight,
  PlusCircle,
  WarningTriangle,
} from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { findDuplicateMembershipGlyphs } from 'src/lib/kerning/resolveKerning'
import { useStore, type FontData, type KerningGroup } from 'src/store'
import { KerningCard } from 'src/features/editor/rightPanel/kerning/KerningPairInspector'

interface KerningGroupManagerProps {
  fontData: FontData
}

export function KerningGroupManager({ fontData }: KerningGroupManagerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const groups = fontData.kerningGroups ?? []

  const filterGroups = (side: 'left' | 'right') => {
    const needle = query.trim().toLowerCase()
    return groups.filter(
      (group) =>
        group.side === side &&
        (!needle ||
          group.name.toLowerCase().includes(needle) ||
          group.glyphs.some((glyph) => glyph.toLowerCase().includes(needle)))
    )
  }

  return (
    <KerningCard
      title={t('editor.kerningGroups')}
      actions={<Badge colorPalette="gray">{groups.length}</Badge>}
    >
      <Box px={3} py={2} borderBottomWidth="1px" borderColor="border">
        <Input
          size="xs"
          value={query}
          placeholder={t('editor.kerningSearchGroups')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Box>
      <Stack gap={0}>
        <KerningGroupSection
          side="left"
          title={t('editor.kerningLeftGroups')}
          groups={filterGroups('left')}
          allGroups={groups}
        />
        <KerningGroupSection
          side="right"
          title={t('editor.kerningRightGroups')}
          groups={filterGroups('right')}
          allGroups={groups}
        />
      </Stack>
    </KerningCard>
  )
}

function KerningGroupSection({
  side,
  title,
  groups,
  allGroups,
}: {
  side: 'left' | 'right'
  title: string
  groups: KerningGroup[]
  allGroups: KerningGroup[]
}) {
  const { t } = useTranslation()
  const upsertKerningGroup = useStore((state) => state.upsertKerningGroup)
  const [isAdding, setIsAdding] = useState(false)

  const duplicates = useMemo(
    () => findDuplicateMembershipGlyphs(allGroups, side),
    [allGroups, side]
  )

  return (
    <Box>
      <HStack
        justify="space-between"
        px={3}
        py={2}
        bg="muted"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <HStack gap={2}>
          <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
            {title}
          </Text>
          <Badge colorPalette="gray">{groups.length}</Badge>
          {duplicates.size > 0 ? (
            <Tooltip
              content={t('editor.kerningDuplicateMembership', {
                glyphs: [...duplicates.keys()].join(', '),
              })}
            >
              <Box color="orange.500" display="inline-flex">
                <WarningTriangle width={12} height={12} aria-hidden="true" />
              </Box>
            </Tooltip>
          ) : null}
        </HStack>
        <Tooltip content={t('editor.kerningAddGroup')}>
          <IconButton
            aria-label={t('editor.kerningAddGroup')}
            size="xs"
            variant="ghost"
            onClick={() => setIsAdding(true)}
          >
            <PlusCircle width={14} height={14} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </HStack>
      {isAdding ? (
        <KerningGroupEditor
          onCommit={(name, glyphs) => {
            upsertKerningGroup({ side, name, glyphs })
            setIsAdding(false)
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : null}
      {groups.length === 0 && !isAdding ? (
        <Text fontSize="xs" color="mutedForeground" px={3} py={2}>
          {t('editor.kerningNoGroups')}
        </Text>
      ) : null}
      <Box maxH="220px" overflowY="auto">
        {groups.map((group) => (
          <KerningGroupRow
            key={group.id}
            group={group}
            hasDuplicates={group.glyphs.some((glyph) => duplicates.has(glyph))}
          />
        ))}
      </Box>
    </Box>
  )
}

function KerningGroupRow({
  group,
  hasDuplicates,
}: {
  group: KerningGroup
  hasDuplicates: boolean
}) {
  const { t } = useTranslation()
  const upsertKerningGroup = useStore((state) => state.upsertKerningGroup)
  const deleteKerningGroup = useStore((state) => state.deleteKerningGroup)
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Box
      borderBottomWidth="1px"
      borderColor="border"
      _last={{ borderBottomWidth: 0 }}
    >
      <HStack
        px={3}
        py={1.5}
        gap={2}
        cursor="pointer"
        _hover={{ bg: 'muted' }}
        onClick={() => setIsExpanded((value) => !value)}
      >
        {isExpanded ? (
          <NavArrowDown width={12} height={12} aria-hidden="true" />
        ) : (
          <NavArrowRight width={12} height={12} aria-hidden="true" />
        )}
        <Text fontSize="xs" fontFamily="mono" flex="1" truncate>
          @{group.name.replace(/^@/, '')}
        </Text>
        {hasDuplicates ? (
          <Box color="orange.500" display="inline-flex">
            <WarningTriangle width={12} height={12} aria-hidden="true" />
          </Box>
        ) : null}
        <Badge colorPalette="gray">{group.glyphs.length}</Badge>
        <Tooltip content={t('editor.kerningDeleteGroup')}>
          <IconButton
            aria-label={t('editor.kerningDeleteGroup')}
            size="xs"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              deleteKerningGroup(group.id)
            }}
          >
            <MinusCircle width={14} height={14} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </HStack>
      {isExpanded ? (
        <KerningGroupEditor
          initialName={group.name}
          initialGlyphs={group.glyphs}
          onCommit={(name, glyphs) => {
            upsertKerningGroup({ id: group.id, side: group.side, name, glyphs })
            setIsExpanded(false)
          }}
          onCancel={() => setIsExpanded(false)}
        />
      ) : null}
    </Box>
  )
}

function KerningGroupEditor({
  initialName = '',
  initialGlyphs = [],
  onCommit,
  onCancel,
}: {
  initialName?: string
  initialGlyphs?: string[]
  onCommit: (name: string, glyphs: string[]) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [glyphsInput, setGlyphsInput] = useState(initialGlyphs.join(' '))

  const glyphs = glyphsInput.split(/[\s,]+/).filter(Boolean)
  const canCommit = name.trim().length > 0

  return (
    <Stack gap={1} px={3} py={2} bg="muted">
      <Input
        size="xs"
        value={name}
        placeholder={t('editor.kerningGroupName')}
        onChange={(event) => setName(event.target.value)}
      />
      <Textarea
        size="xs"
        rows={2}
        value={glyphsInput}
        placeholder={t('editor.kerningGroupGlyphsPlaceholder')}
        fontFamily="mono"
        onChange={(event) => setGlyphsInput(event.target.value)}
      />
      <HStack justify="flex-end" gap={1}>
        <Button size="2xs" variant="outline" onClick={onCancel}>
          {t('editor.cancel')}
        </Button>
        <Button
          size="2xs"
          disabled={!canCommit}
          onClick={() => onCommit(name.trim(), glyphs)}
        >
          {t('editor.save')}
        </Button>
      </HStack>
    </Stack>
  )
}
