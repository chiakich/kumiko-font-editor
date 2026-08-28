import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GlyphPickerPopover } from 'src/features/common/projectControl/fontSettings/features/components/GlyphPickerPopover'
import { GlyphPreview } from 'src/features/common/glyphPreview/GlyphPreview'
import {
  countGlyphClassReferences,
  createGlyphClass,
  deleteGlyphClass,
  updateGlyphClass,
} from 'src/features/common/projectControl/fontSettings/features/utils/classAuthoring'
import type {
  GlyphClass,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'

interface GlyphClassesViewProps {
  fontData: FontData
  state: OpenTypeFeaturesState
  onStateChange: (next: OpenTypeFeaturesState) => void
}

const MEMBER_PREVIEW_LIMIT = 12

function GlyphClassCard({
  glyphClass,
  fontData,
  state,
  referenceCount,
  onStateChange,
}: {
  glyphClass: GlyphClass
  fontData: FontData
  state: OpenTypeFeaturesState
  referenceCount: number
  onStateChange: (next: OpenTypeFeaturesState) => void
}) {
  const { t } = useTranslation()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const missingMembers = glyphClass.glyphs.filter(
    (glyphId) => !fontData.glyphs[glyphId]
  )
  const membersText = glyphClass.glyphs.join(' ')
  const bareName = glyphClass.name.replace(/^@/, '')

  return (
    <Stack
      gap={2}
      p={3}
      borderWidth="1px"
      borderColor="controlBorder"
      borderRadius="md"
      bg="card"
    >
      <HStack gap={2} wrap="wrap">
        <Text fontFamily="mono" fontSize="sm" color="mutedForeground">
          @
        </Text>
        <Input
          size="xs"
          maxW="220px"
          fontFamily="mono"
          key={bareName}
          defaultValue={bareName}
          aria-label={t('featureWorkspace.className')}
          onBlur={(event) => {
            const next = event.target.value.trim()
            if (next && next !== bareName) {
              onStateChange(
                updateGlyphClass(state, glyphClass.id, { name: next })
              )
            } else {
              event.target.value = bareName
            }
          }}
        />
        <Badge size="sm" variant="outline">
          {t('featureWorkspace.classMemberCount', {
            count: glyphClass.glyphs.length,
          })}
        </Badge>
        {referenceCount > 0 ? (
          <Badge size="sm" variant="subtle">
            {t('featureWorkspace.classReferenceCount', {
              count: referenceCount,
            })}
          </Badge>
        ) : (
          <Badge size="sm" variant="subtle" color="mutedForeground">
            {t('featureWorkspace.classUnused')}
          </Badge>
        )}
        {missingMembers.length > 0 ? (
          <Badge size="sm" colorPalette="orange">
            {t('featureWorkspace.classMissingMembers', {
              count: missingMembers.length,
            })}
          </Badge>
        ) : null}
        <Box flex={1} />
        <Button
          size="2xs"
          variant="ghost"
          onClick={() => setIsPickerOpen(true)}
        >
          {t('featureWorkspace.classAddMember')}
        </Button>
        {isPickerOpen ? (
          <GlyphPickerPopover
            fontData={fontData}
            isOpen={isPickerOpen}
            initialQuery=""
            onClose={() => setIsPickerOpen(false)}
            onPick={(glyphId) =>
              onStateChange(
                updateGlyphClass(state, glyphClass.id, {
                  glyphs: [...glyphClass.glyphs, glyphId],
                })
              )
            }
          />
        ) : null}
        <Button
          size="2xs"
          variant="ghost"
          color="mutedForeground"
          disabled={referenceCount > 0}
          title={
            referenceCount > 0
              ? t('featureWorkspace.classDeleteBlocked')
              : undefined
          }
          onClick={() => {
            const next = deleteGlyphClass(state, glyphClass.id)
            if (next) {
              onStateChange(next)
            }
          }}
        >
          {t('featureWorkspace.classDelete')}
        </Button>
      </HStack>

      {glyphClass.glyphs.length > 0 ? (
        <HStack gap={1} wrap="wrap">
          {glyphClass.glyphs
            .slice(0, MEMBER_PREVIEW_LIMIT)
            .map((glyphId, index) => {
              const glyph = fontData.glyphs[glyphId]
              return (
                <Box
                  key={`${glyphId}_${index}`}
                  width="36px"
                  height="36px"
                  borderWidth="1px"
                  borderColor="controlBorder"
                  borderRadius="sm"
                  title={glyphId}
                >
                  {glyph ? (
                    <GlyphPreview glyph={glyph} glyphMap={fontData.glyphs} />
                  ) : (
                    <Text
                      fontSize="9px"
                      color="orange.500"
                      fontFamily="mono"
                      lineClamp={1}
                      p={1}
                    >
                      {glyphId}
                    </Text>
                  )}
                </Box>
              )
            })}
          {glyphClass.glyphs.length > MEMBER_PREVIEW_LIMIT ? (
            <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
              +{glyphClass.glyphs.length - MEMBER_PREVIEW_LIMIT}
            </Text>
          ) : null}
        </HStack>
      ) : null}

      <Textarea
        size="xs"
        fontFamily="mono"
        rows={2}
        key={membersText}
        defaultValue={membersText}
        aria-label={t('featureWorkspace.classMembers')}
        placeholder={t('featureWorkspace.classMembersPlaceholder')}
        onBlur={(event) => {
          const nextGlyphs = event.target.value.split(/\s+/).filter(Boolean)
          if (nextGlyphs.join(' ') !== membersText) {
            onStateChange(
              updateGlyphClass(state, glyphClass.id, { glyphs: nextGlyphs })
            )
          }
        }}
      />
    </Stack>
  )
}

// Glyph class management: the building block CJK features organize around.
// Classes edited here are the same records rules reference by @name.
export function GlyphClassesView({
  fontData,
  state,
  onStateChange,
}: GlyphClassesViewProps) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  // One pass for all cards; per-card counting is quadratic at CJK scale.
  const referenceCounts = useMemo(
    () => countGlyphClassReferences(state),
    [state]
  )

  const commitNewClass = () => {
    const created = createGlyphClass(state, newName)
    if (!created) {
      return
    }
    setNewName('')
    if (created.state !== state) {
      onStateChange(created.state)
    }
  }

  return (
    <Stack flex={1} minH={0} overflow="auto" p={5} gap={3} maxW="1080px">
      <HStack gap={3} wrap="wrap">
        <Text fontSize="sm" fontWeight={800}>
          {t('featureWorkspace.classesTitle')}
        </Text>
        <Badge size="sm" variant="outline">
          {state.glyphClasses.length}
        </Badge>
        <Box flex={1} />
        <Input
          size="xs"
          maxW="220px"
          fontFamily="mono"
          value={newName}
          placeholder={t('featureWorkspace.classNewPlaceholder')}
          aria-label={t('featureWorkspace.classNew')}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitNewClass()
            }
          }}
        />
        <Button
          size="2xs"
          variant="outline"
          disabled={!newName.trim()}
          onClick={commitNewClass}
        >
          {t('featureWorkspace.classNew')}
        </Button>
      </HStack>

      {state.glyphClasses.length === 0 ? (
        <Text fontSize="xs" color="mutedForeground">
          {t('featureWorkspace.classesEmpty')}
        </Text>
      ) : (
        state.glyphClasses.map((glyphClass) => (
          <GlyphClassCard
            key={glyphClass.id}
            glyphClass={glyphClass}
            fontData={fontData}
            state={state}
            referenceCount={referenceCounts.get(glyphClass.id) ?? 0}
            onStateChange={onStateChange}
          />
        ))
      )}
    </Stack>
  )
}
