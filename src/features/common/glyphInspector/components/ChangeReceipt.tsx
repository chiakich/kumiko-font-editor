import { Box, HStack, Stack, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import {
  barcodeForHash,
  type ChangeReceipt as ChangeReceiptModel,
  type ChangeReceiptLine,
} from 'src/features/common/glyphInspector/utils/changeReceipt'

export type ReceiptFilter = 'all' | 'conflict'

export interface ReceiptStamp {
  label: string
  detail: string
  tone: 'success' | 'error'
}

interface ChangeReceiptProps {
  receipt: ChangeReceiptModel
  voidedKeys: ReadonlySet<string>
  // Omitted once the change has been sent — a shipped receipt is not editable.
  onToggleVoid?: (key: string) => void
  filter: ReceiptFilter
  onFilterChange: (filter: ReceiptFilter) => void
  routeLabel: string
  draftLabel: string
  // Null until a real base or commit sha exists: the barcode encodes an object
  // id, so there is nothing honest to draw without one.
  hash: string | null
  hashLabel: string
  verdict: string
  stamp: ReceiptStamp | null
}

// Paper and ink are one-off shades: the receipt is a physical object, not a
// surface in the app's elevation ladder.
const paper = { bg: '#FFFEFA', _dark: { bg: '#26262A' } }
const ink = { color: '#17181A', _dark: { color: '#DFE2E5' } }
const rule = '1px dashed rgba(11, 15, 17, 0.32)'
const ruleDark = '1px dashed rgba(223, 226, 229, 0.34)'

// Distress the stamp by punching turbulence holes through ink and border alike.
const stampMask =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.62' numOctaves='4' seed='7'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.9 0 0 0 1.32'/%3E%3C/filter%3E%3Crect width='160' height='80' filter='url(%23n)'/%3E%3C/svg%3E\")"

const zigzag = (flipped: boolean) => ({
  height: '8px',
  flexShrink: 0,
  transform: flipped ? 'scaleY(-1)' : undefined,
  backgroundImage:
    'linear-gradient(-45deg, var(--kumiko-receipt-paper) 8px, transparent 0), linear-gradient(45deg, var(--kumiko-receipt-paper) 8px, transparent 0)',
  backgroundRepeat: 'repeat-x',
  backgroundSize: '16px 16px',
})

function ReceiptRow({
  line,
  isVoided,
  onToggleVoid,
}: {
  line: ChangeReceiptLine
  isVoided: boolean
  onToggleVoid?: (key: string) => void
}) {
  const { t } = useTranslation()
  const isConflict = line.status === 'conflict'
  const statusLabel = isVoided
    ? t('gitFlow.receipt.status.voided')
    : t(`gitFlow.receipt.status.${line.status}`)

  return (
    <Box
      as={onToggleVoid ? 'button' : 'div'}
      onClick={onToggleVoid ? () => onToggleVoid(line.key) : undefined}
      position="relative"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={2.5}
      width="100%"
      py={1}
      border="none"
      bg="transparent"
      textAlign="left"
      cursor={onToggleVoid ? 'pointer' : 'default'}
      aria-pressed={onToggleVoid ? !isVoided : undefined}
    >
      {/* one rule straight across the item — a line drawn through it, not a
          per-word strikethrough */}
      {isVoided ? (
        <Box
          position="absolute"
          left="-2px"
          right="-2px"
          top="50%"
          height="1.4px"
          bg="currentColor"
          opacity={0.8}
          aria-hidden="true"
        />
      ) : null}
      <HStack gap={2} minWidth={0} opacity={isVoided ? 0.45 : 1}>
        <Box
          width="14px"
          height="14px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          border="1.2px solid currentColor"
          borderRadius="2px"
          flexShrink={0}
        >
          {isVoided ? null : (
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12.5l5 5L20 6.5" />
            </svg>
          )}
        </Box>
        {line.char ? (
          <Text fontFamily="glyph" fontSize="15px" width="19px" flexShrink={0}>
            {line.char}
          </Text>
        ) : (
          <Text fontSize="15px" width="19px" flexShrink={0} opacity={0.5}>
            ·
          </Text>
        )}
        <Text fontSize="12px" lineClamp={1}>
          {line.label}
        </Text>
      </HStack>
      <Text
        fontSize="10px"
        fontWeight={600}
        letterSpacing="0.04em"
        flexShrink={0}
        opacity={isVoided ? 0.45 : isConflict ? 1 : 0.62}
        color={isConflict && !isVoided ? 'red.700' : undefined}
      >
        {statusLabel}
      </Text>
    </Box>
  )
}

export function ChangeReceipt({
  receipt,
  voidedKeys,
  onToggleVoid,
  filter,
  onFilterChange,
  routeLabel,
  draftLabel,
  hash,
  hashLabel,
  verdict,
  stamp,
}: ChangeReceiptProps) {
  const { t } = useTranslation()
  const visible = (lines: ChangeReceiptLine[]) =>
    filter === 'conflict'
      ? lines.filter((line) => line.status === 'conflict')
      : lines
  const voidedCount = [...receipt.glyphLines, ...receipt.fontLines].filter(
    (line) => voidedKeys.has(line.key)
  ).length
  const sendCount = receipt.totalCount - voidedCount
  const bars = hash ? barcodeForHash(hash) : []
  const isEmpty = receipt.totalCount === 0

  const totals = [
    {
      label: t('gitFlow.receipt.totalItems'),
      value: String(receipt.totalCount),
    },
    {
      label: t('gitFlow.receipt.totalVoided'),
      value: voidedCount > 0 ? `−${voidedCount}` : '0',
    },
    {
      label: t('gitFlow.receipt.totalConflicts'),
      value: String(receipt.conflictCount),
      emphasis: receipt.conflictCount > 0,
    },
  ]

  const groups = [
    {
      label: t('gitFlow.receipt.glyphGroup', {
        count: receipt.glyphLines.length,
      }),
      lines: visible(receipt.glyphLines),
    },
    {
      label: t('gitFlow.receipt.fontGroup', {
        count: receipt.fontLines.length,
      }),
      lines: visible(receipt.fontLines),
    },
  ].filter((group) => group.lines.length > 0)

  const filters: { key: ReceiptFilter; label: string }[] = [
    {
      key: 'all',
      label: `${t('gitFlow.receipt.filterAll')} ${receipt.totalCount}`,
    },
    {
      key: 'conflict',
      label: `${t('gitFlow.receipt.filterConflict')} ${receipt.conflictCount}`,
    },
  ]

  return (
    <Stack gap={2.5} minHeight={0} height="100%">
      <HStack
        justify="space-between"
        gap={2}
        fontFamily="mono"
        fontSize="11px"
        color="mutedForeground"
      >
        <Text>{t('gitFlow.receipt.title')}</Text>
        <HStack gap={2.5}>
          {filters.map((entry) => (
            <Box
              key={entry.key}
              as="button"
              onClick={() => onFilterChange(entry.key)}
              border="none"
              bg="transparent"
              p={0}
              fontFamily="mono"
              fontSize="11px"
              fontWeight={filter === entry.key ? 600 : 400}
              color={filter === entry.key ? 'foreground' : 'mutedForeground'}
              textDecoration={filter === entry.key ? 'underline' : 'none'}
              textUnderlineOffset="3px"
              cursor="pointer"
            >
              {entry.label}
            </Box>
          ))}
        </HStack>
      </HStack>

      <Box
        flexGrow={1}
        minHeight={0}
        overflowY="auto"
        filter="drop-shadow(0 4px 12px rgba(8, 11, 13, 0.12))"
      >
        <Box
          css={{
            '--kumiko-receipt-paper': paper.bg,
            '.dark &': { '--kumiko-receipt-paper': paper._dark.bg },
          }}
        >
          <Box {...zigzag(false)} />
          <Stack
            position="relative"
            gap={0}
            px={4.5}
            pt={1}
            pb={4}
            fontFamily="mono"
            bg={paper.bg}
            color={ink.color}
            _dark={{ bg: paper._dark.bg, color: ink._dark.color }}
          >
            {stamp ? (
              <Stack
                position="absolute"
                left="50%"
                bottom={isEmpty ? '56px' : '112px'}
                align="center"
                gap={0.5}
                px={3.5}
                pt={1.5}
                pb={1}
                border="2.5px solid currentColor"
                borderRadius="sm"
                color={stamp.tone === 'success' ? 'green.700' : 'red.600'}
                opacity={0.86}
                transform="translateX(-50%) rotate(-7deg)"
                style={{ maskImage: stampMask, WebkitMaskImage: stampMask }}
                maskSize="160px 80px"
                aria-hidden="true"
              >
                <Text fontSize="16px" fontWeight={600} letterSpacing="0.14em">
                  {stamp.label}
                </Text>
                <Text fontSize="9px" letterSpacing="0.1em">
                  {stamp.detail}
                </Text>
              </Stack>
            ) : null}

            <Stack align="center" gap={0.5} pt={2.5} pb={3}>
              <Text fontSize="18px" fontWeight={600} letterSpacing="0.1em">
                {t('gitFlow.receipt.masthead')}
              </Text>
              <Text fontSize="10px" opacity={0.62}>
                {routeLabel}
              </Text>
              <Text fontSize="10px" opacity={0.62}>
                {draftLabel}
              </Text>
            </Stack>

            <HStack
              justify="space-between"
              py={1.5}
              borderTop={rule}
              borderBottom={rule}
              _dark={{ borderTop: ruleDark, borderBottom: ruleDark }}
              fontSize="10px"
              letterSpacing="0.08em"
              opacity={0.62}
            >
              <Text>{t('gitFlow.receipt.columnItem')}</Text>
              <Text>{t('gitFlow.receipt.columnStatus')}</Text>
            </HStack>

            {groups.map((group) => (
              <Stack key={group.label} gap={0}>
                <Text
                  pt={2.5}
                  pb={1}
                  fontSize="10px"
                  letterSpacing="0.08em"
                  opacity={0.62}
                >
                  {group.label}
                </Text>
                {group.lines.map((line) => (
                  <ReceiptRow
                    key={line.key}
                    line={line}
                    isVoided={voidedKeys.has(line.key)}
                    onToggleVoid={onToggleVoid}
                  />
                ))}
              </Stack>
            ))}

            {groups.length === 0 ? (
              <Text
                py={7}
                textAlign="center"
                fontSize="11px"
                letterSpacing="0.08em"
                opacity={0.62}
              >
                {isEmpty
                  ? t('gitFlow.receipt.noItems')
                  : t('gitFlow.receipt.noFilterMatch')}
              </Text>
            ) : null}

            <Stack
              gap={1.5}
              mt={3.5}
              pt={2.5}
              borderTop={rule}
              _dark={{ borderTop: ruleDark }}
            >
              {totals.map((total) => (
                <HStack key={total.label} justify="space-between" gap={2.5}>
                  <Text
                    fontSize="11px"
                    opacity={total.emphasis ? 1 : 0.62}
                    fontWeight={total.emphasis ? 600 : 400}
                    color={total.emphasis ? 'red.700' : undefined}
                  >
                    {total.label}
                  </Text>
                  <Text
                    fontSize="11px"
                    opacity={total.emphasis ? 1 : 0.62}
                    fontWeight={total.emphasis ? 600 : 400}
                    color={total.emphasis ? 'red.700' : undefined}
                  >
                    {total.value}
                  </Text>
                </HStack>
              ))}
              <HStack justify="space-between" gap={2.5}>
                <Text fontSize="13px" fontWeight={600}>
                  {t('gitFlow.receipt.totalSending')}
                </Text>
                <Text fontSize="13px" fontWeight={600}>
                  {t('gitFlow.receipt.itemCount', { count: sendCount })}
                </Text>
              </HStack>
            </Stack>

            <Text
              mt={3.5}
              py={2}
              borderTop={rule}
              borderBottom={rule}
              _dark={{ borderTop: ruleDark, borderBottom: ruleDark }}
              textAlign="center"
              fontSize="11px"
              fontWeight={600}
              letterSpacing="0.1em"
            >
              {verdict}
            </Text>

            {bars.length > 0 ? (
              <HStack
                justify="center"
                gap={0}
                align="stretch"
                height="32px"
                mt={4}
              >
                {bars.map((bar, index) => (
                  <Box
                    key={index}
                    width={`${bar.width}px`}
                    bg={bar.ink ? 'currentColor' : 'transparent'}
                  />
                ))}
              </HStack>
            ) : null}
            <Text
              mt={1.5}
              textAlign="center"
              fontSize="9px"
              letterSpacing="0.14em"
              opacity={0.62}
            >
              {hashLabel}
            </Text>
          </Stack>
          <Box {...zigzag(true)} />
        </Box>
      </Box>
    </Stack>
  )
}
