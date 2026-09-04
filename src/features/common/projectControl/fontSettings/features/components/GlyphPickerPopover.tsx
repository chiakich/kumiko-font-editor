import {
  Box,
  Button,
  Dialog,
  HStack,
  Input,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FontData, GlyphData } from '@/domain'
import { useStore } from '@/store'
import { GlyphPreview } from '@/features/common/glyphPreview/GlyphPreview'

interface GlyphPickerProps {
  fontData: FontData
  isOpen: boolean
  // What the field currently holds; seeds the search.
  initialQuery: string
  onClose: () => void
  onPick: (glyphId: string) => void
}

const MAX_RESULTS = 24

const glyphChar = (glyph: GlyphData) => {
  const codePoint = Number.parseInt(glyph.unicodes?.[0] ?? '', 16)
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : null
}

// The base a variant hangs off: "comma.vert" → "comma".
const baseOf = (name: string) => name.split('.')[0] ?? name

function GlyphCell({
  glyph,
  fontData,
  emphasized,
  onPick,
}: {
  glyph: GlyphData
  fontData: FontData
  emphasized?: boolean
  onPick: (glyphId: string) => void
}) {
  return (
    <Stack
      as="button"
      gap={1}
      align="center"
      onClick={() => onPick(glyph.id)}
      cursor="pointer"
      width="72px"
    >
      <Box
        width="56px"
        height="56px"
        borderWidth={emphasized ? '2px' : '1px'}
        borderColor={emphasized ? 'yellow.400' : 'controlBorder'}
        borderRadius="md"
        bg="card"
        p={1}
        overflow="hidden"
      >
        <GlyphPreview glyph={glyph} glyphMap={fontData.glyphs} />
      </Box>
      <Text
        fontSize="9px"
        fontFamily="mono"
        color={emphasized ? 'yellow.600' : 'mutedForeground'}
        lineClamp={1}
        maxW="72px"
      >
        {glyph.name ?? glyph.id}
      </Text>
    </Stack>
  )
}

// Search-first glyph picker for rule fields: unencoded glyphs (comma.vert,
// stylistic variants) cannot be typed, so they are chosen here. Variants that
// share the query's base come first — that is the suffix convention at work.
export function GlyphPickerPopover({
  fontData,
  isOpen,
  initialQuery,
  onClose,
  onPick,
}: GlyphPickerProps) {
  const { t } = useTranslation()
  const createGlyphVariant = useStore((store) => store.createGlyphVariant)
  const [query, setQuery] = useState(initialQuery)
  const [variantSuffix, setVariantSuffix] = useState('')

  // The glyph the query names outright — the base a new variant copies from.
  const variantSource = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      return null
    }
    if (fontData.glyphs[trimmed]) {
      return fontData.glyphs[trimmed]
    }
    const codePoints = [...trimmed]
    if (codePoints.length !== 1) {
      return null
    }
    const hex = codePoints[0]
      .codePointAt(0)!
      .toString(16)
      .toUpperCase()
      .padStart(4, '0')
    return (
      Object.values(fontData.glyphs).find(
        (glyph) => glyph.unicodes?.[0]?.toUpperCase() === hex
      ) ?? null
    )
  }, [fontData, query])
  const suffixText = variantSuffix.trim().replace(/^\./, '')
  const variantName = variantSource ? `${variantSource.id}.${suffixText}` : ''
  // The full name must satisfy the glyph-name grammar the copy action checks,
  // or the store will silently refuse to create the glyph.
  const canCreateVariant = Boolean(
    variantSource &&
    /^[A-Za-z0-9_.]+$/.test(suffixText) &&
    /^[A-Za-z_.][A-Za-z0-9_.-]*$/.test(variantName) &&
    !fontData.glyphs[variantName]
  )

  const { variants, matches } = useMemo(() => {
    const glyphs = Object.values(fontData.glyphs)
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) {
      return { variants: [], matches: glyphs.slice(0, MAX_RESULTS) }
    }
    const base = baseOf(trimmed)
    const variantList: GlyphData[] = []
    const matchList: GlyphData[] = []
    for (const glyph of glyphs) {
      const name = (glyph.name ?? glyph.id).toLowerCase()
      const char = glyphChar(glyph)
      const isMatch =
        name.includes(trimmed) ||
        (char !== null && char.toLowerCase() === trimmed) ||
        glyph.unicodes?.some((code) => code.toLowerCase() === trimmed)
      const isVariant =
        baseOf(name) === base || (char !== null && baseOf(name) === trimmed)
      if (isVariant) {
        variantList.push(glyph)
      } else if (isMatch) {
        matchList.push(glyph)
      }
      if (
        variantList.length >= MAX_RESULTS &&
        matchList.length >= MAX_RESULTS
      ) {
        break
      }
    }
    return {
      variants: variantList.slice(0, MAX_RESULTS),
      matches: matchList.slice(0, MAX_RESULTS),
    }
  }, [fontData, query])

  const pick = (glyphId: string) => {
    onPick(glyphId)
    onClose()
  }

  const createVariant = () => {
    if (!canCreateVariant || !variantSource) {
      return
    }
    createGlyphVariant(variantSource.id, variantName)
    // The copy can still fail silently (e.g. unloaded source outlines): only
    // hand the name to the rule field when the glyph really exists now.
    if (useStore.getState().fontData?.glyphs[variantName]) {
      pick(variantName)
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      size="md"
      onOpenChange={(event) => {
        if (!event.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Text textStyle="heading" fontSize="md">
                {t('projectControl.glyphPickerTitle')}
              </Text>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap={4}>
              <Input
                size="sm"
                fontFamily="mono"
                autoFocus
                value={query}
                placeholder={t('projectControl.glyphPickerPlaceholder')}
                onChange={(event) => setQuery(event.target.value)}
              />
              {variants.length > 0 ? (
                <Stack gap={2}>
                  <Text
                    fontSize="10px"
                    letterSpacing="0.1em"
                    fontFamily="mono"
                    color="yellow.600"
                  >
                    {t('projectControl.glyphPickerVariants')}
                  </Text>
                  <HStack gap={2} wrap="wrap">
                    {variants.map((glyph) => (
                      <GlyphCell
                        key={glyph.id}
                        glyph={glyph}
                        fontData={fontData}
                        emphasized={glyph.name !== baseOf(glyph.name ?? '')}
                        onPick={pick}
                      />
                    ))}
                  </HStack>
                </Stack>
              ) : null}
              <Stack gap={2}>
                <Text
                  fontSize="10px"
                  letterSpacing="0.1em"
                  fontFamily="mono"
                  color="mutedForeground"
                >
                  {t('projectControl.glyphPickerMatches', {
                    count: matches.length,
                  })}
                </Text>
                {matches.length === 0 && variants.length === 0 ? (
                  <Text fontSize="xs" color="mutedForeground">
                    {t('projectControl.glyphPickerEmpty')}
                  </Text>
                ) : (
                  <HStack gap={2} wrap="wrap">
                    {matches.map((glyph) => (
                      <GlyphCell
                        key={glyph.id}
                        glyph={glyph}
                        fontData={fontData}
                        onPick={pick}
                      />
                    ))}
                  </HStack>
                )}
              </Stack>
              {variantSource ? (
                <HStack gap={2} wrap="wrap">
                  <Text fontSize="xs" color="mutedForeground">
                    {t('projectControl.glyphPickerCreateVariantFrom', {
                      glyph: variantSource.id,
                    })}
                  </Text>
                  <Text fontSize="xs" fontFamily="mono">
                    {variantSource.id}.
                  </Text>
                  <Input
                    size="2xs"
                    width="96px"
                    fontFamily="mono"
                    value={variantSuffix}
                    placeholder="vert"
                    aria-label={t('projectControl.glyphPickerVariantSuffix')}
                    onChange={(event) => setVariantSuffix(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        createVariant()
                      }
                    }}
                  />
                  <Button
                    size="2xs"
                    variant="outline"
                    disabled={!canCreateVariant}
                    onClick={createVariant}
                  >
                    {t('projectControl.glyphPickerCreateVariant')}
                  </Button>
                  {suffixText && fontData.glyphs[variantName] ? (
                    <Text fontSize="xs" color="orange.500">
                      {t('projectControl.glyphPickerVariantExists')}
                    </Text>
                  ) : null}
                </HStack>
              ) : null}
            </Dialog.Body>
            <Dialog.Footer>
              <Button size="sm" variant="ghost" onClick={onClose}>
                {t('glyphInspector.cancel')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
